import { sql } from 'kysely';
import type { Db } from '../db/pool.js';
import type {
  CriteriosDeOrfandade,
  JobKind,
  JobQueue,
  JobRecord,
  TrabalhoRecuperado,
} from '../ports/job-queue.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { Instant } from '../types/brands.js';

function proximaTentativaEmMs(tentativas: number): number {
  return Math.min(60_000 * 5 ** (tentativas - 1), 6 * 60 * 60 * 1000);
}

const MOTIVO_DA_ORFANDADE =
  'trabalho orfao: o processo morreu segurando a reserva e a trava venceu';

export function criarJobQueue(db: Db, ids: IdGenerator): JobQueue {
  return {
    async enqueue<P>(kind: JobKind, payload: P, runAt?: Instant): Promise<string> {
      const id = ids.uuidv7();
      await db
        .insertInto('jobs')
        .values({
          id,
          kind,
          payload: JSON.stringify(payload),
          ...(runAt === undefined ? {} : { run_after: new Date(Number(runAt)) }),
        })
        .execute();
      return id;
    },

    async claim(limit: number): Promise<readonly JobRecord[]> {
      const resultado = await sql<{
        id: string;
        kind: string;
        payload: unknown;
        run_after: Date;
        attempts: number;
        max_attempts: number;
      }>`
        UPDATE jobs
           SET status = 'running',
               locked_at = now(),
               attempts = attempts + 1
         WHERE id IN (
           SELECT id
             FROM jobs
            WHERE status = 'pending'
              AND run_after <= now()
            ORDER BY run_after
            FOR UPDATE SKIP LOCKED
            LIMIT ${limit}
         )
        RETURNING id, kind, payload, run_after, attempts, max_attempts
      `.execute(db);

      return resultado.rows.map((l) => ({
        id: l.id,
        kind: l.kind as JobKind,
        payload: l.payload,
        runAt: l.run_after.getTime() as Instant,
        attempts: l.attempts,
        maxAttempts: l.max_attempts,
      }));
    },

    async complete(id: string): Promise<void> {
      await db
        .updateTable('jobs')
        .set({ status: 'done', finished_at: new Date(), locked_at: null })
        .where('id', '=', id)
        .execute();
    },

    async fail(id: string, error: string, retryAt?: Instant): Promise<void> {
      const atual = await db
        .selectFrom('jobs')
        .select(['attempts', 'max_attempts'])
        .where('id', '=', id)
        .executeTakeFirst();

      const tentativas = atual?.attempts ?? 1;
      const teto = atual?.max_attempts ?? 5;
      const desistiu = tentativas >= teto;

      await db
        .updateTable('jobs')
        .set({
          status: desistiu ? 'failed' : 'pending',
          last_error: error.slice(0, 2000),
          locked_at: null,
          ...(desistiu
            ? { finished_at: new Date() }
            : {
                run_after: new Date(
                  retryAt === undefined
                    ? Date.now() + proximaTentativaEmMs(tentativas)
                    : Number(retryAt),
                ),
              }),
        })
        .where('id', '=', id)
        .execute();
    },

    async recuperarOrfaos(criterios: CriteriosDeOrfandade): Promise<readonly TrabalhoRecuperado[]> {
      const segundosDoPrazo = criterios.prazoEmMs / 1000;

      const resultado = await sql<{
        id: string;
        kind: string;
        payload: unknown;
        orphan_recoveries: number;
        status: string;
      }>`
        UPDATE jobs AS j
           SET orphan_recoveries = j.orphan_recoveries + 1,
               locked_at = NULL,
               last_error = ${MOTIVO_DA_ORFANDADE} || ' (orfandade '
                            || (j.orphan_recoveries + 1) || ' de '
                            || ${criterios.tetoDeOrfandade} || ')',
               status = CASE
                 WHEN j.orphan_recoveries + 1 >= ${criterios.tetoDeOrfandade}
                 THEN 'failed' ELSE 'pending' END,
               finished_at = CASE
                 WHEN j.orphan_recoveries + 1 >= ${criterios.tetoDeOrfandade}
                 THEN now() ELSE j.finished_at END,
               run_after = CASE
                 WHEN j.orphan_recoveries + 1 >= ${criterios.tetoDeOrfandade}
                 THEN j.run_after
                 ELSE now() + make_interval(
                   secs => ${proximaTentativaEmMs(1)} / 1000.0) END
         WHERE j.id IN (
           SELECT id
             FROM jobs
            WHERE status = 'running'
              AND locked_at IS NOT NULL
              AND locked_at < now() - make_interval(secs => ${segundosDoPrazo})
            ORDER BY locked_at
            FOR UPDATE SKIP LOCKED
            LIMIT ${criterios.limite}
         )
        RETURNING j.id, j.kind, j.payload, j.orphan_recoveries, j.status
      `.execute(db);

      return resultado.rows.map((l) => ({
        id: l.id,
        kind: l.kind as JobKind,
        payload: l.payload,
        orfandades: l.orphan_recoveries,
        desistiu: l.status === 'failed',
      }));
    },
  };
}
