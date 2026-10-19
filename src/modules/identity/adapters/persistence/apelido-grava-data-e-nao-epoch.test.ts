/**
 * `handles.claimed_at` recebe `Date`, e **nunca o `Instant` cru**.
 *
 * ## O DEFEITO, MEDIDO E NAO SUPOSTO
 *
 * Relato do cliente em 18/10/2026, contra homologacao: *"ao salvar o perfil
 * tambem [da erro]"*. Medido contra a pilha efemera de integracao, no commit
 * `f8c74714` -- o MESMO que `https://hml.bichu.app/v1/health` reportava:
 *
 *     PATCH /v1/me  {"handle":"medicao-134549"}
 *     500 {"type":".../problems/internal","title":"Nao foi possivel concluir agora"}
 *
 * E no log da API, a causa:
 *
 *     DatabaseError 22008: date/time field value out of range: "1792376135079"
 *       at Object.atualizarPerfil (kysely-identity-repository.js)
 *       hint: Perhaps you need a different "datestyle" setting.
 *
 * `1792376135079` e o `Instant` -- milissegundos desde a epoca. O `INSERT INTO
 * handles` passava `claimed_at: agora`, e `agora` e um `Instant`, que e um
 * `number`. `timestamptz` nao le numero. **Toda escolha e toda troca de apelido
 * pela pagina de edicao do perfil devolvia 500**, e o apelido e justamente o
 * campo que o cliente pediu nessa pagina no mesmo dia.
 *
 * ## POR QUE O COMPILADOR NAO PEGOU, E POR QUE AGORA PEGA
 *
 * `HandlesTable.claimed_at` era
 * `ColumnType<Date, number | Date | string | undefined, ...>`: a escrita
 * aceitava `number`. Aceitava para nada -- ninguem grava epoch nesta coluna de
 * proposito --, e o unico efeito era deixar este erro compilar. O tipo passou a
 * aceitar so `Date`.
 *
 * `criarContaLocal` ja fazia certo, com `const agora = new Date(nova.agora)`, e
 * essa divergencia entre dois caminhos da MESMA coluna e por que o defeito
 * aparecia so na edicao e nao no cadastro.
 *
 * ## POR QUE O CASO LE O PARAMETRO LIGADO, E NAO O COMPORTAMENTO
 *
 * Porque o comportamento quebrado so aparece com Postgres de verdade, e a suite
 * de integracao deste repositorio **nao compila hoje** (o `tsc` do servico
 * `testes` estoura o `mem_limit: 1g` com `JavaScript heap out of memory`, em
 * `origin/development`, antes de qualquer caso rodar). Entao a conferencia cai
 * onde ela e observavel sem banco: no valor que o driver receberia.
 *
 * `instanceof Date` e o predicado certo e `typeof !== 'number'` nao e: uma
 * string ISO tambem passaria pelo segundo e tambem nao e o que a coluna espera
 * depois do estreitamento do tipo.
 *
 * ## ISCA CONFERIDA
 *
 * Trocando `claimed_at: new Date(Number(agora))` de volta por
 * `claimed_at: agora` em `atualizarPerfil`, os dois casos abaixo reprovam pelo
 * nome. Conferido em 18/10/2026. (Com o tipo estreitado a reversao tambem para
 * o `tsc`, e e isso que se quer: o caso existe para o dia em que alguem alargar
 * o tipo de novo.)
 */
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

/**
 * Kysely com o compilador REAL do Postgres e um driver que captura.
 *
 * `DummyDriver` nao serve aqui: ele devolve `rows: []`, e `atualizarPerfil`
 * desiste no primeiro `SELECT` (conta nao encontrada) sem chegar ao `INSERT`
 * que esta sendo medido -- o caso passaria sem ter exercitado nada.
 *
 * O `responder` devolve linha para os `SELECT` e vazio para o resto, que e o
 * minimo para o caminho "conta existe, ainda nao tem apelido" rodar inteiro.
 */
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

/** A linha que os `SELECT` deste caminho devolvem. `handle: null` = sem apelido. */
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
