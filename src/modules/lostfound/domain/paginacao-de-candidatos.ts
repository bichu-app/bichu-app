/**
 * O cursor e o limite da lista de candidatos.
 *
 * ## Por que ele não é o cursor da conversa
 *
 * `messaging/domain/paginacao.ts` codifica `(created_at, id)`, porque é por
 * instante que uma conversa ordena. A lista de candidatos ordena por **`score`**
 * — é o que o contrato declara em `MatchCandidate.score` (*"Ordena a lista"*) —,
 * e um cursor de instante paginaria uma ordem que a consulta não usa: a segunda
 * página viria de outro lugar da tabela, repetindo e pulando linhas. Reusar
 * aquele módulo também seria um módulo enxergando o domínio de outro (§6).
 *
 * ## O `id` no cursor não é enfeite
 *
 * `score` repete muito: dois achados que bateram nos mesmos atributos pontuam
 * igual, e numa cidade grande isso é a regra, não a exceção. Cursor só de
 * `score` faria a página seguinte começar depois de **todos** os empates ou
 * antes de todos eles — candidato repetido ou candidato pulado. Num caso de pet
 * perdido, o candidato pulado é o que era o pet.
 *
 * ## Cursor ilegível é tratado como ausente
 *
 * Mesma decisão de `messaging`: ele é um valor opaco que o cliente guardou de
 * uma versão anterior do servidor, e responder 400 a quem rola uma lista antiga
 * transformaria compatibilidade em falha de tela. O que não pode é ele virar
 * `NaN` e paginar a tabela inteira — e é isso que a conferência de
 * `Number.isFinite` abaixo impede.
 */

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
