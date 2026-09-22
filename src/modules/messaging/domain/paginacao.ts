/**
 * O cursor das duas coleções da conversa.
 *
 * Ele codifica o instante e o id da última linha entregue. O id é necessário e
 * não é enfeite: duas mensagens gravadas no mesmo milissegundo com um cursor só
 * de tempo fariam a página seguinte pular uma delas ou repeti-la, e num canal
 * em que as duas pessoas estão combinando onde se encontrar agora, a mensagem
 * pulada é a que dizia o ponto de encontro.
 *
 * ## A costura com a BICHUS-41, dita aqui porque é aqui que ela mora
 *
 * **Este cursor não serve ao achador sem conta.** Ele carrega `Message.id`, e o
 * critério 8 da BICHUS-41 manda omitir esse campo da vista do achador — o
 * schema `FinderMessage` nasceu sem `id` exatamente para não entregar
 * identificador interno a quem não tem conta (ADR-0010, item 6). Quando aquela
 * história construir `GET /v1/finder/conversation`, o cursor dela precisa de
 * outra codificação: um valor opaco que o servidor saiba decodificar e que não
 * carregue o UUID. A alternativa preguiçosa — reusar este — publicaria o
 * identificador pela porta do lado, num campo que ninguém inspeciona porque
 * "cursor é opaco".
 */

import { comoData } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';

/** O teto do contrato para `limit`. Servidor impõe; cliente pede. */
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

/**
 * Decodifica, ou devolve `undefined`.
 *
 * Cursor ilegível é tratado como ausente, e não como erro: ele é um valor
 * opaco que o cliente guardou de uma versão anterior do servidor, e responder
 * 400 a quem rola uma lista antiga seria transformar compatibilidade em falha
 * de tela. O que não pode é ele virar `NaN` e paginar a tabela inteira.
 */
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
  // `Date.parse` e `comoData`, e não `new Date(texto)`: a regra de lint proíbe
  // `new Date` em `domain/` para manter o relógio de parede fora daqui, e ela
  // está certa mesmo neste caso, em que o valor vem do cliente. O caminho
  // declarado para converter instante em `Date` é `shared/time/clock.ts`.
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
