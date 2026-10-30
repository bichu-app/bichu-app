/** Um `Kysely` de mentira que **DEVOLVE LINHA** e guarda o SQL compilado. */
import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from 'kysely';

/** Decide as linhas de uma consulta a partir do SQL dela. */
export type RespostaDeMentira = (sql: string) => readonly unknown[];

export interface BancoDeMentira<Esquema> {
  readonly db: Kysely<Esquema>;
  /** O SQL de cada consulta, na ordem em que foi executada. */
  readonly compilado: string[];
}

export function bancoDeMentira<Esquema>(
  responder: RespostaDeMentira,
): BancoDeMentira<Esquema> {
  const compilado: string[] = [];
  const conexao: DatabaseConnection = {
    executeQuery: <R>(consulta: { sql: string }): Promise<QueryResult<R>> => {
      compilado.push(consulta.sql);
      return Promise.resolve({ rows: responder(consulta.sql) as R[] });
    },
    streamQuery: () => {
      throw new Error('o banco de mentira nao transmite');
    },
  };
  const driver: Driver = {
    init: () => Promise.resolve(),
    acquireConnection: () => Promise.resolve(conexao),
    beginTransaction: () => Promise.resolve(),
    commitTransaction: () => Promise.resolve(),
    rollbackTransaction: () => Promise.resolve(),
    releaseConnection: () => Promise.resolve(),
    destroy: () => Promise.resolve(),
  };
  const db = new Kysely<Esquema>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (instancia) => new PostgresIntrospector(instancia),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
  return { db, compilado };
}
