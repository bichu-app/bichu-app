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

const AUTOR_ATIVO = sql<boolean>`indicacao_com_autor_ativo(s.id)`;

/**
 * As colunas que saem, por nome -- e **as TRES de imagem saem por SUBCONSULTA na
 * MESMA consulta**, e nao por leitura por linha (30/10/2026).
 *
 * **Isto nao e preferencia de estilo: e a defesa contra o N+1.** A fila e
 * paginada em ate 20 linhas, e uma leitura de imagem por indicacao seriam 21
 * consultas numa pagina -- o defeito que `pontuacao-da-listagem-sai-em-uma-
 * consulta.test.ts` mede para a listagem do `Perto`. A forma e a MESMA de
 * `GALERIA_DA_ENTRADA` em `kysely-diretorio-administrativo.ts`: `json_agg` com
 * `ORDER BY` dentro de uma subconsulta correlacionada.
 *
 * As tres, e o que cada uma responde:
 *
 *  - `logo_thumb_key`: a derivada `thumb` do logotipo. `c.status = 'ready'` esta
 *    na clausula: os TRES casos de nulo (sem logotipo, worker nao terminou, bytes
 *    recusados) caem no mesmo `NULL`, que e como `DirectoryEntrySummary.logo_url`
 *    ja os trata;
 *  - `foto_card_keys`: as derivadas `card` das fotos, **so as `ready`**, na ordem
 *    de `position`. `coalesce(..., '[]')` para a indicacao sem foto devolver lista
 *    vazia e nao `NULL` -- `photo_urls` e `required` no contrato;
 *  - `fotos_total`: TODAS as linhas da tabela, prontas ou nao, **sem juntar com
 *    `catalog_images`**. E a juncao que faria a contagem perder a foto cuja imagem
 *    o varredor apagou, e e justamente essa a diferenca que o painel usa para
 *    dizer "ainda processando" em vez de "sem fotos".
 *
 * **Nenhuma delas devolve `image_id`** (ADR-0010 item 6): sai a chave da
 * derivada, de onde o dominio monta a URL.
 */
const COLUNAS = sql`
  s.ref, s.display_name, s.kind, s.entity_kind, s.city, s.state, s.neighborhood,
  s.contact_kind, s.contact_value, s.note, s.review_status,
  s.created_at, s.decided_at, s.decline_reason,
  (SELECT p.slug FROM professionals p WHERE p.id = s.approved_entry_id) AS entry_slug,
  (SELECT c.thumb_key FROM catalog_images c
    WHERE c.id = s.logo_image_id AND c.status = 'ready') AS logo_thumb_key,
  (SELECT coalesce(json_agg(c.public_key ORDER BY i.position), '[]'::json)
     FROM directory_suggestion_images i
     JOIN catalog_images c ON c.id = i.image_id
    WHERE i.suggestion_id = s.id
      AND c.status = 'ready'
      AND c.public_key IS NOT NULL) AS foto_card_keys,
  (SELECT count(*) FROM directory_suggestion_images i
    WHERE i.suggestion_id = s.id) AS fotos_total`;

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
  logo_thumb_key: string | null;
  foto_card_keys: readonly string[];
  fotos_total: string | number;
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
    logoThumbKey: l.logo_thumb_key,
    fotoCardKeys: l.foto_card_keys ?? [],
    fotosTotal: Number(l.fotos_total ?? 0),
  };
}

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
