/**
 * A MAQUINA DE ESTADOS DA ENTREGA da plaquinha, e o saneamento do codigo de
 * rastreio.
 */
import type {
  DecisaoDoPedidoDePlaquinha,
  PassoAlcancavelDoPedido,
  PassoDaEntrega,
} from '../ports/pedido-de-plaquinha.js';

/** O teto do codigo de rastreio, e o mesmo numero do `CHECK` do banco. */
export const TAMANHO_MAXIMO_DO_RASTREIO = 64;
/** O piso. Tres simbolos nao e formato de transportadora: e "nao e vazio". */
export const TAMANHO_MINIMO_DO_RASTREIO = 3;

/** As transicoes permitidas, escritas como DADO e nao como cadeia de `if`. */
const TRANSICOES: ReadonlyMap<PassoDaEntrega, readonly PassoDaEntrega[]> = new Map([
  ['requested', ['in_transit'] as const],
  ['in_transit', ['in_transit', 'arrived'] as const],
  ['arrived', ['arrived'] as const],
]);

/**
 * Os passos que a rota aceita como ALVO, como VALOR -- o tipo
 * [PassoAlcancavelDoPedido] mora na porta.
 */
export const PASSOS_ALCANCAVEIS = ['in_transit', 'arrived'] as const satisfies readonly PassoAlcancavelDoPedido[];

/** A transicao e permitida? */
export function transicaoDeEntregaPermitida(de: PassoDaEntrega, para: PassoDaEntrega): boolean {
  return TRANSICOES.get(de)?.includes(para) ?? false;
}

/** O pedido pode ter a entrega mexida? */
export function entregaPodeAndar(status: DecisaoDoPedidoDePlaquinha): boolean {
  return status === 'fulfilled';
}

/** O codigo de rastreio como ele vai para o banco. */
export type RastreioPedido =
  | { readonly tipo: 'manter' }
  | { readonly tipo: 'apagar' }
  | { readonly tipo: 'definir'; readonly codigo: string };

export type SaneamentoDoRastreio =
  | { readonly ok: true; readonly pedido: RastreioPedido }
  | { readonly ok: false; readonly code: 'blank_tracking_code' | 'tracking_code_too_long' };

export function sanearRastreio(bruto: string | null | undefined): SaneamentoDoRastreio {
  if (bruto === undefined) return { ok: true, pedido: { tipo: 'manter' } };
  if (bruto === null) return { ok: true, pedido: { tipo: 'apagar' } };

  const limpo = bruto.trim();
  if (limpo.length < TAMANHO_MINIMO_DO_RASTREIO) return { ok: false, code: 'blank_tracking_code' };
  if (limpo.length > TAMANHO_MAXIMO_DO_RASTREIO) {
    return { ok: false, code: 'tracking_code_too_long' };
  }
  return { ok: true, pedido: { tipo: 'definir', codigo: limpo } };
}
