/**
 * A entrega do aviso `tagEscaneada` a cada aparelho do TUTOR, pelo mesmo
 * remetente e a mesma porteira do alerta de vizinhanca.
 *
 * ## O emissor que faltava
 *
 * `montarMensagemDePush` conhece `tagEscaneada` desde a BICHUS-91 e **nunca
 * foi chamado com essa chave em producao**: o unico chamador
 * (`entrega-do-alerta-por-push.ts`) fixa `alertaDeVizinhanca`. Este arquivo e
 * o emissor. Ele nao cria esteira nova — reusa `PushSender`,
 * `RegistroDeAparelhos.enderecoDeEnvio` e a revogacao por token recusado,
 * exatamente como a entrega do alerta e a da aprovacao da `Rede`.
 *
 * ## O que NAO entra no payload, medido e nao suposto
 *
 * - **Nada de lugar.** `bairro` nao e passado, nem nulo nem vazio: o
 *   escaneamento nao resolve localizacao neste caminho e `onde()` ja devolve
 *   string vazia para ausente. O produto mostra BAIRRO na tela do caso; o push
 *   aparece na tela de bloqueio e e mais pobre de proposito.
 * - **Nada do achador.** Nem nome, nem recado, nem foto. O achador e visto
 *   dentro da conversa mediada.
 * - **`ref` so quando existe caso aberto.** Sem caso, `tokenPublico` e string
 *   vazia: o pet nao tem chave publica opaca propria e `pets.id` e UUID
 *   interno, que o ADR-0010 item 6 proibe em superficie publica.
 *
 * ## A consequencia de `ref` vazio, escrita em voz alta
 *
 * `chaveDeAgrupamento` e `tagEscaneada:${tokenPublico}`. Com dois pets do
 * MESMO tutor escaneados enquanto nenhum dos dois esta marcado como perdido, as
 * duas chaves ficam iguais (`tagEscaneada:`) e o segundo aviso substitui o
 * primeiro na bandeja. **Isso e perda real e esta aqui por escrito em vez de
 * ser descoberta depois.** Consertar exige uma chave opaca por pet ou por
 * aviso, que hoje nao existe no esquema; a rede de seguranca por e-mail cobre
 * o aviso substituido, e e por isso que ela nao e enfeite.
 */
import {
  montarMensagemDePush,
  VazamentoNoPushError,
} from '../../domain/conteudo-do-push.js';
import {
  PushNaoEnviadoError,
  type PushSender,
  type TokenDeAparelho,
} from '../../ports/push-sender.js';
import type { RegistroDeAparelhos } from '../../ports/registro-de-aparelhos.js';
import type {
  AvisoAoTutorParaEntrega,
  EntregaDoAvisoAoTutor,
  ResultadoDoAvisoAoTutor,
} from '../../../tags/ports/aviso-ao-tutor.js';

export interface DependenciasDoAvisoAoTutor {
  readonly aparelhos: Pick<RegistroDeAparelhos, 'listarDoDono' | 'enderecoDeEnvio'>;
  readonly push: PushSender;
  readonly revogarPorTokenRecusado: (token: TokenDeAparelho) => Promise<boolean>;
}

export function criarAvisoAoTutorPorPush(
  deps: DependenciasDoAvisoAoTutor,
): EntregaDoAvisoAoTutor {
  return {
    async avisar(aviso: AvisoAoTutorParaEntrega): Promise<ResultadoDoAvisoAoTutor> {
      const aparelhos = await deps.aparelhos.listarDoDono(aviso.donoUserId);
      let aceitos = 0;
      let falhos = 0;

      for (const aparelho of aparelhos) {
        // **No instante do envio**, e nao carregado junto da lista: entre
        // enfileirar e entregar a pessoa pode ter saido da conta.
        const token = await deps.aparelhos.enderecoDeEnvio(aparelho.id);
        if (token === null) continue;

        let mensagem;
        try {
          mensagem = {
            token,
            ...montarMensagemDePush({
              tipo: 'tagEscaneada',
              token,
              nomeDoPet: aviso.nomeDoPet,
              tokenPublico: aviso.tokenPublicoDoCaso ?? '',
              casoAberto: aviso.casoAberto,
              // `bairro` e `imagemUrl` ficam de fora de proposito. Ver o
              // cabecalho: push de plaquinha nao leva lugar.
            }),
          };
        } catch (erro: unknown) {
          if (erro instanceof VazamentoNoPushError) {
            // O campo e o padrao, NUNCA o valor — ele e exatamente o dado que
            // a porteira acabou de impedir de sair. Um pet chamado "Rua" cai
            // aqui, e a troca esta justificada em `conteudo-do-push.ts`.
            console.error(
              JSON.stringify({
                evento: 'tag.scan_push_bloqueado',
                campo: erro.campo,
                padrao: erro.padrao,
              }),
            );
            falhos += 1;
            continue;
          }
          throw erro;
        }

        try {
          const resultado = await deps.push.enviar(mensagem);
          if (resultado === 'aparelho-sumiu') {
            await deps.revogarPorTokenRecusado(token);
            continue;
          }
          aceitos += 1;
        } catch (erro: unknown) {
          if (!(erro instanceof PushNaoEnviadoError)) throw erro;
          falhos += 1;
          // O token nao entra no log: ele identifica uma instalacao e e o
          // endereco para onde mandar qualquer coisa.
          console.error(
            JSON.stringify({
              evento: 'tag.scan_push_nao_enviado',
              motivo: erro.motivo,
              retentavel: erro.retentavel,
            }),
          );
        }
      }

      return { aceitos, falhos, semAparelho: aparelhos.length === 0 };
    },
  };
}
