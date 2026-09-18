/**
 * A fila, no próprio Postgres, com `FOR UPDATE SKIP LOCKED`.
 *
 * Não é fila gerenciada e não vai ser tão cedo (ADR-0001 e ADR-0012): é um
 * componente a menos para operar, monitorar e migrar de nuvem, e `SKIP LOCKED`
 * já é seguro para várias instâncias — que é a condição do passo 4 da §16.
 *
 * ## O que `SKIP LOCKED` resolve, e por que não dá para simplificar
 *
 * Sem ele, dois workers que rodam `SELECT ... ORDER BY run_after LIMIT 1`
 * enxergam a **mesma linha**: o segundo fica bloqueado esperando o primeiro
 * soltar, e quando solta pega um trabalho já executado. `SKIP LOCKED` faz o
 * segundo **pular** a linha travada e pegar a próxima. O resultado é que
 * acrescentar um worker acrescenta vazão, em vez de acrescentar contenção.
 *
 * A reserva e a marcação de `running` acontecem **na mesma transação**. Entre
 * ler e marcar não pode existir um instante em que outro worker veja a linha
 * como disponível.
 *
 * ## `attempts` é incrementado na RESERVA, e não na falha
 *
 * Um trabalho que derruba o processo — estouro de memória decodificando imagem,
 * que é exatamente o risco do SEC-007 — nunca chega a executar o `fail`. Se a
 * contagem subisse só ali, esse trabalho voltaria para a fila com `attempts`
 * zerado, seria pego de novo, derrubaria de novo, para sempre. Contar na reserva
 * faz o veneno ter fim.
 */
import { sql } from 'kysely';
import type { Db } from '../db/pool.js';
import type { JobKind, JobQueue, JobRecord } from '../ports/job-queue.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { Instant } from '../types/brands.js';

/** Espera entre tentativas: 1 min, 5 min, 25 min... Teto de 6 h. */
function proximaTentativaEmMs(tentativas: number): number {
  return Math.min(60_000 * 5 ** (tentativas - 1), 6 * 60 * 60 * 1000);
}

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
      // Uma instrução só: o `UPDATE` usa o `SELECT ... SKIP LOCKED` como fonte,
      // então reservar e marcar são atômicos sem transação explícita.
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
          // `failed` é estado FINAL. O trabalho fica na tabela com o erro para
          // quem for investigar: apagar o que falhou é apagar a evidência.
          status: desistiu ? 'failed' : 'pending',
          // A mensagem é truncada porque erro de biblioteca de imagem às vezes
          // traz o arquivo inteiro, e a coluna não é lugar de guardar foto.
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
  };
}
