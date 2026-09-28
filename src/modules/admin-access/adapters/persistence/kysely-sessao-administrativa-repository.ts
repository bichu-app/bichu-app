/**
 * `admin_sessions`, `admin_reauth_tokens` e `admin_session_alerts` em Postgres
 * (ADR-0027, apendice A.1 e item 20).
 *
 * As escritas usam a transacao recebida, e nunca abrem a propria: e a
 * transacao da escrita auditada, e o evento da trilha vai nela.
 */
import type { Db } from '../../../../shared/db/pool.js';
import type { AdminAccountId, Instant } from '../../../../shared/types/brands.js';
import type {
  SessaoAdministrativaRepository,
  SessaoComConta,
} from '../../ports/sessao-administrativa-repository.js';

/** O teto de `user_agent` na migracao. Cortado aqui para o `CHECK` nunca derrubar um login. */
const TAMANHO_MAXIMO_DO_USER_AGENT = 512;

export function criarSessaoAdministrativaRepository(db: Db): SessaoAdministrativaRepository {
  return {
    async contaParaAGuarda(tokenHash) {
      // Uma consulta so, com a conta junto: a guarda le papel, estado e
      // barreira NESTA requisicao (D37), e a sessao sem a conta nao decide nada.
      const linha = await db
        .selectFrom('admin_sessions as s')
        .innerJoin('admin_accounts as c', 'c.id', 's.admin_account_id')
        .select([
          's.id as sessao_id',
          's.admin_account_id',
          's.token_hash',
          's.csrf_token_hash',
          's.created_at',
          's.last_seen_at',
          's.idle_expires_at',
          's.absolute_expires_at',
          's.revoked_at',
          'c.email',
          'c.display_name',
          'c.role',
          'c.password_phc',
          'c.status',
          'c.blocked_reason',
          'c.sessions_invalid_before',
        ])
        .where('s.token_hash', '=', tokenHash)
        .executeTakeFirst();
      if (linha === undefined) return undefined;
      const id = linha.admin_account_id as AdminAccountId;
      const encontrada: SessaoComConta = {
        sessao: {
          id: linha.sessao_id,
          adminAccountId: id,
          tokenHash: linha.token_hash,
          csrfTokenHash: linha.csrf_token_hash,
          createdAt: linha.created_at.getTime() as Instant,
          lastSeenAt: linha.last_seen_at.getTime() as Instant,
          idleExpiresAt: linha.idle_expires_at.getTime() as Instant,
          absoluteExpiresAt: linha.absolute_expires_at.getTime() as Instant,
          revokedAt: linha.revoked_at === null ? null : (linha.revoked_at.getTime() as Instant),
        },
        conta: {
          id,
          email: linha.email,
          displayName: linha.display_name,
          papel: linha.role,
          passwordPhc: linha.password_phc,
          status: linha.status,
          blockedReason: linha.blocked_reason,
          sessionsInvalidBefore: linha.sessions_invalid_before.getTime() as Instant,
        },
      };
      return encontrada;
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
          admin_account_id: nova.adminAccountId,
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

    async revogarTodasDaConta(trx, adminAccountId, motivo, agora) {
      const resultado = await trx
        .updateTable('admin_sessions')
        .set({ revoked_at: new Date(agora), revoked_reason: motivo })
        .where('admin_account_id', '=', adminAccountId)
        .where('revoked_at', 'is', null)
        .executeTakeFirst();
      return Number(resultado.numUpdatedRows);
    },

    async criarJanela(trx, nova) {
      await trx
        .insertInto('admin_reauth_tokens')
        .values({
          id: nova.id,
          session_id: nova.sessionId,
          admin_account_id: nova.adminAccountId,
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
        .where('admin_account_id', '=', consumo.adminAccountId)
        .where('scope', '=', consumo.escopo)
        .where('consumed_at', 'is', null)
        .where('expires_at', '>', new Date(consumo.agora))
        .returning('id')
        .executeTakeFirst();
      return linha !== undefined;
    },

    async criarAviso(novo) {
      await db
        .insertInto('admin_session_alerts')
        .values({
          id: novo.id,
          admin_account_id: novo.adminAccountId,
          session_id: novo.sessionId,
          token_hash: novo.tokenHash,
          expires_at: new Date(novo.expiraEm),
        })
        .execute();
    },

    async travarAvisoValido(trx, tokenHash, agora) {
      const linha = await trx
        .selectFrom('admin_session_alerts')
        .select(['id', 'admin_account_id'])
        .where('token_hash', '=', tokenHash)
        .where('consumed_at', 'is', null)
        .where('expires_at', '>', new Date(agora))
        .forUpdate()
        .executeTakeFirst();
      return linha === undefined
        ? undefined
        : { id: linha.id, adminAccountId: linha.admin_account_id as AdminAccountId };
    },

    async consumirAviso(trx, id, agora) {
      await trx.updateTable('admin_session_alerts').set({ consumed_at: new Date(agora) }).where('id', '=', id).execute();
    },
  };
}
