/**
 * A varredura dos envios que ninguém confirmou (critério 13 de `BICHUS-87`).
 *
 * O envio direto ao armazenamento tem um custo que o desenho paga de propósito:
 * **nós não sabemos se ele aconteceu.** O cliente pede a autorização, envia (ou
 * não, ou pela metade) e confirma (ou não). Quem nunca confirma deixa para trás
 * uma linha em `upload_intents` (ou em `catalog_upload_intents`, o envio do
 * painel, ADR-0027 A.3) e, possivelmente, um objeto no bucket privado que
 * nenhuma linha de `pet_photos` nem de `catalog_images` referencia.
 *
 * Esse objeto é o pior tipo de lixo que existe num armazenamento cobrado por
 * volume: **invisível**. Ele não aparece em nenhuma tela, não quebra nada, e
 * cresce com cada tutor que trocou de ideia ou ficou sem sinal no meio do envio
 * — que é justamente o caso comum, porque o produto é usado na rua.
 *
 * ## A ordem é objeto primeiro, linha depois
 *
 * Apagar a linha antes do objeto perde o **único ponteiro** que existe para ele:
 * a chave só vive ali. Um objeto sem linha é lixo que ninguém consegue nomear,
 * e o custo de encontrá-lo depois é listar o bucket inteiro e cruzar com o
 * banco.
 *
 * Na ordem certa, a falha é benigna: se o armazenamento recusar a exclusão, a
 * linha fica, e a próxima rodada tenta de novo. O pior caso é tentar de novo; o
 * pior caso da ordem inversa é lixo permanente.
 *
 * ## O QUE ESTA VARREDURA NÃO APAGA, E A DECISÃO QUE DIZ ISSO (17/10/2026)
 *
 * **Nenhum apagamento automático toca informação de perdido ou achado.** Nem
 * esta varredura, nem expiração, nem limpeza de rotina. Decisão do cliente de
 * 17/10/2026, nas palavras dele: *"você só deve apagar as informações, caso o
 * usuário remova o pet ou delete a conta"*. Os dois caminhos legítimos são
 * **ação explícita de pessoa** — o tutor removendo o pet, ou o titular
 * apagando a conta (SEC-019/SEC-020, com o expurgo de 30 dias). Prazo não é
 * ação de pessoa.
 *
 * ### O defeito que esta seção existe para não deixar voltar
 *
 * O comentário de `listarIntencoesVencidas` afirmava que, por só enxergar
 * intenção não confirmada, *"não há risco de apagar o original de uma foto
 * viva"*. **Esse raciocínio produziu o defeito.** Ele valia para os dois casos
 * que quem o escreveu tinha na mesa — a foto de pet e a imagem de catálogo,
 * que **têm** operação de confirmação e portanto deixam esta lista no instante
 * em que viram foto. A foto do achado é o **terceiro caso, e ninguém o
 * considerou**: ela **não tem confirmação no contrato, de propósito**
 * (`app/lib/api/envio_de_foto.dart` registra isso), então `confirmed_at` nunca
 * deixa de ser nulo nela. Julgada pelo mesmo critério, ela vencia e era
 * apagada — **medido duas vezes: subida 01:18:44, apagada 01:29:10; subida
 * 01:33:35, apagada 01:44:10.** Dez minutos, e sempre.
 *
 * A causa não era o filtro: era julgar pelo `confirmed_at` uma foto cujo ciclo
 * de vida não é `confirmed_at`. O ciclo da foto do achado é `sanitize_status`
 * (migração `20261001000006`), e quem o move é a varredura de higiene.
 *
 * ### Por que não um prazo próprio para o achado
 *
 * Porque prazo é apagamento automático, e é exatamente o que a decisão proíbe.
 * O balde cresce, e isso é **aceito e declarado**: no máximo 3 fotos por aviso
 * (`TETO_DE_FOTOS_POR_ACHADO`, SEC-009), cada uma com o original de até 5 MiB
 * (`TETO_DE_BYTES_DO_ENVIO`) e a derivada higienizada de até 500 KB
 * (`TETO_DE_BYTES_DA_DERIVADA`) — teto de ~16,5 MiB por aviso, típico de ~3 MiB
 * com uma foto. Crescimento conhecido é barato; apagar a prova de que alguém
 * viu o animal, não.
 *
 * ### Duas barreiras, e de propósito
 *
 * A consulta já não devolve as espécies do achado. A guarda abaixo recusa de
 * novo, pela espécie que agora viaja na linha. Isso é redundante **hoje** e é o
 * ponto: a barreira que falhou foi a de uma camada só, defendida por um
 * comentário. Se a consulta regredir, `protegidas` sai diferente de zero no log
 * do worker em vez de a foto sair do balde.
 */
import type { Clock } from '../../../shared/ports/index.js';
import type { MediaRepository } from '../ports/media-repository.js';
import type { ObjectStorage } from '../ports/object-storage.js';
import { eDoAchado } from '../ports/fotos-do-achado.js';

/**
 * Quantas por rodada.
 *
 * Cinquenta, e não "todas": cada uma é uma chamada de rede ao armazenamento, e
 * uma varredura que encontrasse dez mil vencidas de uma vez seguraria a conexão
 * de banco e a rede do worker por minutos, competindo com o processamento de
 * foto — que é o trabalho que alguém está esperando. O resto sai na rodada
 * seguinte; não há pressa, porque ninguém está olhando.
 */
const POR_RODADA = 50;

export interface DependenciasDaVarredura {
  readonly repositorio: MediaRepository;
  readonly armazenamento: ObjectStorage;
  readonly clock: Clock;
}

export interface ResultadoDaVarredura {
  readonly examinadas: number;
  readonly removidas: number;
  readonly falhas: number;
  /**
   * Quantas a guarda recusou por serem informação de achado.
   *
   * **Em produção isto é sempre zero**, porque a consulta já as deixou de fora.
   * Diferente de zero significa que a consulta regrediu — é alarme, não
   * estatística, e é por isso que ele tem um nome próprio em vez de somar com
   * `falhas`.
   */
  readonly protegidas: number;
}

export async function varrerEnviosVencidos(
  deps: DependenciasDaVarredura,
): Promise<ResultadoDaVarredura> {
  const agora = deps.clock.now();
  const vencidas = await deps.repositorio.listarIntencoesVencidas(agora, POR_RODADA);

  let removidas = 0;
  let falhas = 0;
  let protegidas = 0;

  for (const intencao of vencidas) {
    // A GUARDA. Nenhum apagamento automático toca foto de achado (decisão de
    // 17/10/2026, no cabeçalho). `continue` e não `throw`: uma linha protegida
    // que vazou da consulta não é motivo para deixar de limpar as outras 49.
    if (eDoAchado(intencao.kind)) {
      protegidas += 1;
      continue;
    }
    try {
      // O `delete` da porta trata 404 como sucesso: o estado desejado é "não
      // existe", e o caso mais comum aqui é justamente o objeto nunca ter
      // chegado. Tratar ausência como erro deixaria a linha presa para sempre.
      await deps.armazenamento.delete('privado', intencao.objectKey);
      await deps.repositorio.descartarIntencao(intencao.id);
      removidas += 1;
    } catch {
      // Uma falha não derruba a rodada: as outras 49 continuam. Esta volta na
      // próxima, porque a linha não foi tocada.
      falhas += 1;
    }
  }

  return { examinadas: vencidas.length, removidas, falhas, protegidas };
}
