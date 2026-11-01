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
            }),
          };
        } catch (erro: unknown) {
          if (erro instanceof VazamentoNoPushError) {
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
