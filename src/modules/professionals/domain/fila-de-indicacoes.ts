/**
 * A FILA DE REVISAO das indicacoes do `Perto`, do lado do dominio: o tipo que o
 * servidor carrega, a projecao que o painel ve, e a unica regra de transicao.
 */
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import type { TipoDeEntidade, TipoDeProfissional } from './entrada-do-diretorio.js';
import type { TipoDeContatoPublico } from './sugestao-do-diretorio.js';

/** O `CHECK` `directory_suggestions_revisao_conhecida` (`20261017000004`). */
export type RevisaoDaIndicacao = 'pending' | 'approved' | 'declined';

/** O teto do motivo da recusa: o mesmo do recado da indicacao. */
export const MINIMO_DO_MOTIVO = 2;
export const MAXIMO_DO_MOTIVO = 280;

/** Uma indicacao como o servidor a carrega. */
export interface IndicacaoNaFila {
  readonly ref: string;
  readonly displayName: string;
  readonly kind: TipoDeProfissional;
  /** O QUE a entidade indicada E -- eixo SEPARADO de `kind` (cliente, 29/10/2026). */
  readonly entityKind: TipoDeEntidade;
  readonly city: string;
  readonly state: string;
  readonly neighborhood: string | null;
  readonly contatoKind: TipoDeContatoPublico;
  readonly contatoValue: string;
  /** O recado PARA QUEM REVISA. */
  readonly note: string | null;
  readonly reviewStatus: RevisaoDaIndicacao;
  readonly createdAt: Date;
  readonly decidedAt: Date | null;
  readonly declineReason: string | null;
  /** O `slug` da entrada que a aprovacao produziu, ou da que ja existia. */
  readonly entradaSlug: string | null;
}

/** `AdminDirectorySuggestion` do contrato. */
export interface IndicacaoProjetada {
  readonly reference: string;
  readonly display_name: string;
  readonly kind: TipoDeProfissional;
  /** O QUE a entidade E. O revisor precisa dele para aprovar com o tipo certo. */
  readonly entity_kind: TipoDeEntidade;
  readonly city: string;
  readonly state: string;
  readonly neighborhood: string | null;
  readonly public_contact: { readonly kind: TipoDeContatoPublico; readonly value: string };
  readonly note: string | null;
  readonly review_status: RevisaoDaIndicacao;
  readonly created_at: string;
  readonly decided_at: string | null;
  readonly decline_reason: string | null;
  readonly entry_slug: string | null;
}

/** A projecao. */
export function projetarIndicacao(i: IndicacaoNaFila): IndicacaoProjetada {
  return {
    reference: i.ref,
    display_name: i.displayName,
    kind: i.kind,
    entity_kind: i.entityKind,
    city: i.city,
    state: i.state,
    neighborhood: i.neighborhood,
    public_contact: { kind: i.contatoKind, value: i.contatoValue },
    note: i.note,
    review_status: i.reviewStatus,
    created_at: i.createdAt.toISOString(),
    decided_at: i.decidedAt === null ? null : i.decidedAt.toISOString(),
    decline_reason: i.declineReason,
    entry_slug: i.entradaSlug,
  };
}

/** A UNICA transicao que esta fila conhece: so `pending` recebe decisao. */
export function erroSeJaDecidida(i: IndicacaoNaFila): ProblemFieldError | null {
  if (i.reviewStatus === 'pending') return null;
  return {
    field: 'review_status',
    code: 'suggestion_not_pending',
    message:
      i.reviewStatus === 'approved'
        ? 'Esta indicação já foi aprovada, e a entrada do diretório já existe.'
        : 'Esta indicação já foi recusada, com motivo registrado.',
  };
}

/** O que a entrada do diretorio recebe da indicacao: o TELEFONE. */
export function telefoneDaIndicacao(i: IndicacaoNaFila): string | null {
  return i.contatoKind === 'phone' ? i.contatoValue : null;
}

/**
 * O SITE que a entrada recebe da indicacao -- **o conserto de um dado que se
 * perdia**.
 */
export function siteDaIndicacao(i: IndicacaoNaFila): string | null {
  return i.contatoKind === 'website' ? i.contatoValue : null;
}
