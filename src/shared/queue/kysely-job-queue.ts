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
import type {
  CriteriosDeOrfandade,
  JobKind,
  JobQueue,
  JobRecord,
  TrabalhoRecuperado,
} from '../ports/job-queue.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { Instant } from '../types/brands.js';

/** Espera entre tentativas: 1 min, 5 min, 25 min... Teto de 6 h. */
function proximaTentativaEmMs(tentativas: number): number {
  return Math.min(60_000 * 5 ** (tentativas - 1), 6 * 60 * 60 * 1000);
}

/**
 * O texto que fica em `last_error` quando a recuperação encontra um órfão.
 *
 * Prefixo estável porque é por ele que se conta, no banco, quantas vezes o
 * worker morreu com trabalho na mão: `last_error LIKE 'trabalho orfao%'`. Erro
 * de biblioteca não tem forma previsível e não se conta; este tem.
 */
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

    /**
     * A ÚNICA saída de `running`, e é por isso que ela existe.
     *
     * Uma instrução só, com `SKIP LOCKED` pelo mesmo motivo de `claim`: duas
     * instâncias varrendo não podem recuperar a mesma linha duas vezes, e sem
     * `SKIP LOCKED` a segunda ficaria esperando a primeira para depois contar
     * uma orfandade que já foi contada.
     *
     * `locked_at IS NOT NULL` é redundante com `status = 'running'` no código de
     * hoje e não é redundante por acaso: uma linha `running` com `locked_at`
     * nulo é estado que não deveria existir, e `locked_at < agora - prazo`
     * devolveria `NULL` (nem verdadeiro nem falso) e a pularia em silêncio. O
     * predicado explícito é o que faz essa linha aparecer como o que ela é —
     * presa, e não recuperada.
     */
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
               -- A retentativa NÃO é imediata. Devolver com `run_after = now()`
               -- faria a carga que acabou de derrubar o processo ser a primeira
               -- coisa que o processo novo pega, e a queda viraria laço apertado.
               -- A mesma espera de `fail` dá folga para o processo subir, drenar
               -- o que é saudável, e só então reencontrar o suspeito.
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
