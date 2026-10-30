import { comoData } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';

/** O teto do contrato para `limit`. */
export const LIMITE_MAXIMO = 50;
export const LIMITE_PADRAO = 20;

export interface PosicaoDoCursor {
  readonly criadaEm: Date;
  readonly id: string;
}

const SEPARADOR = '|';

export function codificarCursor(posicao: PosicaoDoCursor): string {
  return Buffer.from(
    `${posicao.criadaEm.toISOString()}${SEPARADOR}${posicao.id}`,
    'utf8',
  ).toString('base64url');
}

/** Decodifica, ou devolve `undefined`. */
export function decodificarCursor(cursor: string | undefined): PosicaoDoCursor | undefined {
  if (cursor === undefined || cursor === '') return undefined;
  let cru: string;
  try {
    cru = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    return undefined;
  }
  const corte = cru.indexOf(SEPARADOR);
  if (corte <= 0) return undefined;
  const milissegundos = Date.parse(cru.slice(0, corte));
  const id = cru.slice(corte + SEPARADOR.length);
  if (Number.isNaN(milissegundos) || id === '') return undefined;
  return { criadaEm: comoData(milissegundos as Instant), id };
}

/** O `limit` pedido, preso entre 1 e o teto do servidor. */
export function limiteEfetivo(pedido: number | undefined): number {
  if (pedido === undefined || !Number.isFinite(pedido)) return LIMITE_PADRAO;
  return Math.min(LIMITE_MAXIMO, Math.max(1, Math.trunc(pedido)));
}
