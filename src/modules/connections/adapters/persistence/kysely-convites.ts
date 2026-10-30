/** A persistência do **convite de conexão** e do **alvo por apelido**. */
import { sql, type CompiledQuery, type Kysely } from 'kysely';

import type { Database } from '../../../../shared/db/schema.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';
import { hashDeToken } from '../../../../shared/crypto/digest.js';
import { comoData } from '../../../../shared/time/clock.js';
import type { Clock } from '../../../../shared/ports/index.js';
import type { IdGenerator } from '../../../../shared/ports/id-generator.js';
import type {
  ConviteEmitido,
  ConviteResolvido,
  EmissorDeConvite,
  ResolvedorDeApelido,
  ResolvedorDeConvite,
} from '../../ports/convite-de-conexao.js';

/** Trinta dias em milissegundos: o prazo do convite, igual ao do pendente. */
const VALIDADE_DO_CONVITE_MS = 30 * 24 * 60 * 60 * 1000;

interface LinhaDoConvite {
  readonly owner_user_id: string;
  readonly handle: string;
}

interface LinhaDoAlvo {
  readonly user_id: string;
}

/**
 * **O convite de um token, se ele resolve para quem chama.** Seis predicados na
 * mesma consulta:
 */
export function construtorDoConvitePorToken(
  db: Kysely<Database>,
  token: string,
  quemChama: UserId,
  agora: Instant,
): CompiledQuery<LinhaDoConvite> {
  return db
    .selectFrom('connection_invites as i')
    .innerJoin('users as u', 'u.id', 'i.owner_user_id')
    .innerJoin('handles as h', 'h.user_id', 'u.id')
    .select(['i.owner_user_id as owner_user_id', 'h.handle as handle'])
    .where('i.token_hash', '=', hashDeToken(token))
    .where(sql<boolean>`i.revoked_at IS NULL`)
    .where(sql<boolean>`i.expires_at > ${comoData(agora)}::timestamptz`)
    .where('h.kind', '=', 'pessoa')
    .where(sql<boolean>`conta_habilitada(u.id)`)
    .where(sql<boolean>`conta_habilitada(${quemChama}::uuid)`)
    .where(sql<boolean>`NOT bloqueio_entre(i.owner_user_id, ${quemChama}::uuid)`)
    .compile();
}

/**
 * **A conta de um apelido, se ela existe para quem pergunta.** Os MESMOS seis
 * predicados de `construtorDoPerfilPorApelido`, e a igualdade é o ponto: um
 * apelido que o perfil não mostra é um apelido ao qual o pedido não chega, e
 * vice-versa.
 */
export function construtorDoAlvoPorApelido(
  db: Kysely<Database>,
  apelido: string,
  quemPergunta: UserId,
): CompiledQuery<LinhaDoAlvo> {
  return db
    .selectFrom('handles as h')
    .innerJoin('users as u', 'u.id', 'h.user_id')
    .select('u.id as user_id')
    .where('h.handle', '=', apelido)
    .where('h.kind', '=', 'pessoa')
    .where(sql<boolean>`conta_habilitada(u.id)`)
    .where(sql<boolean>`conta_habilitada(${quemPergunta}::uuid)`)
    .where(sql<boolean>`NOT bloqueio_entre(u.id, ${quemPergunta}::uuid)`)
    .where(
      sql<boolean>`NOT perfil_ocultado_para_quem_denunciou(u.public_ref, ${quemPergunta}::uuid)`,
    )
    .compile();
}

/** O resolvedor de convite de PRODUÇÃO. */
export function criarResolvedorDeConvite(
  db: Kysely<Database>,
  clock: Clock,
): ResolvedorDeConvite {
  return {
    async resolver(token: string, quemChama: UserId): Promise<ConviteResolvido | undefined> {
      const { rows } = await db.executeQuery(
        construtorDoConvitePorToken(db, token, quemChama, clock.now()),
      );
      const linha = rows[0];
      if (linha === undefined) return undefined;
      return {
        alvo: linha.owner_user_id as UserId,
        origem: 'invite_link',
        apelido: linha.handle,
      };
    },
  };
}

/** O resolvedor de apelido de produção. */
export function criarResolvedorDeApelido(db: Kysely<Database>): ResolvedorDeApelido {
  return {
    async resolver(apelido: string, quemPergunta: UserId): Promise<UserId | undefined> {
      const { rows } = await db.executeQuery(
        construtorDoAlvoPorApelido(db, apelido, quemPergunta),
      );
      const linha = rows[0];
      return linha === undefined ? undefined : (linha.user_id as UserId);
    },
  };
}

/** O emissor de convite. */
export function criarEmissorDeConvite(
  db: Kysely<Database>,
  ids: IdGenerator,
): EmissorDeConvite {
  return {
    async emitir(dono: UserId, agora: Instant): Promise<ConviteEmitido> {
      const token = ids.opaqueToken();
      const expiraEm = (agora + VALIDADE_DO_CONVITE_MS) as Instant;

      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable('connection_invites')
          .set({ revoked_at: comoData(agora) })
          .where('owner_user_id', '=', dono)
          .where(sql<boolean>`revoked_at IS NULL`)
          .execute();
        await trx
          .insertInto('connection_invites')
          .values({
            id: ids.uuidv7(),
            owner_user_id: dono,
            token_hash: hashDeToken(token),
            expires_at: comoData(expiraEm),
            revoked_at: null,
          })
          .execute();
      });

      return { token, expiraEm };
    },

    async revogar(dono: UserId, agora: Instant): Promise<void> {
      await db
        .updateTable('connection_invites')
        .set({ revoked_at: comoData(agora) })
        .where('owner_user_id', '=', dono)
        .where(sql<boolean>`revoked_at IS NULL`)
        .execute();
    },
  };
}
