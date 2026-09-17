/**
 * Pool de conexões e unidade de trabalho.
 *
 * Uma transação explícita onde há mais de uma escrita relacionada. Os dois casos
 * desta entrega em que isso decide correção:
 *
 * - **rotação de refresh**: consumir o token antigo e gravar o novo precisam
 *   acontecer juntos, senão uma corrida entre dois pedidos do mesmo aparelho
 *   grava duas famílias ou perde a detecção de reuso;
 * - **rehash transparente de senha**: a nova derivação é gravada dentro da mesma
 *   transação do login, e não depois.
 */
import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import pg from 'pg';
import type { Database } from './schema.js';

const { Pool, types } = pg;

/**
 * `bigint` (OID 20) chega como string por padrão no driver, porque nem todo
 * bigint cabe num `number` de JavaScript. Nas colunas que este produto usa
 * (contadores e totais de página) ele cabe, e devolver string faria `count`
 * comparar texto com número em silêncio. A conversão é declarada aqui, num
 * lugar só.
 */
types.setTypeParser(types.builtins.INT8, (valor) => Number.parseInt(valor, 10));

export type Db = Kysely<Database>;
export type DbTransaction = Transaction<Database>;
/** Aceita tanto a conexão quanto uma transação em curso. */
export type DbExecutor = Db | DbTransaction;

export interface DbHandle {
  readonly db: Db;
  close(): Promise<void>;
  ping(): Promise<void>;
}

export function createDb(databaseUrl: string): DbHandle {
  const pool = new Pool({
    connectionString: databaseUrl,
    // Teto baixo de propósito: a instância do MVP divide 2 GB com o Postgres, e
    // pool grande transforma pico de tráfego em falta de memória no banco, que
    // é o processo que o sistema mata primeiro (ADR-0013).
    max: Number.parseInt(process.env['DATABASE_POOL_MAX'] ?? '10', 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  return {
    db,
    close: async () => {
      await db.destroy();
    },
    ping: async () => {
      await sql`select 1`.execute(db);
    },
  };
}

/**
 * Assume um papel de banco pelo tempo da transação.
 *
 * `SET LOCAL` e não `SET`: o papel volta sozinho no fim da transação, inclusive
 * quando ela falha. Um `SET ROLE` sem `LOCAL` sobreviveria à conexão devolvida
 * ao pool e o próximo pedido, sem relação nenhuma, rodaria com o papel errado.
 */
export async function assumirPapel(trx: DbTransaction, papel: string): Promise<void> {
  if (!/^[a-z_][a-z0-9_]*$/.test(papel)) {
    throw new Error(`Nome de papel de banco inválido: ${papel}`);
  }
  await sql.raw(`set local role ${papel}`).execute(trx);
}
