import {
  montarMensagemDePush,
  VazamentoNoPushError,
} from '../../domain/conteudo-do-push.js';
import { PushNaoEnviadoError, type PushSender, type TokenDeAparelho } from '../../ports/push-sender.js';
import type { RegistroDeAparelhos } from '../../ports/registro-de-aparelhos.js';
import type {
  AvisoDeVizinhanca,
  EntregaDoAlerta,
  ResultadoDaEntrega,
} from '../../../lostfound/ports/entrega-do-alerta.js';

const ESPECIE_POR_EXTENSO: Readonly<Record<string, string>> = {
  dog: 'cão',
  cat: 'gato',
};

export interface DependenciasDaEntregaDoAlerta {
  /** Só `enderecoDeEnvio`: este caminho não lista, não registra e não remove. */
  readonly aparelhos: Pick<RegistroDeAparelhos, 'enderecoDeEnvio'>;
  readonly push: PushSender;
  /** A revogação **pelo serviço**, e não pelo repositório. */
  readonly revogarPorTokenRecusado: (token: TokenDeAparelho) => Promise<boolean>;
}

export function criarEntregaDoAlertaPorPush(
  deps: DependenciasDaEntregaDoAlerta,
): EntregaDoAlerta {
  return {
    async avisar(aviso: AvisoDeVizinhanca): Promise<ResultadoDaEntrega> {
      const token = await deps.aparelhos.enderecoDeEnvio(aviso.aparelhoId);
      if (token === null) return 'semEndereco';

      let mensagem;
      try {
        const conteudo = montarMensagemDePush({
          tipo: 'alertaDeVizinhanca',
          token,
          nomeDoPet: aviso.nomeDoPet,
          tokenPublico: aviso.tokenPublico,
          ...(aviso.bairro === null ? {} : { bairro: aviso.bairro }),
          ...(aviso.especieCodigo === null
            ? {}
            : { especie: ESPECIE_POR_EXTENSO[aviso.especieCodigo] ?? 'pet' }),
          ...(aviso.imagemUrl === undefined ? {} : { imagemUrl: aviso.imagemUrl }),
        });
        mensagem = {
          token,
          ...conteudo,
          ...(aviso.imagemUrl === undefined ? {} : { imagemUrl: aviso.imagemUrl }),
        };
      } catch (erro: unknown) {
        if (erro instanceof VazamentoNoPushError) {
          console.error(
            JSON.stringify({
              evento: 'alert.push_bloqueado',
              campo: erro.campo,
              padrao: erro.padrao,
            }),
          );
          return 'falhou';
        }
        throw erro;
      }

      try {
        const resultado = await deps.push.enviar(mensagem);
        if (resultado === 'aparelho-sumiu') {
          await deps.revogarPorTokenRecusado(token);
          return 'aparelhoSumiu';
        }
        return 'aceito';
      } catch (erro: unknown) {
        if (erro instanceof PushNaoEnviadoError) {
          console.error(
            JSON.stringify({
              evento: 'alert.push_nao_enviado',
              motivo: erro.motivo,
              retentavel: erro.retentavel,
            }),
          );
          return 'falhou';
        }
        throw erro;
      }
    },
  };
}
