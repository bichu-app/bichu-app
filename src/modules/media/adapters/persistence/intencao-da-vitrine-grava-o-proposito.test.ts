import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type QueryResult,
} from 'kysely';

import type { Db } from '../../../../shared/db/pool.js';
import type { Database } from '../../../../shared/db/schema.js';
import { registrarIntencaoDaVitrineDoUsuario } from './kysely-imagem-de-catalogo.js';

const DONA = 'a1b2c3d4-0000-7000-8000-000000000001';
const UPLOAD = '01a151f1-5d7f-708d-97fb-97d65d8f733c';
const CHAVE = 'people/original/p9XabsiTMBuCmRst9SW_Lw';

interface ConsultaCapturada {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

function bancoQueCaptura(): { db: Db; consultas: ConsultaCapturada[] } {
  const consultas: ConsultaCapturada[] = [];

  const conexao: DatabaseConnection = {
    executeQuery: <R>(compilada: CompiledQuery): Promise<QueryResult<R>> => {
      consultas.push({ sql: compilada.sql, parameters: compilada.parameters });
      return Promise.resolve({ rows: [] as R[] });
    },
    streamQuery: () => {
      throw new Error('o registro da intencao nao usa `streamQuery`');
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

  const db = new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (instancia) => new PostgresIntrospector(instancia),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });

  return { db, consultas };
}

async function intencaoGravada(): Promise<ConsultaCapturada> {
  const { db, consultas } = bancoQueCaptura();

  await registrarIntencaoDaVitrineDoUsuario(db, {
    id: UPLOAD,
    userId: DONA,
    objectKey: CHAVE,
    declaredType: 'image/jpeg',
    maxBytes: 5_242_880,
    expiresAt: new Date('2026-10-19T02:25:35.039Z'),
    purpose: 'user_showcase',
  });

  const achada = consultas.find((c) =>
    /insert\s+into\s+"catalog_upload_intents"/i.test(c.sql),
  );
  assert.ok(
    achada !== undefined,
    'nenhum `INSERT INTO catalog_upload_intents` foi emitido: o caminho medido nao ' +
      'rodou, e um caso que nao exercita nada passa por engano. Consultas vistas: ' +
      consultas.map((c) => c.sql).join(' | '),
  );
  return achada;
}

void describe('a intencao da vitrine grava o proposito recebido (defeito de 18/10/2026)', () => {
  void it('ISCA: o `INSERT` liga `user_showcase`, e nunca `network_event`', async () => {
    const { sql, parameters } = await intencaoGravada();

    assert.ok(
      !parameters.includes('network_event'),
      'a intenção da vitrine foi gravada com o propósito da CAPA DO ENCONTRO. É o ' +
        'defeito de 18/10/2026: `POST /v1/me/showcase/photo-intents` devolve 201 e ' +
        '`PUT /v1/me/showcase` devolve 404 para a mesma `upload_id`, porque a ' +
        'confirmação procura `purpose = user_showcase`. O efeito não é uma foto ' +
        `errada: é nenhuma foto salva. SQL: ${sql}`,
    );
    assert.ok(
      parameters.includes('user_showcase'),
      'o propósito da vitrine precisa estar entre os parâmetros ligados: é ele que a ' +
        `confirmação cobra na cláusula WHERE. Parâmetros: ${JSON.stringify(parameters)}`,
    );
  });

  void it('ISCA: a coluna `purpose` está no `INSERT`, e o autor é `user_id` e não `admin_account_id`', async () => {
    const { sql, parameters } = await intencaoGravada();

    assert.match(sql, /"purpose"/, `a coluna \`purpose\` saiu do \`INSERT\`. SQL: ${sql}`);
    assert.ok(
      parameters.includes(DONA),
      `o dono não foi ligado. Parâmetros: ${JSON.stringify(parameters)}`,
    );
  });
});
