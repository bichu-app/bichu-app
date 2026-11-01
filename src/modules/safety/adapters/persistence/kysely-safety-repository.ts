import { sql, type CompiledQuery, type Kysely } from 'kysely';

import type { Database } from '../../../../shared/db/schema.js';
import { comoData } from '../../../../shared/time/clock.js';
import type { IdGenerator } from '../../../../shared/ports/index.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';
import type {
  DesfechoDaEscrita,
  PaginaDeBloqueios,
  RefPublicoDaPessoa,
  SafetyRepository,
} from '../../ports/safety-repository.js';

async function contaVisivelPara(
  db: Kysely<Database>,
  ref: RefPublicoDaPessoa,
  chamador: string,
): Promise<string | undefined> {
  const linha = await db
    .selectFrom('users')
    .select('id')
    .where('public_ref', '=', ref)
    .where(sql<boolean>`conta_habilitada(users.id)`)
    .where(sql<boolean>`NOT bloqueio_entre(users.id, ${chamador}::uuid)`)
    .executeTakeFirst();
  return linha?.id;
}

interface LinhaDeBloqueio {
  readonly public_ref: string;
  readonly handle: string | null;
  readonly display_name: string | null;
  readonly created_at: Date;
}

/** **A LISTA DE QUEM EU BLOQUEEI, e a igualdade é a autorização.** */
export function construtorDeQuemEuBloqueei(
  db: Kysely<Database>,
  chamador: string,
  page: number,
  limit: number,
): CompiledQuery<LinhaDeBloqueio> {
  return db
    .selectFrom('user_blocks as b')
    .innerJoin('users as u', 'u.id', 'b.blocked_user_id')
    .leftJoin('handles as h', (juncao) =>
      juncao.onRef('h.user_id', '=', 'u.id').on('h.kind', '=', 'pessoa'),
    )
    .select([
      'u.public_ref as public_ref',
      'h.handle as handle',
      'u.display_name as display_name',
      'b.created_at as created_at',
    ])
    .where('b.blocker_user_id', '=', chamador)
    .where(sql<boolean>`conta_habilitada(u.id)`)
    .where(sql<boolean>`conta_habilitada(${chamador}::uuid)`)
    .orderBy('b.created_at', 'desc')
    .orderBy('u.public_ref', 'asc')
    .limit(limit)
    .offset((page - 1) * limit)
    .compile();
}

/** A CONTAGEM, com a MESMA cláusula `WHERE` da página. */
export function construtorDaContagemDeQuemEuBloqueei(
  db: Kysely<Database>,
  chamador: string,
): CompiledQuery<{ total: number }> {
  return db
    .selectFrom('user_blocks as b')
    .innerJoin('users as u', 'u.id', 'b.blocked_user_id')
    .select(sql<number>`count(*)::int`.as('total'))
    .where('b.blocker_user_id', '=', chamador)
    .where(sql<boolean>`conta_habilitada(u.id)`)
    .where(sql<boolean>`conta_habilitada(${chamador}::uuid)`)
    .compile();
}

/**
 * A PUBLICAÇÃO denunciada, resolvida pelo endereço público, **com o MESMO recorte
 * da linha do tempo**.
 */
export function construtorDoAlvoDaPublicacao(
  db: Kysely<Database>,
  refDaPublicacao: string,
  chamador: UserId,
): CompiledQuery<{ readonly id: string; readonly autor: string; readonly corpo: string }> {
  return db
    .selectFrom('user_publications as p')
    .select(['p.id as id', 'p.author_user_id as autor', 'p.body as corpo'])
    .where('p.public_ref', '=', refDaPublicacao)
    .where('p.deleted_at', 'is', null)
    .where(
      sql<boolean>`(
        p.author_user_id = ${chamador}::uuid
        OR EXISTS (
          SELECT 1 FROM user_connections uc
           WHERE uc.state = 'accepted'
             AND ((uc.requester_user_id = p.author_user_id AND uc.addressee_user_id = ${chamador}::uuid)
               OR (uc.requester_user_id = ${chamador}::uuid AND uc.addressee_user_id = p.author_user_id))
             AND conta_habilitada(uc.requester_user_id)
             AND conta_habilitada(uc.addressee_user_id))
      )`,
    )
    .where(sql<boolean>`NOT bloqueio_entre(p.author_user_id, ${chamador}::uuid)`)
    .compile();
}

export function criarSafetyRepository(db: Kysely<Database>, ids: IdGenerator): SafetyRepository {
  return {
    async quemEuBloqueei(chamador: UserId, pagina): Promise<PaginaDeBloqueios> {
      const linhas = await db.executeQuery(
        construtorDeQuemEuBloqueei(db, chamador, pagina.page, pagina.limit),
      );
      const contagem = await db.executeQuery(
        construtorDaContagemDeQuemEuBloqueei(db, chamador),
      );
      return {
        items: linhas.rows.map((linha) => ({
          publicRef: linha.public_ref,
          handle: linha.handle,
          displayName: linha.display_name,
          bloqueadoEm: linha.created_at.getTime() as Instant,
        })),
        total: contagem.rows[0]?.total ?? 0,
      };
    },

    async bloquear(chamador, alvo, agora): Promise<DesfechoDaEscrita> {
      const idDoAlvo = await contaVisivelPara(db, alvo, chamador);
      if (idDoAlvo === undefined) return 'ausente';
      if (idDoAlvo === chamador) return 'eu_mesmo';

      await sql`
        INSERT INTO user_blocks (id, blocker_user_id, blocked_user_id, created_at)
        VALUES (${ids.uuidv7()}::uuid, ${chamador}::uuid, ${idDoAlvo}::uuid, ${comoData(agora)}::timestamptz)
        ON CONFLICT (blocker_user_id, blocked_user_id) DO NOTHING
      `.execute(db);

      return 'feito';
    },

    async desbloquear(chamador, alvo): Promise<DesfechoDaEscrita> {
      const linha = await db
        .selectFrom('users')
        .select('id')
        .where('public_ref', '=', alvo)
        .executeTakeFirst();
      if (linha === undefined) return 'ausente';

      await db
        .deleteFrom('user_blocks')
        .where('blocker_user_id', '=', chamador)
        .where('blocked_user_id', '=', linha.id)
        .execute();

      return 'feito';
    },

    async denunciarPerfil(chamador, alvo, denuncia, agora): Promise<DesfechoDaEscrita> {
      const idDoAlvo = await contaVisivelPara(db, alvo, chamador);
      if (idDoAlvo === undefined) return 'ausente';
      if (idDoAlvo === chamador) return 'eu_mesmo';

      const quando = comoData(agora);

      await sql`
        INSERT INTO profile_reports
          (id, subject_user_id, subject_ref, reporter_user_id, reason, detail,
           created_at, last_reported_at)
        VALUES
          (${ids.uuidv7()}::uuid, ${idDoAlvo}::uuid, ${alvo}, ${chamador}::uuid,
           ${denuncia.motivo}, ${denuncia.relato},
           ${quando}::timestamptz, ${quando}::timestamptz)
        ON CONFLICT (subject_ref, reporter_user_id) WHERE resolved_at IS NULL DO UPDATE SET
          reason           = EXCLUDED.reason,
          detail           = EXCLUDED.detail,
          repeat_count     = profile_reports.repeat_count + 1,
          last_reported_at = EXCLUDED.last_reported_at
      `.execute(db);

      return 'feito';
    },

    async denunciarFoto(chamador, chaveDaFoto, denuncia, agora): Promise<DesfechoDaEscrita> {
      const alvo = await db
        .selectFrom('catalog_images')
        .leftJoin('users', 'users.photo_image_id', 'catalog_images.id')
        .select(['catalog_images.id as imagem', 'users.id as dono'])
        .where('catalog_images.public_key', '=', chaveDaFoto)
        .where('catalog_images.status', '=', 'ready')
        .executeTakeFirst();

      if (alvo === undefined) return 'ausente';
      if (alvo.dono !== null && alvo.dono === chamador) return 'eu_mesmo';
      if (alvo.dono !== null) {
        const { rows } = await sql<{ bloqueado: boolean }>`
          SELECT bloqueio_entre(${alvo.dono}::uuid, ${chamador}::uuid) AS bloqueado
        `.execute(db);
        if (rows[0]?.bloqueado === true) return 'ausente';
      }

      const quando = comoData(agora);

      await sql`
        INSERT INTO photo_reports
          (id, image_id, image_public_key, owner_user_id, reporter_user_id, reason, detail,
           created_at, last_reported_at)
        VALUES
          (${ids.uuidv7()}::uuid, ${alvo.imagem}::uuid, ${chaveDaFoto}, ${alvo.dono}::uuid,
           ${chamador}::uuid, ${denuncia.motivo}, ${denuncia.relato},
           ${quando}::timestamptz, ${quando}::timestamptz)
        ON CONFLICT (image_public_key, reporter_user_id) WHERE resolved_at IS NULL DO UPDATE SET
          reason           = EXCLUDED.reason,
          detail           = EXCLUDED.detail,
          repeat_count     = photo_reports.repeat_count + 1,
          last_reported_at = EXCLUDED.last_reported_at
      `.execute(db);

      return 'feito';
    },

    async denunciarPublicacao(chamador, refDaPublicacao, denuncia, agora): Promise<DesfechoDaEscrita> {
      const { rows } = await db.executeQuery(
        construtorDoAlvoDaPublicacao(db, refDaPublicacao, chamador),
      );
      const alvo = rows[0];

      if (alvo === undefined) return 'ausente';
      if (alvo.autor === chamador) return 'eu_mesmo';

      const quando = comoData(agora);

      await sql`
        INSERT INTO publication_reports
          (id, publication_id, publication_ref, publication_body, author_user_id,
           reporter_user_id, reason, detail, created_at, last_reported_at)
        VALUES
          (${ids.uuidv7()}::uuid, ${alvo.id}::uuid, ${refDaPublicacao}, ${alvo.corpo},
           ${alvo.autor}::uuid, ${chamador}::uuid,
           ${denuncia.motivo}, ${denuncia.relato},
           ${quando}::timestamptz, ${quando}::timestamptz)
        ON CONFLICT (publication_ref, reporter_user_id) WHERE resolved_at IS NULL DO UPDATE SET
          reason           = EXCLUDED.reason,
          detail           = EXCLUDED.detail,
          repeat_count     = publication_reports.repeat_count + 1,
          last_reported_at = EXCLUDED.last_reported_at
      `.execute(db);

      return 'feito';
    },
  };
}
