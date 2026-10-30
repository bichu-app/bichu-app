/** Persistencia da fila de sugestoes do diretorio. */
import { randomBytes } from 'node:crypto';
import { sql } from 'kysely';

import type { Db, DbTransaction } from '../../../../shared/db/pool.js';
import type { IdGenerator } from '../../../../shared/ports/index.js';
import type { TipoDeEntidade, TipoDeProfissional } from '../../domain/entrada-do-diretorio.js';
import type { TipoDeContatoPublico } from '../../domain/sugestao-do-diretorio.js';
import type { RevisaoDaIndicacao } from '../../domain/fila-de-indicacoes.js';
import type {
  DirectorySuggestionRepository,
  MinhaIndicacao,
  PaginaDasMinhasIndicacoes,
  RecorteDasMinhasIndicacoes,
  RegistroDaSugestao,
  SugestaoAGravar,
} from '../../ports/directory-suggestion-repository.js';
import {
  PROPOSITO_DO_LOGOTIPO_DA_INDICACAO,
  TRABALHO_DE_IMAGEM_DE_CATALOGO,
} from '../../../media/ports/imagem-de-catalogo.js';

/** O que o `RETURNING` da funcao devolve. */
interface LinhaDoRegistro {
  created_at: Date;
}

/** Uma linha de `indicacoes_do_autor(uuid)`. */
interface LinhaDaMinhaIndicacao {
  ref: string;
  display_name: string;
  kind: TipoDeProfissional;
  entity_kind: TipoDeEntidade;
  city: string;
  state: string;
  neighborhood: string | null;
  contact_kind: TipoDeContatoPublico;
  contact_value: string;
  review_status: RevisaoDaIndicacao;
  created_at: Date;
  decided_at: Date | null;
  decline_reason: string | null;
  entry_slug: string | null;
}

function comoMinhaIndicacao(l: LinhaDaMinhaIndicacao): MinhaIndicacao {
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
    reviewStatus: l.review_status,
    createdAt: l.created_at,
    decidedAt: l.decided_at,
    declineReason: l.decline_reason,
    entradaSlug: l.entry_slug,
  };
}

/**
 * A forma de UUID, para o `upload_id` que nao e UUID devolver "nao serve" em vez
 * de estourar como erro de banco.
 */
const FORMA_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function criarDirectorySuggestionRepository(
  db: Db,
  ids: IdGenerator,
): DirectorySuggestionRepository {
  return {
    /**
     * Grava a indicacao -- e, quando ha logotipo, confirma o envio dele NA MESMA
     * TRANSACAO (ADR-0027 item 10).
     */
    async registrar(sugestao: SugestaoAGravar): Promise<RegistroDaSugestao> {
      const ref = randomBytes(16).toString('base64url');
      const logoUploadId = sugestao.logoUploadId;

      /** O `INSERT` da indicacao, pela funcao. */
      const gravar = async (
        executor: Db | DbTransaction,
        logoImageId: string | null,
      ): Promise<RegistroDaSugestao> => {
        const linha = await sql<LinhaDoRegistro>`
          SELECT directory_suggestions_registrar(
            ${ids.uuidv7()}::uuid,
            ${ref},
            ${sugestao.autor}::uuid,
            ${sugestao.displayName},
            ${sugestao.kind},
            ${sugestao.entityKind},
            ${sugestao.city},
            ${sugestao.state},
            ${sugestao.neighborhood},
            ${sugestao.postalCode},
            ${sugestao.contatoKind},
            ${sugestao.contatoValue},
            ${sugestao.note},
            ${logoImageId}::uuid
          ) AS created_at
        `.execute(executor);

        const gravada = linha.rows[0];
        if (gravada === undefined) {
          throw new Error(
            'directory_suggestions_registrar nao devolveu linha: as migracoes 20261017000004, 20261017000015, 20261029000003 e 20261029000004 nao estao aplicadas neste banco, ou a funcao mudou de forma.',
          );
        }
        return { tipo: 'gravada', sugestao: { ref, createdAt: gravada.created_at } };
      };

      if (logoUploadId === null) return gravar(db, null);

      if (!FORMA_DE_UUID.test(logoUploadId)) return { tipo: 'envio_nao_serve' };

      return db.transaction().execute(async (trx) => {
        const r = await sql<{
          id: string;
          expires_at: Date;
          confirmed_at: Date | null;
        }>`
          SELECT u.id, u.expires_at, u.confirmed_at
            FROM catalog_upload_intents u
           WHERE u.id = ${logoUploadId}::uuid
             AND u.user_id = ${sugestao.autor}::uuid
             AND u.purpose = ${PROPOSITO_DO_LOGOTIPO_DA_INDICACAO}
           FOR UPDATE OF u
        `.execute(trx);

        const envio = r.rows[0];
        if (envio === undefined) return { tipo: 'envio_nao_serve' };
        if (envio.confirmed_at !== null) return { tipo: 'envio_nao_serve' };
        if (envio.expires_at.getTime() <= Date.now()) return { tipo: 'envio_nao_serve' };

        const imagemId = ids.uuidv7();
        await trx
          .updateTable('catalog_upload_intents')
          .set({ confirmed_at: new Date() })
          .where('id', '=', envio.id)
          .where('confirmed_at', 'is', null)
          .execute();
        await trx
          .insertInto('catalog_images')
          .values({
            id: imagemId,
            upload_intent_id: envio.id,
            purpose: PROPOSITO_DO_LOGOTIPO_DA_INDICACAO,
            public_key: null,
            rejection_reason: null,
          })
          .execute();
        await trx
          .insertInto('jobs')
          .values({
            id: ids.uuidv7(),
            kind: TRABALHO_DE_IMAGEM_DE_CATALOGO,
            payload: JSON.stringify({ catalog_image_id: imagemId }),
          })
          .execute();

        return gravar(trx, imagemId);
      });
    },

    async listarDoAutor(
      recorte: RecorteDasMinhasIndicacoes,
    ): Promise<PaginaDasMinhasIndicacoes> {
      const doEstado =
        recorte.reviewStatus === undefined
          ? sql`TRUE`
          : sql`review_status = ${recorte.reviewStatus}`;

      const linhas = await sql<LinhaDaMinhaIndicacao>`
        SELECT ref, display_name, kind, city, state, neighborhood,
               contact_kind, contact_value, review_status,
               created_at, decided_at, decline_reason, entry_slug
          FROM indicacoes_do_autor(${recorte.autor}::uuid)
         WHERE ${doEstado}
         ORDER BY created_at DESC, ref ASC
         LIMIT ${recorte.limit} OFFSET ${(recorte.page - 1) * recorte.limit}
      `.execute(db);

      const contagem = await sql<{ total: string }>`
        SELECT count(*) AS total
          FROM indicacoes_do_autor(${recorte.autor}::uuid)
         WHERE ${doEstado}
      `.execute(db);

      return {
        itens: linhas.rows.map(comoMinhaIndicacao),
        total: Number(contagem.rows[0]?.total ?? 0),
      };
    },
  };
}
