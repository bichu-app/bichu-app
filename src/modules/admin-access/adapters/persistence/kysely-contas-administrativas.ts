/**
 * `admin_accounts` em Postgres (ADR-0027 item 20.1).
 *
 * Este arquivo nao cita nenhuma tabela do app, e `cadastros-separados` (P21)
 * reprova se passar a citar.
 */
import { sql } from 'kysely';

import type { Db } from '../../../../shared/db/pool.js';
import type { AdminAccountId, Instant } from '../../../../shared/types/brands.js';
import type {
  ContaAdministrativa,
  RepositorioDeContasAdministrativas,
} from '../../ports/repositorio-de-contas-administrativas.js';

const COLUNAS = [
  'id',
  'email',
  'display_name',
  'role',
  'password_phc',
  'status',
  'blocked_reason',
  'sessions_invalid_before',
] as const;

interface LinhaDaConta {
  readonly id: string;
  readonly email: string;
  readonly display_name: string;
  readonly role: 'admin';
  readonly password_phc: string;
  readonly status: 'active' | 'disabled';
  readonly blocked_reason: 'failed_logins' | 'disavowed' | null;
  readonly sessions_invalid_before: Date;
}

function comoConta(linha: LinhaDaConta): ContaAdministrativa {
  return {
    id: linha.id as AdminAccountId,
    email: linha.email,
    displayName: linha.display_name,
    papel: linha.role,
    passwordPhc: linha.password_phc,
    status: linha.status,
    blockedReason: linha.blocked_reason,
    sessionsInvalidBefore: linha.sessions_invalid_before.getTime() as Instant,
  };
}

export function criarRepositorioDeContasAdministrativas(db: Db): RepositorioDeContasAdministrativas {
  return {
    async buscarPorEmail(email) {
      // `citext`: a comparacao ja ignora caixa, e o indice unico cobre a busca.
      const linha = await db.selectFrom('admin_accounts').select(COLUNAS).where('email', '=', email).executeTakeFirst();
      return linha === undefined ? undefined : comoConta(linha);
    },

    async buscarPorId(id) {
      const linha = await db.selectFrom('admin_accounts').select(COLUNAS).where('id', '=', id).executeTakeFirst();
      return linha === undefined ? undefined : comoConta(linha);
    },

    async listarAtivas() {
      const linhas = await db
        .selectFrom('admin_accounts')
        .select(COLUNAS)
        .where('status', '=', 'active')
        .orderBy('created_at')
        .execute();
      return linhas.map(comoConta);
    },

    async registrarLogin(id, agora) {
      await db.updateTable('admin_accounts').set({ last_login_at: new Date(agora) }).where('id', '=', id).execute();
    },

    async regravarSenha(id, passwordPhc, agora) {
      await db
        .updateTable('admin_accounts')
        .set({ password_phc: passwordPhc, password_updated_at: new Date(agora) })
        .where('id', '=', id)
        .execute();
    },

    async empurrarBarreira(trx, id, barreira) {
      await trx
        .updateTable('admin_accounts')
        .set({
          sessions_invalid_before: sql<Date>`greatest(${sql.val(new Date(barreira))}::timestamptz, sessions_invalid_before)`,
        })
        .where('id', '=', id)
        .execute();
    },

    async travarParaContarFalhas(trx, id) {
      await trx.selectFrom('admin_accounts').select('id').where('id', '=', id).forUpdate().execute();
    },

    async bloquear(trx, id, motivo, agora) {
      // `blocked_reason IS NULL` na clausula: o primeiro motivo fica. Um "nao
      // fui eu" sobre uma conta ja bloqueada por falhas nao apaga a historia.
      await trx
        .updateTable('admin_accounts')
        .set({ blocked_reason: motivo, blocked_at: new Date(agora) })
        .where('id', '=', id)
        .where('blocked_reason', 'is', null)
        .execute();
    },
  };
}
