/**
 * O push ao tutor quando o pedido para participar de encontro privado e aprovado
 * (ADR-0027 item 17).
 */
export const TRABALHO_DE_AVISO_DE_APROVACAO = 'network.join_request_approved' as const;

export interface PedidoAprovadoParaAviso {
  readonly userId: string;
  readonly tituloDoEncontro: string;
}

export interface LeituraDoPedidoAprovado {
  /** `null` quando o pedido nao existe mais ou nao esta aprovado: nada a avisar. */
  pedidoAprovado(pedidoId: string): Promise<PedidoAprovadoParaAviso | null>;
}

export interface ResultadoDoAvisoDeAprovacao {
  readonly aceitos: number;
  readonly falhos: number;
  readonly semAparelho: boolean;
}

export interface EntregaDoAvisoDeAprovacao {
  avisar(userId: string, tituloDoEncontro: string): Promise<ResultadoDoAvisoDeAprovacao>;
}
