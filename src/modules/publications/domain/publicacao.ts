import { comoInstante, comoIso } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';

/** 280, e o número tem dono: `publication_reports.publication_body` já o cobrava. */
export const TETO_DO_CORPO_DA_PUBLICACAO = 280;

/** A faixa do rótulo de leitor de tela. */
export const PISO_DO_TEXTO_ALTERNATIVO = 2;
export const TETO_DO_TEXTO_ALTERNATIVO = 150;

/** Quantas publicações uma página de linha do tempo traz quando ninguém pede. */
export const PAGINA_PADRAO_DA_LINHA_DO_TEMPO = 20;

/** O teto por página. O mesmo do parâmetro `Limit` do contrato. */
export const PAGINA_MAXIMA_DA_LINHA_DO_TEMPO = 50;

/** Um campo que a borda recusa, na forma que `problemas.validacao` recebe. */
export interface CampoRecusado {
  readonly field: string;
  readonly code: string;
  readonly message?: string;
}

/** A publicação pedida, já conferida e pronta para gravar. */
export interface PublicacaoConferida {
  readonly corpo: string;
  readonly uploadId: string | null;
  readonly textoAlternativo: string | null;
}

/** O corpo de `createPublication`, como o contrato o declara. */
export interface PublicacaoPedida {
  readonly body?: unknown;
  readonly upload_id?: unknown;
  readonly alt_text?: unknown;
}

/** Confere a publicação pedida e devolve o que gravar, ou a lista de recusas. */
export function conferirPublicacaoPedida(
  pedida: PublicacaoPedida,
): { readonly ok: PublicacaoConferida } | { readonly recusas: readonly CampoRecusado[] } {
  const recusas: CampoRecusado[] = [];

  const corpo = typeof pedida.body === 'string' ? pedida.body.trim() : '';
  if (corpo === '') {
    recusas.push({
      field: 'body',
      code: 'required',
      message: 'Escreva uma mensagem.',
    });
  } else if ([...corpo].length > TETO_DO_CORPO_DA_PUBLICACAO) {
    recusas.push({
      field: 'body',
      code: 'maximum',
      message: `No máximo ${String(TETO_DO_CORPO_DA_PUBLICACAO)} caracteres.`,
    });
  }

  const uploadId = typeof pedida.upload_id === 'string' && pedida.upload_id !== '' ? pedida.upload_id : null;

  const textoAlternativo =
    typeof pedida.alt_text === 'string' && pedida.alt_text.trim() !== ''
      ? pedida.alt_text.trim()
      : null;

  if (textoAlternativo !== null) {
    if (uploadId === null) {
      recusas.push({
        field: 'alt_text',
        code: 'conflict',
        message: 'A descrição da foto só vale com uma foto.',
      });
    }
    const tamanho = [...textoAlternativo].length;
    if (tamanho < PISO_DO_TEXTO_ALTERNATIVO || tamanho > TETO_DO_TEXTO_ALTERNATIVO) {
      recusas.push({
        field: 'alt_text',
        code: tamanho < PISO_DO_TEXTO_ALTERNATIVO ? 'minimum' : 'maximum',
        message: `Entre ${String(PISO_DO_TEXTO_ALTERNATIVO)} e ${String(TETO_DO_TEXTO_ALTERNATIVO)} caracteres.`,
      });
    }
  }

  if (recusas.length > 0) return { recusas };
  return { ok: { corpo, uploadId, textoAlternativo } };
}

/** O corpo de `commentOnPublication`. */
export interface ComentarioPedido {
  readonly body?: unknown;
}

/** Confere o comentário pedido. */
export function conferirComentarioPedido(
  pedido: unknown,
): { readonly ok: string } | { readonly recusas: readonly CampoRecusado[] } {
  const corpo =
    typeof (pedido as ComentarioPedido | null)?.body === 'string'
      ? ((pedido as ComentarioPedido).body as string).trim()
      : '';
  if (corpo === '') {
    return {
      recusas: [{ field: 'body', code: 'required', message: 'Escreva um comentário.' }],
    };
  }
  if ([...corpo].length > TETO_DO_CORPO_DA_PUBLICACAO) {
    return {
      recusas: [
        {
          field: 'body',
          code: 'maximum',
          message: `No máximo ${String(TETO_DO_CORPO_DA_PUBLICACAO)} caracteres.`,
        },
      ],
    };
  }
  return { ok: corpo };
}

/** O cursor da linha do tempo: **o instante e o `ref` público da última linha.** */
export interface CursoDaLinhaDoTempo {
  /** O instante da última linha da página anterior. */
  readonly antesDe: Instant;
  readonly ref: string;
}

const SEPARADOR_DO_CURSOR = '|';

export function escreverCursor(curso: CursoDaLinhaDoTempo): string {
  return Buffer.from(
    `${comoIso(curso.antesDe)}${SEPARADOR_DO_CURSOR}${curso.ref}`,
    'utf8',
  ).toString('base64url');
}

/** Lê o cursor, ou `undefined` quando ele não tem a forma. */
export function lerCursor(texto: string): CursoDaLinhaDoTempo | undefined {
  let bruto: string;
  try {
    bruto = Buffer.from(texto, 'base64url').toString('utf8');
  } catch {
    return undefined;
  }
  const corte = bruto.indexOf(SEPARADOR_DO_CURSOR);
  if (corte <= 0) return undefined;
  const instante = bruto.slice(0, corte);
  const ref = bruto.slice(corte + 1);
  if (!/^[A-Za-z0-9_-]{22}$/.test(ref)) return undefined;
  const quando = comoInstante(instante);
  if (quando === undefined) return undefined;
  return { antesDe: quando, ref };
}

/** O limite pedido, dentro da faixa. */
export function conferirLimite(pedido: unknown): { readonly limite: number } | { readonly recusa: CampoRecusado } {
  if (pedido === undefined || pedido === null || pedido === '') {
    return { limite: PAGINA_PADRAO_DA_LINHA_DO_TEMPO };
  }
  const numero = typeof pedido === 'number' ? pedido : Number(pedido);
  if (
    !Number.isInteger(numero) ||
    numero < 1 ||
    numero > PAGINA_MAXIMA_DA_LINHA_DO_TEMPO
  ) {
    return {
      recusa: {
        field: 'limit',
        code: 'maximum',
        message: `Entre 1 e ${String(PAGINA_MAXIMA_DA_LINHA_DO_TEMPO)}.`,
      },
    };
  }
  return { limite: numero };
}
