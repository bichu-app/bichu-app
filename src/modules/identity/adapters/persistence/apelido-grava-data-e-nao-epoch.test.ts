/** `handles.claimed_at` recebe `Date`, e **nunca o `Instant` cru**. */
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
import type { Instant, UserId } from '../../../../shared/types/brands.js';
import { criarIdentityRepository } from './kysely-identity-repository.js';

const DONO = 'a1b2c3d4-0000-7000-8000-000000000001' as UserId;
/** O mesmo instante da medicao de 18/10/2026, para o numero do relato aparecer. */
const AGORA = 1_792_376_135_079 as Instant;

interface ConsultaCapturada {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

/** Kysely com o compilador REAL do Postgres e um driver que captura. */
function bancoQueCaptura(linhaDaConta: Record<string, unknown>): {
  db: Db;
  consultas: ConsultaCapturada[];
} {
  const consultas: ConsultaCapturada[] = [];

  const conexao: DatabaseConnection = {
    executeQuery: <R>(compilada: CompiledQuery): Promise<QueryResult<R>> => {
      consultas.push({ sql: compilada.sql, parameters: compilada.parameters });
      const linhas = /^\s*select/i.test(compilada.sql) ? [linhaDaConta] : [];
      return Promise.resolve({ rows: linhas as R[] });
    },
    streamQuery: () => {
      throw new Error('`atualizarPerfil` nao usa `streamQuery`');
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

/** A linha que os `SELECT` deste caminho devolvem. */
const LINHA_DA_CONTA: Record<string, unknown> = {
  id: DONO,
  email: 'marina@exemplo.com.br',
  email_verified_at: null,
  display_name: 'Marina',
  handle: null,
  phone_e164: null,
  phone_verified_at: null,
  reference_postal_code: null,
  reference_neighborhood: null,
  reference_city: null,
  reference_state: null,
  pending_email: null,
  email_deliverable: true,
  status: 'active',
  sessions_invalid_before: new Date(Number(AGORA)),
  created_at: new Date(Number(AGORA)),
};

const ids = {
  uuidv7: () => 'a1b2c3d4-0000-7000-8000-0000000000ff',
  opaqueToken: () => {
    throw new Error('nao usado');
  },
  random128: () => new Uint8Array(16),
  random80: () => new Uint8Array(10),
};

/** O `INSERT INTO handles` entre as consultas capturadas. */
function insercaoDoApelido(consultas: readonly ConsultaCapturada[]): ConsultaCapturada {
  const achada = consultas.find((c) => /insert\s+into\s+"handles"/i.test(c.sql));
  assert.ok(
    achada !== undefined,
    'nenhum `INSERT INTO handles` foi emitido: o caminho medido nao rodou, e um caso ' +
      'que nao exercita nada passa por engano. Consultas vistas: ' +
      consultas.map((c) => c.sql).join(' | '),
  );
  return achada;
}

void describe('o apelido grava `claimed_at` como data, e nao como epoch (defeito de 18/10/2026)', () => {
  void it('ISCA: o `INSERT INTO handles` liga um `Date` em `claimed_at`, nunca um número', async () => {
    const { db, consultas } = bancoQueCaptura(LINHA_DA_CONTA);

    await criarIdentityRepository(db, ids).atualizarPerfil(DONO, { handle: 'medicao-134549' }, AGORA);

    const { sql, parameters } = insercaoDoApelido(consultas);
    const numeros = parameters.filter((p) => typeof p === 'number');
    assert.deepEqual(
      numeros,
      [],
      'um parâmetro numérico no `INSERT INTO handles` é o defeito de volta: o Postgres ' +
        'recusa com `22008 date/time field value out of range` e `PATCH /v1/me` responde ' +
        `500. SQL: ${sql} | parâmetros: ${JSON.stringify(parameters)}`,
    );
    assert.ok(
      parameters.some((p) => p instanceof Date),
      'nenhum `Date` entre os parâmetros: `claimed_at` é `timestamptz` e o carimbo ' +
        'precisa chegar como data. `typeof !== "number"` não bastaria aqui, porque ' +
        'string ISO passaria e também não é o que o tipo da coluna aceita.',
    );
  });

  void it('ISCA: o `Date` ligado é o instante de `agora`, e não um relógio de dentro do repositório', async () => {
    const { db, consultas } = bancoQueCaptura(LINHA_DA_CONTA);

    await criarIdentityRepository(db, ids).atualizarPerfil(DONO, { handle: 'medicao-134549' }, AGORA);

    const { parameters } = insercaoDoApelido(consultas);
    const datas = parameters.filter((p): p is Date => p instanceof Date);
    assert.ok(
      datas.some((d) => d.getTime() === Number(AGORA)),
      'o carimbo precisa ser o `Instant` que a aplicação passou: a regra de uma troca ' +
        'a cada 60 dias é lida desta coluna, e um `new Date()` tirado do relógio do ' +
        'processo faria a janela contar de outro momento. Datas ligadas: ' +
        JSON.stringify(datas),
    );
  });
});
