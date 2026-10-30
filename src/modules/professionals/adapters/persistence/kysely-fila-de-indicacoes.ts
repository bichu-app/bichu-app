/** Persistencia da FILA DE REVISAO das indicacoes do `Perto`. */
import { sql } from 'kysely';

import type { DbExecutor, DbTransaction } from '../../../../shared/db/pool.js';
import type { Instant } from '../../../../shared/types/brands.js';
import type { TipoDeEntidade, TipoDeProfissional } from '../../domain/entrada-do-diretorio.js';
import type { TipoDeContatoPublico } from '../../domain/sugestao-do-diretorio.js';
import type { IndicacaoNaFila, RevisaoDaIndicacao } from '../../domain/fila-de-indicacoes.js';
import type {
  FilaDeIndicacoesRepository,
  PaginaDaFila,
  RecorteDaFila,
  TransacaoDaFila,
} from '../../ports/fila-de-indicacoes.js';
import {
  criarTransacaoDoDiretorio,
  type DependenciasDoDiretorioAdministrativo,
} from './kysely-diretorio-administrativo.js';

export type DependenciasDaFilaDeIndicacoes = DependenciasDoDiretorioAdministrativo;

/** O predicado da conta de quem indicou, como expressao reusada nas TRES consultas. */
const AUTOR_ATIVO = sql<boolean>`indicacao_com_autor_ativo(s.id)`;

/** As colunas que saem, por nome. */
const COLUNAS = sql`
  s.ref, s.display_name, s.kind, s.entity_kind, s.city, s.state, s.neighborhood,
  s.contact_kind, s.contact_value, s.note, s.review_status,
  s.created_at, s.decided_at, s.decline_reason,
  (SELECT p.slug FROM professionals p WHERE p.id = s.approved_entry_id) AS entry_slug`;

interface LinhaDaIndicacao {
  ref: string;
  display_name: string;
  kind: TipoDeProfissional;
  entity_kind: TipoDeEntidade;
  city: string;
  state: string;
  neighborhood: string | null;
  contact_kind: TipoDeContatoPublico;
  contact_value: string;
  note: string | null;
  review_status: RevisaoDaIndicacao;
  created_at: Date;
  decided_at: Date | null;
  decline_reason: string | null;
  entry_slug: string | null;
}

function comoIndicacao(l: LinhaDaIndicacao): IndicacaoNaFila {
  return {
    ref: l.ref,
    displayName: l.display_name,
    kind: l.kind,
    entityKind: l.entity_kind,
    city: l.city,
    state: l.state,
    neighborhood: l.neighborhood,
    contatoKind: l.contact_kind,
    contatoValue: l.contact_value,
    note: l.note,
    reviewStatus: l.review_status,
    createdAt: l.created_at,
    decidedAt: l.decided_at,
    declineReason: l.decline_reason,
    entradaSlug: l.entry_slug,
  };
}

/** LUGAR 2 do filtro: a leitura de UMA indicacao. */
async function lerIndicacao(
  db: DbExecutor,
  ref: string,
  travar: boolean,
): Promise<IndicacaoNaFila | null> {
  const r = await sql<LinhaDaIndicacao>`
    SELECT ${COLUNAS}
      FROM directory_suggestions s
     WHERE s.ref = ${ref} AND ${AUTOR_ATIVO}
     ${travar ? sql`FOR UPDATE OF s` : sql``}`.execute(db);
  const linha = r.rows[0];
  return linha === undefined ? null : comoIndicacao(linha);
}

export function criarFilaDeIndicacoesRepository(
  deps: DependenciasDaFilaDeIndicacoes,
): FilaDeIndicacoesRepository {
  const { db } = deps;

  const metodosDaFila = (trx: DbTransaction) => ({
    indicacaoPorRef: (ref: string) => lerIndicacao(trx, ref, true),

    async marcarAprovada(ref: string, entradaSlug: string, agora: Instant) {
      const r = await sql<LinhaDaIndicacao>`
        UPDATE directory_suggestions s
           SET review_status = 'approved',
               decided_at = ${new Date(agora)},
               approved_entry_id = (SELECT p.id FROM professionals p WHERE p.slug = ${entradaSlug})
         WHERE s.ref = ${ref}
        RETURNING ${COLUNAS}`.execute(trx);
      const linha = r.rows[0];
      if (linha === undefined) {
        throw new Error(
          `marcarAprovada nao encontrou a indicacao ${ref} que a propria transacao acabou de ler com FOR UPDATE: defeito de esquema, e nao caso de borda.`,
        );
      }
      return comoIndicacao(linha);
    },

    async marcarRecusada(ref: string, motivo: string, agora: Instant) {
      const r = await sql<LinhaDaIndicacao>`
        UPDATE directory_suggestions s
           SET review_status = 'declined',
               decided_at = ${new Date(agora)},
               decline_reason = ${motivo}
         WHERE s.ref = ${ref}
        RETURNING ${COLUNAS}`.execute(trx);
      const linha = r.rows[0];
      if (linha === undefined) {
        throw new Error(
          `marcarRecusada nao encontrou a indicacao ${ref} que a propria transacao acabou de ler com FOR UPDATE: defeito de esquema, e nao caso de borda.`,
        );
      }
      return comoIndicacao(linha);
    },
  });

  return {
    emTransacao: (trabalho) =>
      db.transaction().execute((trx) => {
        const transacao: TransacaoDaFila = {
          ...criarTransacaoDoDiretorio(trx, deps),
          ...metodosDaFila(trx),
        };
        return trabalho(transacao);
      }),

    async listar(recorte: RecorteDaFila): Promise<PaginaDaFila> {
      const estado: RevisaoDaIndicacao = recorte.reviewStatus ?? 'pending';

      const contagem = await sql<{ total: string }>`
        SELECT count(*) AS total
          FROM directory_suggestions s
         WHERE s.review_status = ${estado} AND ${AUTOR_ATIVO}`.execute(db);

      const linhas = await sql<LinhaDaIndicacao>`
        SELECT ${COLUNAS}
          FROM directory_suggestions s
         WHERE s.review_status = ${estado} AND ${AUTOR_ATIVO}
         ORDER BY s.created_at ASC, s.ref ASC
         LIMIT ${recorte.limit} OFFSET ${(recorte.page - 1) * recorte.limit}`.execute(db);

      const pendentes = await sql<{ total: string }>`
        SELECT count(*) AS total
          FROM directory_suggestions s
         WHERE s.review_status = 'pending' AND ${AUTOR_ATIVO}`.execute(db);

      return {
        itens: linhas.rows.map(comoIndicacao),
        total: Number(contagem.rows[0]?.total ?? 0),
        pendentes: Number(pendentes.rows[0]?.total ?? 0),
      };
    },

    indicacaoPorRef: (ref: string) => lerIndicacao(db, ref, false),
  };
}
