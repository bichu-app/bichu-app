/**
 * O expurgo definitivo, 30 dias depois do pedido de exclusão.
 *
 * ## Por que existem DUAS operações, e não uma
 *
 * `DELETE /v1/me` não apaga nada. O contrato escreve as duas metades numa frase
 * só — *"Exclusão lógica imediata, expurgo definitivo em 30 dias"* — e cada
 * metade resolve um problema diferente. A imediata devolve à pessoa o efeito
 * que ela pediu no segundo em que pediu: sessões caem, tags param de responder,
 * o endereço de e-mail fica livre. A definitiva cumpre a obrigação do art. 18
 * da LGPD, e ela é adiada porque exclusão é irreversível e engano existe — o
 * ADR-0010 chama o prazo de retenção, e ele também é a janela de socorro de
 * quem clicou errado ou de quem teve a conta tomada e excluída por outra
 * pessoa.
 *
 * ## A parte perigosa é esta, e ela é de banco
 *
 * `DELETE FROM users` é o único comando deste produto que dispara a árvore de
 * cascatas inteira: contas, identidades, credenciais, papéis, tokens, refresh,
 * aparelhos, localização, destinatários de alerta, pets, tags, leituras, fotos,
 * intenções de envio, casos, candidatos, avisos, conversas e mensagens. Em
 * 22/09 a mesma instrução falhou **cinco vezes** por contradição entre a ação de
 * deleção de uma chave estrangeira e uma restrição alcançada por ela, e a
 * quinta não estava dentro de uma tabela: estava entre três (ver o cabeçalho da
 * migração `20260922000005`).
 *
 * Nenhuma dessas falhas aparece em teste unitário — dublê não tem chave
 * estrangeira — e nenhuma aparece em uso normal. É por isso que a prova desta
 * função mora em `tests/integration/expurgo-de-conta-conclui.test.ts`, com massa
 * de verdade e `DELETE` de verdade. **Um teste que afirme apenas "chamou
 * `expurgarConta()`" fica verde com um `23503` esperando na fila.**
 *
 * ## Uma conta por transação
 *
 * O `DELETE` de cada conta é a sua própria transação, e não há uma transação
 * envolvendo a rodada. Uma conta que falhe por qualquer motivo não pode desfazer
 * as que já concluíram, e a rodada não pode parar na primeira: a falha de uma
 * linha viraria uma fila que nunca anda, com o expurgo de todo mundo represado
 * atrás de um único registro problemático. Falha é contada, registrada com o
 * identificador, e a conta volta na rodada seguinte.
 */
import type { Clock } from '../../../shared/time/clock.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { IdentityRepository } from '../ports/identity-repository.js';
import type { AuditLog } from '../../audit/ports/audit-log.js';
import { PRAZO_DE_EXPURGO_EM_MS } from './auth-service.js';

/**
 * Quantas por rodada.
 *
 * Duzentas, e não "todas". Cada uma é um `DELETE` que cascateia por dezoito
 * tabelas; uma rodada que pegasse dez mil contas de uma vez seguraria conexão
 * de banco por minutos, competindo com o processamento de foto — que é o
 * trabalho que alguém está esperando. O resto sai na rodada seguinte, e não há
 * pressa: o prazo é de 30 dias, não de 30 dias e zero minutos.
 */
const POR_RODADA = 200;

export interface DependenciasDoExpurgo {
  readonly repositorio: Pick<IdentityRepository, 'contasAExpurgar' | 'expurgarConta'>;
  readonly trilha: AuditLog;
  readonly clock: Clock;
  /**
   * Apaga os ARQUIVOS da conta do armazenamento de objeto, e devolve quantos
   * saíram (SEC-020).
   *
   * **Função estreita e não a porta de mídia**, pelo mesmo motivo de
   * `removerPushDaConta` em `dependencies.ts`: `identity` não importa `media`, e
   * a fronteira é do ADR-0008. A ligação acontece na composição
   * (`src/bin/worker.ts`), delegando a `criarApagadorDeObjetosDaConta`.
   *
   * **Obrigatória, e não opcional.** Um campo opcional deixaria a composição que
   * esquecesse dele apagar a conta do banco e deixar as fotos no balde, em
   * silêncio — que é literalmente o defeito SEC-020 voltando pela fiação.
   */
  readonly apagarObjetosDaConta: (dono: UserId) => Promise<number>;
}

export interface ResultadoDoExpurgo {
  readonly examinadas: number;
  readonly expurgadas: number;
  readonly falhas: number;
}

export async function expurgarContasExcluidas(
  deps: DependenciasDoExpurgo,
): Promise<ResultadoDoExpurgo> {
  const agora = deps.clock.now();
  const vencidas = await deps.repositorio.contasAExpurgar(
    (agora - PRAZO_DE_EXPURGO_EM_MS) as Instant,
    POR_RODADA,
  );

  let expurgadas = 0;
  let falhas = 0;

  for (const userId of vencidas) {
    try {
      // OBJETO PRIMEIRO, LINHA DEPOIS (SEC-020).
      //
      // A ordem não é escolha: é a regra que `varrer-envios-vencidos.ts` já
      // escreveu, e a única novidade é que este expurgo não a seguia. As chaves
      // dos objetos só vivem dentro das linhas que a cascata apaga
      // (`upload_intents.object_key`, `pet_photos.original_key`, `thumb_key`,
      // `card_key`, `conversation_messages.photo_object_key`), então o `DELETE`
      // destrói o único ponteiro que existia para o arquivo.
      //
      // Morrendo entre as duas metades, os resíduos são assimétricos e por isso
      // a ordem importa: nesta, sobra linha apontando para objeto ausente numa
      // conta que ninguém autentica (`autenticar()` recusa status != 'active'),
      // e a rodada seguinte termina o serviço. Na inversa, sobra objeto sem
      // ponteiro, que só uma varredura do balde inteiro encontraria -- e não
      // existe varredura de órfãos em lugar nenhum deste repositório.
      //
      // A falha aqui cai no `catch` de baixo, conta como falha e **não** apaga
      // as linhas. É o desejado: a conta volta na rodada seguinte com os
      // ponteiros de pé.
      const objetosApagados = await deps.apagarObjetosDaConta(userId);
      const apagou = await deps.repositorio.expurgarConta(userId);
      if (apagou) expurgadas += 1;
      // A trilha entra DEPOIS do `DELETE`, e pode: `audit.events` não tem chave
      // estrangeira para `users`, de propósito. O evento é a única
      // memória de que aquela conta existiu e de quando ela deixou de existir,
      // e é ela que torna o prazo do ADR-0010 verificável por alguém de fora.
      await deps.trilha.record({
        actorKind: 'system',
        correlationId: `purge:${userId}`,
        action: 'privacy.account_purged',
        resourceKind: 'user',
        resourceId: userId,
        // `objects_deleted` entra junto de `deleted_rows` e não no lugar dele:
        // são dois subsistemas, e um evento que só contasse linhas foi
        // exatamente o que fez o apagamento de BANCO ser lido como apagamento
        // de DADO PESSOAL por meses.
        //
        // O nome é `objects_deleted` e não algo como `fully_erased`: o objeto
        // saiu da nossa origem, e uma cópia em cache intermediário pode
        // permanecer alcançável a quem tenha o endereço exato por até 12 meses
        // (ADR-0014, `max-age=31536000, immutable`, sem operação de
        // invalidação). Esta linha não pode afirmar mais do que aconteceu.
        metadata: { deleted_rows: apagou ? 1 : 0, objects_deleted: objetosApagados },
      });
    } catch (erro: unknown) {
      // `catch` que engole a exceção e **não** a silencia. Sem esta linha, a
      // sexta ocorrência da classe de 22/09 seria um worker que roda a cada 15
      // minutos, falha em silêncio, e deixa a conta de alguém no banco por
      // meses depois do prazo que a política promete.
      falhas += 1;
      console.error(
        JSON.stringify({
          evento: 'privacy.account_purge_failed',
          user_id: userId,
          erro: erro instanceof Error ? erro.message : String(erro),
          codigo: (erro as { code?: unknown }).code,
        }),
      );
    }
  }

  return { examinadas: vencidas.length, expurgadas, falhas };
}
