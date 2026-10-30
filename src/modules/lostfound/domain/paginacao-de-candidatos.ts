/** O teto do contrato para `limit` (`components/parameters/Limit`). */
export const LIMITE_MAXIMO_DE_CANDIDATOS = 50;
export const LIMITE_PADRAO_DE_CANDIDATOS = 20;

export interface PosicaoDoCandidato {
  readonly score: number;
  readonly id: string;
}

const SEPARADOR = '|';

export function codificarCursorDeCandidato(posicao: PosicaoDoCandidato): string {
  return Buffer.from(
    `${String(posicao.score)}${SEPARADOR}${posicao.id}`,
    'utf8',
  ).toString('base64url');
}

export function decodificarCursorDeCandidato(
  cursor: string | undefined,
): PosicaoDoCandidato | undefined {
  if (cursor === undefined || cursor === '') return undefined;
  let cru: string;
  try {
    cru = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    return undefined;
  }
  const corte = cru.indexOf(SEPARADOR);
  if (corte <= 0) return undefined;
  const score = Number(cru.slice(0, corte));
  const id = cru.slice(corte + SEPARADOR.length);
  if (!Number.isFinite(score) || id === '') return undefined;
  return { score, id };
}

/** O `limit` pedido, preso entre 1 e o teto do servidor. */
export function limiteEfetivoDeCandidatos(pedido: number | undefined): number {
  if (pedido === undefined || !Number.isFinite(pedido)) return LIMITE_PADRAO_DE_CANDIDATOS;
  return Math.min(LIMITE_MAXIMO_DE_CANDIDATOS, Math.max(1, Math.trunc(pedido)));
}
