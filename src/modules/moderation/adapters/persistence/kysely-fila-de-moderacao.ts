/** Persistencia da FILA DE MODERACAO do painel. */
import { sql } from 'kysely';

import type { Db, DbExecutor, DbTransaction } from '../../../../shared/db/pool.js';
import type { TrilhaTransacional } from '../../../audit/ports/audit-log.js';
import type { Instant } from '../../../../shared/types/brands.js';
import type {
  DecisaoDaModeracao,
  ItemDaFila,
  OrigemDaDenuncia,
} from '../../domain/fila-de-moderacao.js';
import type {
  AlvoRemovido,
  FilaDeModeracaoRepository,
  PaginaDaFila,
  RecorteDaFila,
  TransacaoDaModeracao,
} from '../../ports/fila-de-moderacao.js';

export interface DependenciasDaFilaDeModeracao {
  readonly db: Db;
  readonly trilha: TrilhaTransacional;
}

/** O PREDICADO, como expressao reusada nas TRES consultas. */
const DENUNCIANTE_ATIVO = sql<boolean>`f.reporter_active`;

/** As colunas do item AGREGADO, por nome. */
const COLUNAS = sql`
  f.origin,
  f.target_ref,
  min(f.target_subject)                                       AS subject,
  min(f.target_body)                                          AS content,
  min(f.target_rating)                                        AS rating,
  (array_agg(f.reason ORDER BY f.created_at, f.report_id))[1]  AS reason,
  array_agg(DISTINCT f.reason)                                 AS reasons,
  (array_agg(f.detail  ORDER BY f.created_at, f.report_id))[1] AS detail,
  count(*)::int                                                AS report_count,
  sum(f.repeat_count)::int                                     AS repeat_total,
  min(f.created_at)                                            AS first_reported_at,
  max(f.last_reported_at)                                      AS last_reported_at,
  bool_or(f.target_removed)                                    AS content_removed,
  (array_agg(f.resolution        ORDER BY f.resolved_at DESC NULLS LAST))[1] AS resolution,
  (array_agg(f.resolution_reason ORDER BY f.resolved_at DESC NULLS LAST))[1] AS resolution_reason,
  max(f.resolved_at)                                           AS resolved_at`;

interface LinhaDoItem {
  origin: string;
  target_ref: string;
  subject: string;
  content: string | null;
  rating: number | null;
  reason: string;
  reasons: string[];
  detail: string | null;
  report_count: number;
  repeat_total: number;
  first_reported_at: Date;
  last_reported_at: Date;
  content_removed: boolean;
  resolution: DecisaoDaModeracao | null;
  resolution_reason: string | null;
  resolved_at: Date | null;
}

function comoItem(l: LinhaDoItem): ItemDaFila {
  return {
    origem: l.origin as OrigemDaDenuncia,
    targetRef: l.target_ref,
    assunto: l.subject,
    conteudo: l.content,
    nota: l.rating,
    motivo: l.reason,
    motivos: l.reasons,
    detalhe: l.detail,
    reportCount: l.report_count,
    repeatTotal: l.repeat_total,
    primeiraEm: l.first_reported_at,
    ultimaEm: l.last_reported_at,
    conteudoRemovido: l.content_removed,
    decisao: l.resolution,
    motivoDaDecisao: l.resolution_reason,
    decididaEm: l.resolved_at,
  };
}

/** LUGAR 2 do filtro: a LEITURA de um item. */
async function lerItem(
  db: DbExecutor,
  origem: OrigemDaDenuncia,
  targetRef: string,
  travar: boolean,
  apenasAbertas: boolean,
): Promise<ItemDaFila | null> {
  if (travar) await travarDenuncias(db, origem, targetRef);

  const r = await sql<LinhaDoItem>`
    SELECT ${COLUNAS}
      FROM fila_de_moderacao f
     WHERE f.origin = ${origem}
       AND f.target_ref = ${targetRef}
       AND ${DENUNCIANTE_ATIVO}
       ${apenasAbertas ? sql`AND f.resolved_at IS NULL` : sql``}
     GROUP BY f.origin, f.target_ref`.execute(db);
  const linha = r.rows[0];
  return linha === undefined ? null : comoItem(linha);
}

/** A trava das denuncias ABERTAS do alvo, por origem. */
async function travarDenuncias(
  db: DbExecutor,
  origem: OrigemDaDenuncia,
  targetRef: string,
): Promise<void> {
  if (origem === 'review') {
    await sql`
      SELECT d.id
        FROM professional_review_reports d
        JOIN professional_reviews r ON r.id = d.review_id
       WHERE r.ref = ${targetRef} AND d.resolved_at IS NULL
         FOR UPDATE OF d`.execute(db);
    return;
  }
  await sql`
    SELECT d.id
      FROM conversation_reports d
     WHERE d.conversation_id = ${targetRef}::uuid AND d.resolved_at IS NULL
       FOR UPDATE OF d`.execute(db);
}

/** Esconde o conteudo. **Exclusao logica, e nunca `DELETE`.** */
async function removerConteudo(
  trx: DbTransaction,
  origem: OrigemDaDenuncia,
  targetRef: string,
  motivo: string,
  agora: Instant,
): Promise<AlvoRemovido | null> {
  if (origem === 'review') {
    const linha = await trx
      .updateTable('professional_reviews')
      .set({ status: 'removed', moderation_reason: motivo, moderated_at: new Date(agora) })
      .where('ref', '=', targetRef)
      .where('status', '=', 'published')
      .returning(['id', 'rating'])
      .executeTakeFirst();
    return linha === undefined ? null : { id: linha.id, notaAntes: linha.rating };
  }

  const linha = await trx
    .updateTable('conversations')
    .set({ moderation_removed_at: new Date(agora), moderation_reason: motivo })
    .where('id', '=', targetRef)
    .where('moderation_removed_at', 'is', null)
    .returning('id')
    .executeTakeFirst();
  return linha === undefined ? null : { id: linha.id, notaAntes: null };
}

/** Marca a decisao em TODAS as denuncias abertas do alvo, e devolve quantas. */
async function resolverDenuncias(
  trx: DbTransaction,
  origem: OrigemDaDenuncia,
  targetRef: string,
  decisao: DecisaoDaModeracao,
  motivo: string,
  agora: Instant,
): Promise<{ quantidade: number; decididaEm: Date }> {
  const quando = new Date(agora);
  if (origem === 'review') {
    const r = await sql<{ id: string }>`
      UPDATE professional_review_reports d
         SET resolved_at = ${quando},
             resolution = ${decisao},
             resolution_reason = ${motivo}
       WHERE d.resolved_at IS NULL
         AND d.review_id = (SELECT r.id FROM professional_reviews r WHERE r.ref = ${targetRef})
      RETURNING d.id`.execute(trx);
    return { quantidade: r.rows.length, decididaEm: quando };
  }
  const r = await sql<{ id: string }>`
    UPDATE conversation_reports d
       SET resolved_at = ${quando},
           resolution = ${decisao},
           resolution_reason = ${motivo}
     WHERE d.resolved_at IS NULL
       AND d.conversation_id = ${targetRef}::uuid
    RETURNING d.id`.execute(trx);
  return { quantidade: r.rows.length, decididaEm: quando };
}

export function criarFilaDeModeracaoRepository(
  deps: DependenciasDaFilaDeModeracao,
): FilaDeModeracaoRepository {
  const { db } = deps;

  return {
    emTransacao: (trabalho) =>
      db.transaction().execute((trx) => {
        const transacao: TransacaoDaModeracao = {
          itemPorAlvo: (origem, ref) => lerItem(trx, origem, ref, true, true),
          removerConteudo: (origem, ref, motivo, agora) =>
            removerConteudo(trx, origem, ref, motivo, agora),
          resolverDenuncias: (origem, ref, decisao, motivo, agora) =>
            resolverDenuncias(trx, origem, ref, decisao, motivo, agora),
          registrarNaTrilha: (evento) => deps.trilha.recordIn(trx, evento),
        };
        return trabalho(transacao);
      }),

    async listar(recorte: RecorteDaFila): Promise<PaginaDaFila> {
      const aberta = (recorte.estado ?? 'open') === 'open';
      const estado = aberta ? sql`f.resolved_at IS NULL` : sql`f.resolved_at IS NOT NULL`;
      const origem =
        recorte.origem === undefined ? sql`` : sql`AND f.origin = ${recorte.origem}`;

      const contagem = await sql<{ total: string }>`
        SELECT count(*) AS total FROM (
          SELECT 1
            FROM fila_de_moderacao f
           WHERE ${estado} AND ${DENUNCIANTE_ATIVO} ${origem}
           GROUP BY f.origin, f.target_ref) g`.execute(db);

      const linhas = await sql<LinhaDoItem>`
        SELECT ${COLUNAS}
          FROM fila_de_moderacao f
         WHERE ${estado} AND ${DENUNCIANTE_ATIVO} ${origem}
         GROUP BY f.origin, f.target_ref
         ORDER BY min(f.created_at) ASC, f.target_ref ASC
         LIMIT ${recorte.limit} OFFSET ${(recorte.page - 1) * recorte.limit}`.execute(db);

      const pendentes = await sql<{ total: string }>`
        SELECT count(*) AS total FROM (
          SELECT 1
            FROM fila_de_moderacao f
           WHERE f.resolved_at IS NULL AND ${DENUNCIANTE_ATIVO}
           GROUP BY f.origin, f.target_ref) g`.execute(db);

      return {
        itens: linhas.rows.map(comoItem),
        total: Number(contagem.rows[0]?.total ?? 0),
        pendentes: Number(pendentes.rows[0]?.total ?? 0),
      };
    },

    itemPorAlvo: (origem, ref) => lerItem(db, origem, ref, false, false),
  };
}
