/** A persistência da vitrine de fotos do usuário. */
import type { Db, DbExecutor } from '../../../../shared/db/pool.js';
import type { FotoDaVitrineParaGravar } from '../../domain/vitrine-de-fotos.js';
import type { IdGenerator } from '../../../../shared/ports/index.js';
import type { Instant, ObjectKey, UserId } from '../../../../shared/types/brands.js';
import {
  TRABALHO_DE_IMAGEM_DE_CATALOGO,
  comoObjectKey,
} from '../../../media/ports/imagem-de-catalogo.js';
import { problemas } from '../../../../shared/http/errors.js';
import type { EnvioDaVitrine, FotoDaVitrine, VitrineRepository } from '../../ports/vitrine-repository.js';

/** O propósito desta esteira. */
export const PROPOSITO_DA_VITRINE = 'user_showcase' as const;

const FORMA_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function chaveOuNulo(valor: string | null): ObjectKey | null {
  return valor === null ? null : comoObjectKey(valor);
}

/** O envio do DONO, com trava de linha. */
export async function envioDaVitrineDoDono(
  db: DbExecutor,
  uploadId: string,
  dono: UserId,
): Promise<EnvioDaVitrine | null> {
  if (!FORMA_DE_UUID.test(uploadId)) return null;
  const linha = await db
    .selectFrom('catalog_upload_intents as u')
    .leftJoin('catalog_images as c', 'c.upload_intent_id', 'u.id')
    .select([
      'u.id as id',
      'u.purpose as purpose',
      'u.expires_at as expires_at',
      'u.confirmed_at as confirmed_at',
      'c.id as catalog_image_id',
    ])
    .where('u.id', '=', uploadId)
    .where('u.user_id', '=', dono)
    .where('u.purpose', '=', PROPOSITO_DA_VITRINE)
    .forUpdate('u')
    .executeTakeFirst();
  if (linha === undefined) return null;
  return {
    id: linha.id,
    purpose: linha.purpose,
    expiresAt: linha.expires_at,
    confirmedAt: linha.confirmed_at,
    catalogImageId: linha.catalog_image_id,
  };
}

async function lerVitrine(db: DbExecutor, dono: UserId): Promise<readonly FotoDaVitrine[]> {
  const linhas = await db
    .selectFrom('user_showcase_images as v')
    .innerJoin('catalog_images as c', 'c.id', 'v.image_id')
    .leftJoin('catalog_upload_intents as u', 'u.id', 'c.upload_intent_id')
    .select([
      'u.id as upload_id',
      'v.position as position',
      'v.alt_text as alt_text',
      'c.status as status',
      'c.thumb_key as thumb_key',
      'c.public_key as public_key',
      'c.rejection_reason as rejection_reason',
    ])
    .where('v.user_id', '=', dono)
    .where('c.purpose', '=', PROPOSITO_DA_VITRINE)
    .orderBy('v.position', 'asc')
    .execute();

  return linhas.map((linha) => ({
    uploadId: linha.upload_id,
    position: linha.position,
    status: linha.status,
    gradeKey: chaveOuNulo(linha.thumb_key),
    abertaKey: chaveOuNulo(linha.public_key),
    rejectionReason: linha.rejection_reason,
    altText: linha.alt_text,
  }));
}

/** A escrita da vitrine, **sobre um executor recebido de fora**. */
export async function gravarVitrineNaTransacao(
  trx: DbExecutor,
  entrada: {
    readonly dono: UserId;
    readonly fotos: readonly FotoDaVitrineParaGravar[];
    readonly agora: Instant;
    readonly ids: IdGenerator;
  },
): Promise<readonly FotoDaVitrine[]> {
  const { dono, fotos, agora, ids } = entrada;
  {
    {
        await trx.deleteFrom('user_showcase_images').where('user_id', '=', dono).execute();

        const gravadas: { imagemId: string; posicao: number; altText: string | null }[] = [];

        for (const foto of fotos) {
          const envio = await envioDaVitrineDoDono(trx, foto.uploadId, dono);
          if (envio === null) throw problemas.naoEncontrado();

          let imagemId = envio.catalogImageId;
          if (imagemId === null) {
            if (envio.confirmedAt !== null) {
              throw problemas.validacao([
                { field: 'photos', code: 'conflict', message: 'Esse envio já foi usado.' },
              ]);
            }
            if (envio.expiresAt.getTime() <= agora) {
              throw problemas.validacao([
                { field: 'photos', code: 'expired', message: 'Esse envio venceu. Envie a foto de novo.' },
              ]);
            }
            imagemId = ids.uuidv7();
            await trx
              .updateTable('catalog_upload_intents')
              .set({ confirmed_at: new Date(agora) })
              .where('id', '=', envio.id)
              .where('confirmed_at', 'is', null)
              .execute();
            await trx
              .insertInto('catalog_images')
              .values({
                id: imagemId,
                upload_intent_id: envio.id,
                purpose: PROPOSITO_DA_VITRINE,
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
          }
          gravadas.push({ imagemId, posicao: foto.position, altText: foto.altText });
        }

        if (gravadas.length > 0) {
          await trx
            .insertInto('user_showcase_images')
            .values(
              gravadas.map((linha) => ({
                user_id: dono,
                image_id: linha.imagemId,
                position: linha.posicao,
                alt_text: linha.altText,
              })),
            )
            .execute();
        }

        return lerVitrine(trx, dono);
    }
  }
}

export function criarVitrineRepository(db: Db, ids: IdGenerator): VitrineRepository {
  return {
    listar: (dono) => lerVitrine(db, dono),
    substituir: ({ dono, fotos, agora }) =>
      db.transaction().execute((trx) => gravarVitrineNaTransacao(trx, { dono, fotos, agora, ids })),
  };
}
