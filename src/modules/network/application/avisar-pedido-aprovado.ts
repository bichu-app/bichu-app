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
