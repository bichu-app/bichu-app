/**
 * `admin_sessions` e `admin_reauth_tokens` em Postgres (ADR-0027, apendice A.1).
 *
 * As escritas usam a transacao recebida, e nunca abrem a propria: e a
 * transacao da escrita auditada, e o evento da trilha vai nela.
 */
import { sql } from 'kysely';

import type { Db } from '../../../../shared/db/pool.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';
import type {
  SessaoAdministrativaArmazenada,
  SessaoAdministrativaRepository,
} from '../../ports/sessao-administrativa-repository.js';

/** O teto de `user_agent` na migracao. Cortado aqui para o `CHECK` nunca derrubar um login. */
const TAMANHO_MAXIMO_DO_USER_AGENT = 512;

export function criarSessaoAdministrativaRepository(db: Db): SessaoAdministrativaRepository {
  return {
    async buscarPorHash(tokenHash) {
      const linha = await db
        .selectFrom('admin_sessions')
        .select([
          'id',
          'admin_account_id',
          'token_hash',
          'csrf_token_hash',
          'created_at',
          'last_seen_at',
          'idle_expires_at',
          'absolute_expires_at',
          'revoked_at',
        ])
        .where('token_hash', '=', tokenHash)
        .executeTakeFirst();
      if (linha === undefined) return undefined;
      const armazenada: SessaoAdministrativaArmazenada = {
        id: linha.id,
        userId: linha.admin_account_id as UserId,
        tokenHash: linha.token_hash,
        csrfTokenHash: linha.csrf_token_hash,
        createdAt: linha.created_at.getTime() as Instant,
        lastSeenAt: linha.last_seen_at.getTime() as Instant,
        idleExpiresAt: linha.idle_expires_at.getTime() as Instant,
        absoluteExpiresAt: linha.absolute_expires_at.getTime() as Instant,
        revokedAt: linha.revoked_at === null ? null : (linha.revoked_at.getTime() as Instant),
      };
      return armazenada;
    },

    async papeisDaConta(userId) {
      const linhas = await db.selectFrom('user_roles').select('role').where('user_id', '=', userId).execute();
      return linhas.map((linha) => linha.role);
    },

    async renovarUso(id, agora, idleExpiresAt) {
      // `revoked_at IS NULL` na clausula: a renovacao nunca ressuscita uma
      // sessao revogada entre a leitura da guarda e esta escrita.
      await db
        .updateTable('admin_sessions')
        .set({ last_seen_at: new Date(agora), idle_expires_at: new Date(idleExpiresAt) })
        .where('id', '=', id)
        .where('revoked_at', 'is', null)
        .execute();
    },

    async criar(trx, nova) {
      await trx
        .insertInto('admin_sessions')
        .values({
          id: nova.id,
          admin_account_id: nova.userId,
          token_hash: nova.tokenHash,
          csrf_token_hash: nova.csrfTokenHash,
          created_at: new Date(nova.createdAt),
          last_seen_at: new Date(nova.lastSeenAt),
          idle_expires_at: new Date(nova.idleExpiresAt),
          absolute_expires_at: new Date(nova.absoluteExpiresAt),
          user_agent: nova.userAgent === undefined ? null : nova.userAgent.slice(0, TAMANHO_MAXIMO_DO_USER_AGENT),
          ip_hmac: nova.ipHmac,
        })
        .execute();
    },

    async revogar(trx, id, motivo, agora) {
      const resultado = await trx
        .updateTable('admin_sessions')
        .set({ revoked_at: new Date(agora), revoked_reason: motivo })
        .where('id', '=', id)
        .where('revoked_at', 'is', null)
        .executeTakeFirst();
      return resultado.numUpdatedRows > 0n;
    },

    async revogarTodasDaConta(trx, userId, motivo, agora) {
      const resultado = await trx
        .updateTable('admin_sessions')
        .set({ revoked_at: new Date(agora), revoked_reason: motivo })
        .where('admin_account_id', '=', userId)
        .where('revoked_at', 'is', null)
        .executeTakeFirst();
      return Number(resultado.numUpdatedRows);
    },

    async empurrarBarreira(trx, userId, barreira, agora) {
      await trx
        .updateTable('users')
        .set({
          sessions_invalid_before: sql<Date>`greatest(${sql.val(new Date(barreira))}::timestamptz, sessions_invalid_before)`,
          updated_at: new Date(agora),
        })
        .where('id', '=', userId)
        .execute();
    },

    async criarJanela(trx, nova) {
      await trx
        .insertInto('admin_reauth_tokens')
        .values({
          id: nova.id,
          session_id: nova.sessionId,
          admin_account_id: nova.userId,
          scope: nova.escopo,
          token_hash: nova.tokenHash,
          issued_at: new Date(nova.emitidaEm),
          expires_at: new Date(nova.expiraEm),
        })
        .execute();
    },

    async consumirJanela(consumo) {
      // Todas as amarras na MESMA clausula do UPDATE que consome (ADR-0021):
      // ler e depois decidir deixaria duas requisicoes simultaneas gastarem a
      // mesma janela.
      const linha = await db
        .updateTable('admin_reauth_tokens')
        .set({ consumed_at: new Date(consumo.agora) })
        .where('token_hash', '=', consumo.tokenHash)
        .where('session_id', '=', consumo.sessionId)
        .where('admin_account_id', '=', consumo.userId)
        .where('scope', '=', consumo.escopo)
        .where('consumed_at', 'is', null)
        .where('expires_at', '>', new Date(consumo.agora))
        .returning('id')
        .executeTakeFirst();
      return linha !== undefined;
    },
  };
}
