/**
 * `ComandoDeContas` em Postgres (ADR-0027 item 20.3).
 *
 * Cada escrita e UMA transacao com o evento da trilha dentro dela
 * (`TrilhaTransacional.recordIn`, D49): falha da trilha desfaz a escrita, e o
 * teste de integracao forca essa falha para provar que nao sobra conta.
 *
 * ## Por que a barreira E a revogacao linha a linha
 *
 * `sessions_invalid_before` e o que a guarda le a cada requisicao: empurra-la
 * derruba toda sessao da conta na proxima chamada, inclusive a que nasceu
 * entre a leitura e o commit. A revogacao linha a linha grava o MOTIVO em cada
 * sessao, que e o que a investigacao le depois. As duas andam juntas.
 *
 * Nada aqui le `users`: o unico contato do comando com o mundo do app (D63)
 * mora no ponto de composicao, `src/bin/conta-admin.ts`.
 */
import { sql } from 'kysely';

import type { Db, DbTransaction } from '../../../../shared/db/pool.js';
import type { IdGenerator } from '../../../../shared/ports/id-generator.js';
import type { AdminAccountId } from '../../../../shared/types/brands.js';
import type { AuditAction, AuditEvent, TrilhaTransacional } from '../../../audit/ports/audit-log.js';
import type { MotivoDeRevogacaoAdministrativa } from '../../ports/sessao-administrativa-repository.js';
import type { ComandoDeContas, ContaNoComando } from '../../ports/comando-de-contas.js';

function ehViolacaoDeUnicidade(erro: unknown): boolean {
  return typeof erro === 'object' && erro !== null && (erro as { code?: unknown }).code === '23505';
}

/**
 * O evento do comando, montado de um jeito so. `surface` e `command` depois do
 * que veio de fora: quem monta os dados nao consegue apagar de onde a escrita
 * saiu.
 */
export function eventoDoComandoDeConta(
  action: AuditAction,
  dados: {
    readonly id: AdminAccountId;
    readonly operador: string;
    readonly before?: Record<string, unknown>;
    readonly after?: Record<string, unknown>;
    readonly metadata?: Record<string, unknown>;
  },
): AuditEvent {
  return {
    actorKind: 'system',
    action,
    resourceKind: 'admin_account',
    resourceId: dados.id,
    before: dados.before,
    after: dados.after,
    metadata: { ...dados.metadata, operator: dados.operador, surface: 'command', command: 'conta-admin' },
  };
}

async function revogarSessoes(
  trx: DbTransaction,
  id: AdminAccountId,
  motivo: MotivoDeRevogacaoAdministrativa,
  quando: Date,
): Promise<number> {
  const resultado = await trx
    .updateTable('admin_sessions')
    .set({ revoked_at: quando, revoked_reason: motivo })
    .where('admin_account_id', '=', id)
    .where('revoked_at', 'is', null)
    .executeTakeFirst();
  return Number(resultado.numUpdatedRows);
}

const barreira = (quando: Date) =>
  sql<Date>`greatest(${sql.val(quando)}::timestamptz, sessions_invalid_before)`;

export function criarComandoDeContas(deps: {
  readonly db: Db;
  readonly ids: IdGenerator;
  readonly trilha: TrilhaTransacional;
}): ComandoDeContas {
  const { db, ids, trilha } = deps;

  return {
    async buscarPorEmail(email) {
      const linha = await db
        .selectFrom('admin_accounts')
        .select(['id', 'email', 'display_name', 'status', 'blocked_reason'])
        .where('email', '=', email)
        .executeTakeFirst();
      if (linha === undefined) return undefined;
      const conta: ContaNoComando = {
        id: linha.id as AdminAccountId,
        email: linha.email,
        displayName: linha.display_name,
        status: linha.status,
        blockedReason: linha.blocked_reason,
      };
      return conta;
    },

    async listar() {
      const linhas = await db
        .selectFrom('admin_accounts')
        .select(['email', 'display_name', 'status', 'blocked_reason', 'last_login_at'])
        .orderBy('created_at')
        .execute();
      return linhas.map((l) => ({
        email: l.email,
        displayName: l.display_name,
        status: l.status,
        blockedReason: l.blocked_reason,
        lastLoginAt: l.last_login_at,
      }));
    },

    async criar({ email, nome, passwordPhc, operador, agora }) {
      const id = ids.uuidv7() as AdminAccountId;
      const quando = new Date(agora);
      try {
        await db.transaction().execute(async (trx) => {
          await trx
            .insertInto('admin_accounts')
            .values({
              id,
              email,
              display_name: nome,
              password_phc: passwordPhc,
              password_updated_at: quando,
              sessions_invalid_before: quando,
            })
            .execute();
          await trilha.recordIn(
            trx,
            eventoDoComandoDeConta('admin.account.created', { id, operador, after: { status: 'active', role: 'admin' } }),
          );
        });
        return id;
      } catch (erro) {
        if (ehViolacaoDeUnicidade(erro)) return 'email_em_uso';
        throw erro;
      }
    },

    redefinirSenha({ id, passwordPhc, operador, agora }) {
      const quando = new Date(agora);
      return db.transaction().execute(async (trx) => {
        const antes = await trx
          .selectFrom('admin_accounts')
          .select(['blocked_reason'])
          .where('id', '=', id)
          .forUpdate()
          .executeTakeFirstOrThrow();
        await trx
          .updateTable('admin_accounts')
          .set({
            password_phc: passwordPhc,
            password_updated_at: quando,
            sessions_invalid_before: barreira(quando),
            blocked_reason: null,
            blocked_at: null,
          })
          .where('id', '=', id)
          .execute();
        const sessoesRevogadas = await revogarSessoes(trx, id, 'password_reset', quando);
        await trilha.recordIn(
          trx,
          eventoDoComandoDeConta('admin.account.password_reset', {
            id,
            operador,
            before: { blocked_reason: antes.blocked_reason },
            after: { blocked_reason: null },
            metadata: { admin_sessions_revoked: sessoesRevogadas },
          }),
        );
        return { sessoesRevogadas };
      });
    },

    desativar({ id, operador, agora }) {
      const quando = new Date(agora);
      return db.transaction().execute(async (trx) => {
        const mudou = await trx
          .updateTable('admin_accounts')
          .set({ status: 'disabled', disabled_at: quando, sessions_invalid_before: barreira(quando) })
          .where('id', '=', id)
          .where('status', '=', 'active')
          .returning('id')
          .executeTakeFirst();
        if (mudou === undefined) return { mudou: false, sessoesRevogadas: 0 };
        const sessoesRevogadas = await revogarSessoes(trx, id, 'account_disabled', quando);
        await trilha.recordIn(
          trx,
          eventoDoComandoDeConta('admin.account.disabled', {
            id,
            operador,
            before: { status: 'active' },
            after: { status: 'disabled' },
            metadata: { admin_sessions_revoked: sessoesRevogadas },
          }),
        );
        return { mudou: true, sessoesRevogadas };
      });
    },

    reativar({ id, passwordPhc, operador, agora }) {
      const quando = new Date(agora);
      return db.transaction().execute(async (trx) => {
        const mudou = await trx
          .updateTable('admin_accounts')
          .set({
            status: 'active',
            disabled_at: null,
            password_phc: passwordPhc,
            password_updated_at: quando,
            sessions_invalid_before: barreira(quando),
            blocked_reason: null,
            blocked_at: null,
          })
          .where('id', '=', id)
          .where('status', '=', 'disabled')
          .returning('id')
          .executeTakeFirst();
        if (mudou === undefined) return { mudou: false };
        await trilha.recordIn(
          trx,
          eventoDoComandoDeConta('admin.account.enabled', {
            id,
            operador,
            before: { status: 'disabled' },
            after: { status: 'active' },
            metadata: { password_replaced: true },
          }),
        );
        return { mudou: true };
      });
    },

    encerrarSessoes({ id, operador, agora }) {
      const quando = new Date(agora);
      return db.transaction().execute(async (trx) => {
        await trx
          .updateTable('admin_accounts')
          .set({ sessions_invalid_before: barreira(quando) })
          .where('id', '=', id)
          .execute();
        const sessoesRevogadas = await revogarSessoes(trx, id, 'account_invalidated', quando);
        await trilha.recordIn(
          trx,
          eventoDoComandoDeConta('admin.account.sessions_closed', {
            id,
            operador,
            metadata: { admin_sessions_revoked: sessoesRevogadas },
          }),
        );
        return { sessoesRevogadas };
      });
    },
  };
}
