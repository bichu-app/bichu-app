/**
 * O trabalho `network.join_request_approved`, no worker.
 *
 * O desfecho vem como VALOR: pedido que sumiu (expurgo, conta apagada) ou que
 * nao esta mais aprovado nao e falha, e reenfileira-lo gastaria a fila contra
 * algo que nunca muda de resposta.
 */
import type {
  EntregaDoAvisoDeAprovacao,
  LeituraDoPedidoAprovado,
  ResultadoDoAvisoDeAprovacao,
} from '../ports/aviso-de-aprovacao.js';

export type DesfechoDoAvisoDeAprovacao =
  | { readonly tipo: 'sem_pedido' }
  | ({ readonly tipo: 'avisado' } & ResultadoDoAvisoDeAprovacao);

export async function avisarPedidoAprovado(
  deps: { readonly pedidos: LeituraDoPedidoAprovado; readonly entrega: EntregaDoAvisoDeAprovacao },
  pedidoId: string,
): Promise<DesfechoDoAvisoDeAprovacao> {
  const pedido = await deps.pedidos.pedidoAprovado(pedidoId);
  if (pedido === null) return { tipo: 'sem_pedido' };
  const resultado = await deps.entrega.avisar(pedido.userId, pedido.tituloDoEncontro);
  return { tipo: 'avisado', ...resultado };
}
