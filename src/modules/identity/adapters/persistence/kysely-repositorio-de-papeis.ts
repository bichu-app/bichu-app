/**
 * `RepositorioDePapeis` em Postgres (BICHUS-260, ADR-0027 D51).
 *
 * Cada escrita e UMA transacao com o evento da trilha dentro dela
 * (`TrilhaTransacional.recordIn`, D49): falha da trilha desfaz o papel.
 *
 * ## Idempotente pelo estado, nao pelo erro
 *
 * `INSERT ... ON CONFLICT DO NOTHING RETURNING` e `DELETE ... RETURNING`: a
 * linha devolvida e o que diz se algo mudou, e so entao a barreira anda e a
 * trilha grava. Rodar duas vezes nao grava dois eventos nem empurra a barreira
 * de novo.
 *
 * ## Por que a barreira, e nao revogar linha por linha
 *
 * `sessions_invalid_before` e o mecanismo do SEC-006: `autenticar()` o le a
 * cada requisicao e `renovar()` o compara com o nascimento do refresh, entao
 * empurra-lo derruba o acesso de 15 minutos e toda familia de refresh de uma
 * vez, sem motivo novo na restricao de `refresh_tokens.revoked_reason`. A
 * recusa de D42 no login e na renovacao (BICHUS-259) fecha o resto.
 */
import { sql } from 'kysely';

import type { Db, DbTransaction } from '../../../../shared/db/pool.js';
import type { IdGenerator } from '../../../../shared/ports/id-generator.js';
import { comoData } from '../../../../shared/time/clock.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type { TrilhaTransacional } from '../../../audit/ports/audit-log.js';
import {
  eventoDoComandoDePapel,
  type ContaParaPapel,
  type RepositorioDePapeis,
} from '../../ports/repositorio-de-papeis.js';

function ehViolacaoDeUnicidade(erro: unknown): boolean {
  return typeof erro === 'object' && erro !== null && (erro as { code?: unknown }).code === '23505';
}

async function papeisNa(trx: DbTransaction, userId: UserId): Promise<string[]> {
  const linhas = await trx.selectFrom('user_roles').select('role').where('user_id', '=', userId).execute();
  return linhas.map((linha) => linha.role).sort();
}

export function criarRepositorioDePapeis(deps: {
  readonly db: Db;
  readonly ids: IdGenerator;
  readonly trilha: TrilhaTransacional;
}): RepositorioDePapeis {
  const { db, ids, trilha } = deps;

  return {
    async buscarContaPorEmail(email) {
      const conta = await db
        .selectFrom('users')
        .select(['id', 'status'])
        .where('email', '=', email)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (conta === undefined) return undefined;
      const papeis = await db.selectFrom('user_roles').select('role').where('user_id', '=', conta.id).execute();
      const resultado: ContaParaPapel = {
        id: conta.id as UserId,
        status: conta.status,
        papeis: papeis.map((linha) => linha.role),
      };
      return resultado;
    },

    conceder({ userId, papel, operador, agora }) {
      return db.transaction().execute(async (trx) => {
        const antes = await papeisNa(trx, userId);
        const inserida = await trx
          .insertInto('user_roles')
          .values({ user_id: userId, role: papel as 'admin' })
          .onConflict((oc) => oc.columns(['user_id', 'role']).doNothing())
          .returning('role')
          .executeTakeFirst();
        if (inserida === undefined) return { mudou: false, familiasMoveisDerrubadas: 0 };

        const vivas = await trx
          .selectFrom('refresh_tokens')
          .select(sql<number>`count(distinct family_id)::int`.as('familias'))
          .where('user_id', '=', userId)
          .where('revoked_at', 'is', null)
          .where('expires_at', '>', comoData(agora))
          .executeTakeFirstOrThrow();

        await trx
          .updateTable('users')
          .set({
            sessions_invalid_before: sql<Date>`greatest(${sql.val(comoData(agora))}::timestamptz, sessions_invalid_before)`,
            updated_at: comoData(agora),
          })
          .where('id', '=', userId)
          .execute();

        await trilha.recordIn(
          trx,
          eventoDoComandoDePapel('authz.role_granted', {
            userId,
            operador,
            before: { roles: antes },
            after: { roles: [...antes, papel].sort() },
            metadata: {
              role: papel,
              mobile_sessions_invalidated: true,
              live_refresh_families: vivas.familias,
            },
          }),
        );
        return { mudou: true, familiasMoveisDerrubadas: vivas.familias };
      });
    },

    revogar({ userId, papel, operador, agora }) {
      return db.transaction().execute(async (trx) => {
        const antes = await papeisNa(trx, userId);
        const apagada = await trx
          .deleteFrom('user_roles')
          .where('user_id', '=', userId)
          .where('role', '=', papel as 'admin')
          .returning('role')
          .executeTakeFirst();
        if (apagada === undefined) {
          return { mudou: false, sessoesAdministrativasRevogadas: 0, papeisRestantes: antes };
        }

        const sessoes = await trx
          .updateTable('admin_sessions')
          .set({ revoked_at: comoData(agora), revoked_reason: 'role_removed' })
          .where('user_id', '=', userId)
          .where('revoked_at', 'is', null)
          .executeTakeFirst();
        const revogadas = Number(sessoes.numUpdatedRows);
        const restantes = antes.filter((um) => um !== papel);

        await trilha.recordIn(
          trx,
          eventoDoComandoDePapel('authz.role_revoked', {
            userId,
            operador,
            before: { roles: antes },
            after: { roles: restantes },
            metadata: { role: papel, admin_sessions_revoked: revogadas },
          }),
        );
        return { mudou: true, sessoesAdministrativasRevogadas: revogadas, papeisRestantes: restantes };
      });
    },

    async criarContaAdministrativa({ email, papel, passwordPhc, operador, agora }) {
      const userId = ids.uuidv7() as UserId;
      const identityId = ids.uuidv7();
      const quando = comoData(agora);
      try {
        await db.transaction().execute(async (trx) => {
          await trx
            .insertInto('users')
            .values({
              id: userId,
              email,
              // Sem `email_verified_at`: quem roda o comando declara o
              // endereco, e declarar nao prova a caixa de entrada. A primeira
              // redefinicao de senha pelo e-mail e a prova.
              sessions_invalid_before: quando,
              created_at: quando,
              updated_at: quando,
            })
            .execute();
          await trx
            .insertInto('user_identities')
            .values({
              id: identityId,
              user_id: userId,
              provider: 'local',
              provider_subject: userId,
              email_at_provider: email,
              linked_at: quando,
            })
            .execute();
          await trx
            .insertInto('local_credentials')
            .values({ identity_id: identityId, password_phc: passwordPhc, password_updated_at: quando })
            .execute();
          // Sem `tutor`: a conta e dedicada (D42) e nao entra pelo app.
          await trx.insertInto('user_roles').values({ user_id: userId, role: papel as 'admin' }).execute();

          await trilha.recordIn(
            trx,
            eventoDoComandoDePapel('auth.account_created', {
              userId,
              operador,
              metadata: { dedicated_admin_account: true },
            }),
          );
          await trilha.recordIn(
            trx,
            eventoDoComandoDePapel('authz.role_granted', {
              userId,
              operador,
              before: { roles: [] },
              after: { roles: [papel] },
              metadata: { role: papel, account_created: true },
            }),
          );
        });
        return userId;
      } catch (erro) {
        if (ehViolacaoDeUnicidade(erro)) return 'email_em_uso';
        throw erro;
      }
    },
  };
}
