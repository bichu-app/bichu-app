/** O vocabulario da FILA DE MODERACAO do painel (18/10/2026). */
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import type { DecisaoDaModeracao } from '../../../shared/db/schema.js';

export type { DecisaoDaModeracao };

/**
 * De onde a denuncia veio -- **os CINCO valores de `ModerationOrigin`**.
 *
 * A visao `fila_de_moderacao` tem cinco pernas de `UNION ALL` (migracao
 * `20261018000032`), e a LEITURA responde pelas cinco: a fila lista denuncia
 * de perfil, de foto e de publicacao, e `getAdminModerationReport` devolve
 * cada uma. Por isso este tipo tem cinco, e nao dois: ele e o tipo do que o
 * painel LE.
 */
export type OrigemDaDenuncia = 'review' | 'conversation' | 'profile' | 'photo' | 'publication';

export const ORIGENS: readonly OrigemDaDenuncia[] = [
  'review',
  'conversation',
  'profile',
  'photo',
  'publication',
];

export function ehOrigem(valor: string): valor is OrigemDaDenuncia {
  return (ORIGENS as readonly string[]).includes(valor);
}

/**
 * **As origens que `src/` sabe DECIDIR**, que sao duas.
 *
 * ===========================================================================
 * POR QUE O TIPO E SEPARADO, E NAO UM `if` NO MEIO DO CAMINHO
 * ===========================================================================
 * Decidir exige tres coisas que a leitura nao exige: travar as denuncias
 * abertas do alvo, esconder o conteudo na tabela DELE, e marcar a resolucao.
 * As tres existem para `professional_reviews` e para `conversations`, e nao
 * existem para `profile_reports`, `photo_reports` nem `publication_reports`.
 *
 * Ate 31/10/2026 isso era um `else`: tudo que nao fosse `review` caia no ramo
 * da conversa, que compara `targetRef` com uma coluna `uuid`. Como
 * `subject_ref`, `image_public_key` e `publication_ref` nao sao UUID, o
 * Postgres lancava `22P02` e as duas decisoes respondiam **500** a um valor que
 * o proprio contrato declara valido -- medido pela rota em 31/10.
 *
 * Com dois tipos, a mesma troca nao compila: `removerConteudo` e
 * `resolverDenuncias` recebem `OrigemDecidivel`, e quem tiver uma
 * `OrigemDaDenuncia` na mao precisa estreita-la na BORDA, onde ha status HTTP
 * para responder. O comentario que pedia cuidado virou erro de compilacao.
 */
export type OrigemDecidivel = 'review' | 'conversation';

export const ORIGENS_DECIDIVEIS: readonly OrigemDecidivel[] = ['review', 'conversation'];

export function ehOrigemDecidivel(valor: string): valor is OrigemDecidivel {
  return (ORIGENS_DECIDIVEIS as readonly string[]).includes(valor);
}

/** A forma de um UUID, as oito-quatro-quatro-quatro-doze em hexadecimal. */
const FORMA_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * **`targetRef` tem a forma de UUID?**
 *
 * `ModerationTargetRef` aceita de 20 a 64 simbolos de `[A-Za-z0-9_-]`, e uma
 * cadeia opaca de 22 simbolos satisfaz o contrato sem ser UUID. Na origem
 * `conversation` o alvo e `conversations.id`, que E `uuid`: comparar os dois
 * fazia o Postgres lancar `22P02` e a rota responder 500 a um `targetRef` que
 * o contrato declara valido. Alvo de forma impossivel nao existe, e nao
 * existir e 404.
 */
export function temFormaDeUuid(valor: string): boolean {
  return FORMA_DE_UUID.test(valor);
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
