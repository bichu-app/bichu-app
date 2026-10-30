/** O vocabulario da FILA DE MODERACAO do painel (18/10/2026). */
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import type { DecisaoDaModeracao } from '../../../shared/db/schema.js';

export type { DecisaoDaModeracao };

/** De onde a denuncia veio. */
export type OrigemDaDenuncia = 'review' | 'conversation';

export const ORIGENS: readonly OrigemDaDenuncia[] = ['review', 'conversation'];

export function ehOrigem(valor: string): valor is OrigemDaDenuncia {
  return (ORIGENS as readonly string[]).includes(valor);
}

/** O recorte da fila: na fila, ou ja decidida. */
export type EstadoDaFila = 'open' | 'resolved';

export const ESTADOS: readonly EstadoDaFila[] = ['open', 'resolved'];

export function ehEstado(valor: string): valor is EstadoDaFila {
  return (ESTADOS as readonly string[]).includes(valor);
}

/**
 * O motivo da decisao: 3 a 500, o MESMO par de
 * `professional_reviews.moderation_reason`.
 */
export const MINIMO_DO_MOTIVO = 3;
export const MAXIMO_DO_MOTIVO = 500;

/**
 * Um item da fila, como o servidor o carrega: um ALVO com as denuncias abertas (ou
 * resolvidas) agregadas.
 */
export interface ItemDaFila {
  readonly origem: OrigemDaDenuncia;
  /** O identificador PUBLICO do alvo. */
  readonly targetRef: string;
  /**
   * O nome do local (avaliacao) ou o nome do pet (conversa): o que identifica o
   * alvo.
   */
  readonly assunto: string;
  /** O conteudo denunciado, quando ele e **publicado**. */
  readonly conteudo: string | null;
  /** A nota da avaliacao. Nula na conversa, que nao tem nota. */
  readonly nota: number | null;
  /** O motivo da denuncia MAIS ANTIGA aberta deste alvo. */
  readonly motivo: string;
  /** Os motivos distintos de todas as denuncias deste recorte, para a triagem. */
  readonly motivos: readonly string[];
  /** O que o denunciante escreveu para quem modera. */
  readonly detalhe: string | null;
  /** Quantas denuncias (de pessoas diferentes) este alvo tem neste recorte. */
  readonly reportCount: number;
  /** A soma de `repeat_count`: a insistencia somada. */
  readonly repeatTotal: number;
  readonly primeiraEm: Date;
  readonly ultimaEm: Date;
  /** O conteudo ja esta fora do ar? */
  readonly conteudoRemovido: boolean;
  /** Nula enquanto na fila. */
  readonly decisao: DecisaoDaModeracao | null;
  readonly motivoDaDecisao: string | null;
  readonly decididaEm: Date | null;
}

/** `AdminModerationItem` do contrato. */
export interface ItemProjetado {
  readonly origin: OrigemDaDenuncia;
  readonly target_ref: string;
  readonly subject: string;
  readonly content: string | null;
  readonly rating: number | null;
  readonly reason: string;
  readonly reasons: readonly string[];
  readonly detail: string | null;
  readonly report_count: number;
  readonly repeat_total: number;
  readonly first_reported_at: string;
  readonly last_reported_at: string;
  readonly content_removed: boolean;
  readonly resolution: DecisaoDaModeracao | null;
  readonly resolution_reason: string | null;
  readonly resolved_at: string | null;
}

/** O item como o contrato o declara. */
export function projetarItem(i: ItemDaFila): ItemProjetado {
  return {
    origin: i.origem,
    target_ref: i.targetRef,
    subject: i.assunto,
    content: i.conteudo,
    rating: i.nota,
    reason: i.motivo,
    reasons: i.motivos,
    detail: i.detalhe,
    report_count: i.reportCount,
    repeat_total: i.repeatTotal,
    first_reported_at: i.primeiraEm.toISOString(),
    last_reported_at: i.ultimaEm.toISOString(),
    content_removed: i.conteudoRemovido,
    resolution: i.decisao,
    resolution_reason: i.motivoDaDecisao,
    resolved_at: i.decididaEm === null ? null : i.decididaEm.toISOString(),
  };
}

/** **A MESMA DENUNCIA NAO SE RESOLVE DUAS VEZES.** */
export function erroSeJaResolvido(i: ItemDaFila): ProblemFieldError | null {
  if (i.decisao === null) return null;
  return {
    field: 'resolution',
    code: 'report_already_resolved',
    message:
      i.decisao === 'content_removed'
        ? 'Esta denúncia já foi resolvida: o conteúdo já foi removido, com motivo registrado.'
        : 'Esta denúncia já foi resolvida: ela foi descartada, com motivo registrado.',
  };
}

/** O retrato do item para a trilha. */
export function retratoDoItem(i: ItemDaFila): Record<string, unknown> {
  return {
    origin: i.origem,
    content_removed: i.conteudoRemovido,
    resolution: i.decisao,
    report_count: i.reportCount,
    repeat_total: i.repeatTotal,
    reasons: i.motivos,
  };
}
