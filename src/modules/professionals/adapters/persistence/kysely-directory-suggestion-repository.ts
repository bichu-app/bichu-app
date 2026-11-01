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
  PROPOSITO_DA_FOTO_DA_INDICACAO,
  PROPOSITO_DO_LOGOTIPO_DA_INDICACAO,
  TRABALHO_DE_IMAGEM_DE_CATALOGO,
} from '../../../media/ports/imagem-de-catalogo.js';

interface LinhaDoRegistro {
  created_at: Date;
}

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

const FORMA_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A recusa de envio, como EXCECAO -- e isto nao e estilo, e um defeito medido.
 *
 * **`return` de dentro de `db.transaction().execute(...)` COMITA.** O Kysely so
 * desfaz quando o corpo LANCA. Enquanto a recusa era um `return`, a indicacao com
 * quatro fotos cuja QUARTA nao servia comitava as TRES primeiras: tres imagens
 * `processing` para sempre, tres envios confirmados e tres trabalhos
 * enfileirados, sem indicacao nenhuma apontando para eles -- e o desfecho que
 * `tests/integration/fotos-da-indicacao.test.ts` ("UMA das quatro que nao serve
 * desfaz as OUTRAS TRES") pegou com 3 !== 0.
 *
 * Com UMA imagem so (o logotipo, ate 29/10/2026) o defeito nao tinha efeito
 * visivel: a recusa acontecia ANTES de qualquer escrita, entao a transacao
 * comitada estava vazia. Foi a segunda imagem que o tornou observavel.
 *
 * Ela nao atravessa a fronteira do repositorio: `registrar` a converte em
 * `RegistroDaSugestao` FORA da transacao, e quem chama continua vendo so o tipo
 * da porta.
 */
class EnvioNaoServe extends Error {
  constructor(readonly campo: 'logo_upload_id' | 'photo_upload_ids') {
    super(`envio nao serve: ${campo}`);
    this.name = 'EnvioNaoServe';
  }
}

export function criarDirectorySuggestionRepository(
  db: Db,
  ids: IdGenerator,
): DirectorySuggestionRepository {
  return {
    async registrar(sugestao: SugestaoAGravar): Promise<RegistroDaSugestao> {
      const ref = randomBytes(16).toString('base64url');
      const logoUploadId = sugestao.logoUploadId;
      const fotos = sugestao.photoUploadIds;
      const idDaIndicacao = ids.uuidv7();

      const gravar = async (
        executor: Db | DbTransaction,
        logoImageId: string | null,
      ): Promise<RegistroDaSugestao> => {
        const linha = await sql<LinhaDoRegistro>`
          SELECT directory_suggestions_registrar(
            ${idDaIndicacao}::uuid,
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

      const confirmar = async (
        trx: DbTransaction,
        uploadId: string,
        proposito:
          | typeof PROPOSITO_DO_LOGOTIPO_DA_INDICACAO
          | typeof PROPOSITO_DA_FOTO_DA_INDICACAO,
      ): Promise<string | undefined> => {
        if (!FORMA_DE_UUID.test(uploadId)) return undefined;
        const r = await sql<{
          id: string;
          expires_at: Date;
          confirmed_at: Date | null;
        }>`
          SELECT u.id, u.expires_at, u.confirmed_at
            FROM catalog_upload_intents u
           WHERE u.id = ${uploadId}::uuid
             AND u.user_id = ${sugestao.autor}::uuid
             AND u.purpose = ${proposito}
           FOR UPDATE OF u
        `.execute(trx);

        const envio = r.rows[0];
        if (envio === undefined) return undefined;
        if (envio.confirmed_at !== null) return undefined;
        if (envio.expires_at.getTime() <= Date.now()) return undefined;

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
            purpose: proposito,
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
        return imagemId;
      };

      if (logoUploadId === null && fotos.length === 0) return gravar(db, null);

      try {
        return await db.transaction().execute(async (trx) => {
        const logoImageId =
          logoUploadId === null ? null : (await confirmar(trx, logoUploadId, PROPOSITO_DO_LOGOTIPO_DA_INDICACAO) ?? null);
        if (logoUploadId !== null && logoImageId === null) {
          throw new EnvioNaoServe('logo_upload_id');
        }

        const linhas: { suggestion_id: string; image_id: string; position: number }[] = [];
        for (const [position, uploadId] of fotos.entries()) {
          const imagemId = await confirmar(trx, uploadId, PROPOSITO_DA_FOTO_DA_INDICACAO);
          if (imagemId === undefined) {
            throw new EnvioNaoServe('photo_upload_ids');
          }
          linhas.push({ suggestion_id: idDaIndicacao, image_id: imagemId, position });
        }

        const gravada = await gravar(trx, logoImageId);

        if (linhas.length > 0) {
          await trx.insertInto('directory_suggestion_images').values(linhas).execute();
        }
        return gravada;
        });
      } catch (erro) {
        if (erro instanceof EnvioNaoServe) return { tipo: 'envio_nao_serve', campo: erro.campo };
        throw erro;
      }
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
