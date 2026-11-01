import type { ProblemFieldError } from '../../../shared/http/problem.js';
import { urlDaDerivada, type TipoDeEntidade, type TipoDeProfissional } from './entrada-do-diretorio.js';
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
  /**
   * A chave da derivada `thumb` (176 x 176) do LOGOTIPO que quem indicou enviou,
   * ou nula em TRES casos que a fila trata igual: a indicacao nao tem logotipo (o
   * comum), o worker ainda nao terminou, ou os bytes foram recusados.
   */
  readonly logoThumbKey: string | null;
  /**
   * As chaves da derivada `card` (1024 x 576) das FOTOS DO ESTABELECIMENTO, **so
   * as `ready`** e **na ordem de `position`** -- a `0` e a capa.
   */
  readonly fotoCardKeys: readonly string[];
  /**
   * Quantas fotos a indicacao TEM, **prontas e nao prontas**. Maior que
   * `fotoCardKeys.length` quer dizer que alguma ainda processa ou foi recusada, e
   * e esse o caso em que o painel diz "ainda processando" em vez de "sem fotos".
   */
  readonly fotosTotal: number;
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
  /**
   * O LOGOTIPO na derivada `thumb`, ou nulo (os tres casos de `logoThumbKey`).
   * **`thumb` e nao `card` porque esta e uma LISTA**: a fila paginada desenha o
   * quadrado pequeno ao lado do nome.
   */
  readonly logo_url: string | null;
  /**
   * As FOTOS na derivada `card`, na ordem em que quem indicou as colocou. **Lista
   * vazia, e nunca nula**: "nenhuma foto" e uma lista de zero itens, e uma lista
   * que as vezes e nula obriga quem le a tratar dois casos para dizer o mesmo.
   */
  readonly photo_urls: readonly string[];
  /** Quantas fotos existem, prontas ou nao. */
  readonly photos_total: number;
}

/**
 * A projecao.
 *
 * **`urlDeMidia` entrou em 30/10/2026**, com as imagens: o que sai e a URL da
 * derivada e **nunca o identificador** (ADR-0010 item 6, que proibe qualquer UUID
 * do banco em resposta, sem excecao). A montagem e por `urlDaDerivada`, o MESMO
 * ajudante de `DirectoryEntrySummary.logo_url`, e nao um segundo: ele tambem
 * confere a FORMA da chave, entao chave que nao e de derivada publica vira nulo em
 * vez de URL quebrada.
 */
export function projetarIndicacao(
  i: IndicacaoNaFila,
  urlDeMidia: (chave: string) => string,
): IndicacaoProjetada {
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
    logo_url: urlDaDerivada(i.logoThumbKey, urlDeMidia),
    photo_urls: i.fotoCardKeys.flatMap((chave) => {
      const url = urlDaDerivada(chave, urlDeMidia);
      return url === null ? [] : [url];
    }),
    photos_total: i.fotosTotal,
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
