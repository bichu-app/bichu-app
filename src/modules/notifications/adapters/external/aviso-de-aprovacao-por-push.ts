/**
 * A entrega do aviso de pedido aprovado (Rede, ADR-0027 item 17) a cada
 * aparelho da conta, pelo mesmo remetente e a mesma porteira do alerta.
 *
 * O token e resolvido no instante do envio, e o aparelho que o transporte diz
 * que sumiu e revogado na hora, pelo servico (que grava a trilha), como no
 * alerta de vizinhanca.
 */
import { montarAvisoDePedidoAprovado, VazamentoNoPushError } from '../../domain/conteudo-do-push.js';
import { PushNaoEnviadoError, type PushSender, type TokenDeAparelho } from '../../ports/push-sender.js';
import type { RegistroDeAparelhos } from '../../ports/registro-de-aparelhos.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type {
  EntregaDoAvisoDeAprovacao,
  ResultadoDoAvisoDeAprovacao,
} from '../../../network/ports/aviso-de-aprovacao.js';

export interface DependenciasDoAvisoDeAprovacao {
  readonly aparelhos: Pick<RegistroDeAparelhos, 'listarDoDono' | 'enderecoDeEnvio'>;
  readonly push: PushSender;
  readonly revogarPorTokenRecusado: (token: TokenDeAparelho) => Promise<boolean>;
}

export function criarAvisoDeAprovacaoPorPush(deps: DependenciasDoAvisoDeAprovacao): EntregaDoAvisoDeAprovacao {
  return {
    async avisar(userId, tituloDoEncontro): Promise<ResultadoDoAvisoDeAprovacao> {
      let conteudo;
      try {
        conteudo = montarAvisoDePedidoAprovado(tituloDoEncontro);
      } catch (erro: unknown) {
        if (erro instanceof VazamentoNoPushError) {
          console.error(
            JSON.stringify({ evento: 'network.approval_push_bloqueado', campo: erro.campo, padrao: erro.padrao }),
          );
          return { aceitos: 0, falhos: 1, semAparelho: false };
        }
        throw erro;
      }
      const aparelhos = await deps.aparelhos.listarDoDono(userId as UserId);
      let aceitos = 0;
      let falhos = 0;
      for (const aparelho of aparelhos) {
        const token = await deps.aparelhos.enderecoDeEnvio(aparelho.id);
        if (token === null) continue;
        try {
          const resultado = await deps.push.enviar({ token, ...conteudo });
          if (resultado === 'aparelho-sumiu') {
            await deps.revogarPorTokenRecusado(token);
            continue;
          }
          aceitos += 1;
        } catch (erro: unknown) {
          if (!(erro instanceof PushNaoEnviadoError)) throw erro;
          falhos += 1;
          console.error(
            JSON.stringify({ evento: 'network.approval_push_nao_enviado', motivo: erro.motivo, retentavel: erro.retentavel }),
          );
        }
      }
      return { aceitos, falhos, semAparelho: aparelhos.length === 0 };
    },
  };
}
