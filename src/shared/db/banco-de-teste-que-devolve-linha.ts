/**
 * Um `Kysely` de mentira que **DEVOLVE LINHA** e guarda o SQL compilado.
 *
 * Existe pelo mesmo motivo de `http/teto-de-teste.ts`: o cenario precisa de um
 * banco de verdade do ponto de vista do construtor de consulta, e monta-lo a
 * mao em cada arquivo faria cada teste exercitar uma fiacao ligeiramente
 * diferente da que roda.
 *
 * ## POR QUE NAO A `DummyDriver` DO PROPRIO KYSELY
 *
 * `DummyDriver` devolve **vazio** para toda consulta. Num contador isso e
 * exatamente o duble que aprova sem mecanismo: a contagem sai zero, o caminho
 * COM marcador nunca e exercido, e um predicado que simplesmente nao exista
 * passa verde. **E a vacuidade conhecida deste repositorio numa forma nova** --
 * foi assim que um `open_case_id` fixo em nulo atravessou todos os portoes:
 * duble que devolve o que o servidor nao devolve deixa o caso verde sem o
 * mecanismo.
 *
 * Aqui quem responde e [RespostaDeMentira], escolhida pelo CONTEUDO do SQL, e
 * nunca pela posicao da consulta: fosse pela posicao, reordenar um
 * `Promise.all` passaria a devolver o numero errado em silencio.
 */
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
