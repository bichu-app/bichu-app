/** Pool de conexões e unidade de trabalho. */
import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import pg from 'pg';
import type { Database } from './schema.js';

const { Pool, types } = pg;

/**
 * `bigint` (OID 20) chega como string por padrão no driver, porque nem todo bigint
 * cabe num `number` de JavaScript.
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

/** Assume um papel de banco pelo tempo da transação. */
export async function assumirPapel(trx: DbTransaction, papel: string): Promise<void> {
  if (!/^[a-z_][a-z0-9_]*$/.test(papel)) {
    throw new Error(`Nome de papel de banco inválido: ${papel}`);
  }
  await sql.raw(`set local role ${papel}`).execute(trx);
}
