/** Idempotência: o que se prova aqui é o EFEITO, não a chamada. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashDeCorpo, iguaisEmTempoConstante } from '../crypto/digest.js';
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from 'kysely';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/schema.js';
import type { Db } from '../db/pool.js';
import { INSTANTE_FIXO } from '../time/relogio-de-teste.js';
import {
  carregarContrato,
  type Contrato,
  type MetodoHttp,
  type OperacaoDoContrato,
} from './contract.js';
import { AppError } from './errors.js';
import {
  canonicalizarCorpo,
  criarIdempotencia,
  executarComIdempotencia,
  exigenciaDeIdempotencia,
  montarReservaDeIdempotencia,
  operacoesComIdempotencia,
  vigiarIdempotenciaDasRotas,
  type EntradaDeIdempotencia,
  type Idempotencia,
  type RespostaGravada,
} from './idempotency.js';

const CHAVE = '018f3a2b-0000-7000-8000-000000000001';
const OUTRA_CHAVE = '018f3a2b-0000-7000-8000-000000000002';
const DONO = '018f3a2b-0000-7000-8000-00000000000a';
/** Reservada é **ausência de status**, e não um status inventado. */
const RESERVADA = null;

function guardarStatus(status: number | null): number | null {
  if (status !== null && (status < 100 || status > 599)) {
    throw new Error(
      `status ${String(status)} está fora de 100..599, e a coluna do banco o ` +
        'recusaria. Reservada é NULL (migração 20260917000008).',
    );
  }
  return status;
}

interface Linha {
  donoOuToken: string;
  endpoint: string;
  requestHash: Buffer;
  status: number | null;
  corpo: unknown;
  expiraEm: number;
}

/** Memória com as regras do adaptador: reserva antes, conflito por dono/rota/corpo. */
function memoria(): Idempotencia {
  const linhas = new Map<string, Linha>();
  return {
    reservar(entrada: EntradaDeIdempotencia): Promise<RespostaGravada | undefined> {
      const requestHash = hashDeCorpo(entrada.corpoCanonico);
      const existente = linhas.get(entrada.chave);
      if (existente === undefined || existente.expiraEm <= entrada.agoraEmMilissegundos) {
        linhas.set(entrada.chave, {
          donoOuToken: entrada.donoOuToken,
          endpoint: entrada.endpoint,
          requestHash,
          status: guardarStatus(RESERVADA),
          corpo: null,
          expiraEm: entrada.agoraEmMilissegundos + 24 * 3600 * 1000,
        });
        return Promise.resolve(undefined);
      }
      if (
        existente.donoOuToken !== entrada.donoOuToken ||
        existente.endpoint !== entrada.endpoint ||
        !iguaisEmTempoConstante(existente.requestHash, requestHash)
      ) {
        return Promise.reject(new AppError('validation-failed', 'Chave reaproveitada'));
      }
      if (existente.status === RESERVADA) {
        return Promise.reject(new AppError('rate-limited', 'Primeira tentativa em curso'));
      }
      return Promise.resolve({ status: existente.status, body: existente.corpo });
    },
    concluir(chave: string, status: number, corpo: unknown): Promise<void> {
      const linha = linhas.get(chave);
      if (linha !== undefined) {
        linha.status = guardarStatus(status);
        linha.corpo = corpo;
      }
      return Promise.resolve();
    },
    liberar(chave: string): Promise<void> {
      const linha = linhas.get(chave);
      if (linha !== undefined && linha.status === RESERVADA) linhas.delete(chave);
      return Promise.resolve();
    },
  };
}

/** Handler que conta quantas vezes o efeito aconteceu de verdade. */
function efeito(): { executar: () => Promise<RespostaGravada>; execucoes: () => number } {
  let vezes = 0;
  return {
    executar: () => {
      vezes += 1;
      return Promise.resolve({ status: 201, body: { id: `pet-${String(vezes)}` } });
    },
    execucoes: () => vezes,
  };
}

type Pedido = Parameters<typeof executarComIdempotencia>[1];

function pedido(sobrescrita: Partial<Pedido> = {}): Pedido {
  return {
    exigencia: 'opcional',
    chaveDoCabecalho: CHAVE,
    donoOuToken: DONO,
    endpoint: 'POST /v1/pets',
    parametrosDeCaminho: {},
    corpo: { name: 'Bichu', species_code: 'dog' },
    agoraEmMilissegundos: Date.parse('2026-09-17T12:00:00Z'),
    ...sobrescrita,
  };
}

void describe('idempotência no caminho da requisição', () => {
  void it('a MESMA chave repetida não produz segundo efeito', async () => {
    const armazem = memoria();
    const { executar, execucoes } = efeito();

    const primeira = await executarComIdempotencia(armazem, pedido(), executar);
    const segunda = await executarComIdempotencia(armazem, pedido(), executar);

    assert.equal(execucoes(), 1, 'o handler rodou mais de uma vez para a mesma chave');
    assert.deepEqual(segunda, primeira, 'o reenvio precisa devolver a resposta original');
  });

  void it('chave DIFERENTE produz efeito novo', async () => {
    const armazem = memoria();
    const { executar, execucoes } = efeito();

    await executarComIdempotencia(armazem, pedido(), executar);
    await executarComIdempotencia(armazem, pedido({ chaveDoCabecalho: OUTRA_CHAVE }), executar);

    assert.equal(execucoes(), 2);
  });

  void it('a mesma chave com OUTRO CORPO é recusada, e não devolve a resposta gravada', async () => {
    const armazem = memoria();
    const { executar, execucoes } = efeito();
    await executarComIdempotencia(armazem, pedido(), executar);

    await assert.rejects(
      () => executarComIdempotencia(armazem, pedido({ corpo: { name: 'Outro' } }), executar),
      (erro: unknown) => erro instanceof AppError,
    );
    assert.equal(execucoes(), 1);
  });

  void it('a mesma chave de OUTRO DONO é recusada: chave adivinhada não entrega resposta alheia', async () => {
    const armazem = memoria();
    const { executar } = efeito();
    await executarComIdempotencia(armazem, pedido(), executar);

    await assert.rejects(
      () =>
        executarComIdempotencia(
          armazem,
          pedido({ donoOuToken: '018f3a2b-0000-7000-8000-00000000000b' }),
          executar,
        ),
      (erro: unknown) => erro instanceof AppError,
    );
  });

  void it('execução que falha LIBERA a chave, senão o cliente fica 24 h sem poder repetir', async () => {
    const armazem = memoria();
    let vezes = 0;
    const executar = (): Promise<RespostaGravada> => {
      vezes += 1;
      if (vezes === 1) return Promise.reject(new Error('indisponível'));
      return Promise.resolve({ status: 201, body: { id: 'pet-1' } });
    };

    await assert.rejects(() => executarComIdempotencia(armazem, pedido(), executar));
    const depois = await executarComIdempotencia(armazem, pedido(), executar);

    assert.equal(vezes, 2);
    assert.deepEqual(depois, { status: 201, body: { id: 'pet-1' } });
  });

  void it('sem chave: `opcional` executa, `obrigatoria` recusa com 400 antes de qualquer efeito', async () => {
    const armazem = memoria();
    const opcional = efeito();
    const obrigatoria = efeito();

    await executarComIdempotencia(
      armazem,
      pedido({ chaveDoCabecalho: undefined }),
      opcional.executar,
    );
    assert.equal(opcional.execucoes(), 1);

    await assert.rejects(
      () =>
        executarComIdempotencia(
          armazem,
          pedido({ chaveDoCabecalho: undefined, exigencia: 'obrigatoria' }),
          obrigatoria.executar,
        ),
      (erro: unknown) => erro instanceof AppError && erro.status === 400,
    );
    assert.equal(obrigatoria.execucoes(), 0, 'recusou depois de executar o efeito');
  });

  void it('chave que não é UUID é recusada antes do efeito', async () => {
    const armazem = memoria();
    const { executar, execucoes } = efeito();
    await assert.rejects(
      () => executarComIdempotencia(armazem, pedido({ chaveDoCabecalho: 'nao-e-uuid' }), executar),
      (erro: unknown) => erro instanceof AppError && erro.status === 400,
    );
    assert.equal(execucoes(), 0);
  });

  void it('rota cujo contrato não declara `Idempotency-Key` não passa por aqui em silêncio', async () => {
    const armazem = memoria();
    const { executar, execucoes } = efeito();
    await assert.rejects(
      () => executarComIdempotencia(armazem, pedido({ exigencia: 'ausente' }), executar),
      (erro: unknown) => erro instanceof Error && !(erro instanceof AppError),
    );
    assert.equal(execucoes(), 0);
  });

  void it('a ordem dos campos do corpo não muda a chave: fila offline reenvia serializada de novo', () => {
    assert.equal(
      canonicalizarCorpo({ b: 1, a: { d: 2, c: 3 } }),
      canonicalizarCorpo({ a: { c: 3, d: 2 }, b: 1 }),
    );
  });
});

void describe('quem é idempotente sai do contrato, não do julgamento de quem codifica', () => {
  const contrato = carregarContrato('api/openapi.yaml');

  void it('o contrato ainda declara `Idempotency-Key` em alguma operação', () => {
    const declaradas = operacoesComIdempotencia(contrato);
    assert.ok(
      declaradas.size > 0,
      'nenhuma operação declara `Idempotency-Key`: este módulo ficou sem para que servir',
    );
    for (const exigencia of declaradas.values()) {
      assert.ok(exigencia === 'opcional' || exigencia === 'obrigatoria');
    }
  });

  void it('operação que não declara o cabeçalho é lida como `ausente`', () => {
    assert.equal(exigenciaDeIdempotencia(contrato, 'login'), 'ausente');
  });

  void it('`operationId` fora do contrato falha, em vez de responder "não declara"', () => {
    assert.throws(() => exigenciaDeIdempotencia(contrato, 'operacaoQueNaoExiste'));
  });
});

/** O SQL da reserva, conferido sem banco. */
void describe('SQL da reserva', () => {
  function bancoDeMentira(): Db {
    return new Kysely<Database>({
      dialect: {
        createAdapter: () => new PostgresAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (db) => new PostgresIntrospector(db),
        createQueryCompiler: () => new PostgresQueryCompiler(),
      },
    });
  }

  function sqlDaReserva(): string {
    return montarReservaDeIdempotencia(
      bancoDeMentira(),
      {
        chave: CHAVE,
        donoOuToken: DONO,
        endpoint: 'POST /v1/tags/:code/found-reports',
        corpoCanonico: '{}',
        agoraEmMilissegundos: 0,
      },
      hashDeCorpo('{}'),
      new Date(0),
    ).compile().sql;
  }

  void it('a validade restringe o UPDATE, e não o alvo do conflito', () => {
    assert.match(sqlDaReserva(), /do update set .* where idempotency_keys\.expires_at <= now\(\)/);
  });

  void it('NÃO gera o predicado de índice, que desligaria a idempotência em silêncio', () => {
    assert.doesNotMatch(sqlDaReserva(), /on conflict \("key"\) where/);
  });

  void it('a reserva grava ausência de status, e não um status fora de 100..599', () => {
    const consulta = montarReservaDeIdempotencia(
      bancoDeMentira(),
      {
        chave: CHAVE,
        donoOuToken: DONO,
        endpoint: 'POST /v1/tags/:code/found-reports',
        corpoCanonico: '{}',
        agoraEmMilissegundos: 0,
      },
      hashDeCorpo('{}'),
      new Date(0),
    ).compile();
    assert.match(consulta.sql, /"response_status"/);
    assert.equal(consulta.parameters.includes(0), false);
    assert.equal(consulta.parameters.includes(null), true);
  });
});

interface ConsultaCapturada {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

/** Decide as linhas devolvidas a partir da consulta e da ordem em que ela veio. */
type RespostaDoBanco = (consulta: ConsultaCapturada, ordem: number) => readonly unknown[];

function bancoQueCaptura(responder: RespostaDoBanco): {
  db: Db;
  consultas: ConsultaCapturada[];
} {
  const consultas: ConsultaCapturada[] = [];

  const conexao: DatabaseConnection = {
    executeQuery: <R>(compilada: CompiledQuery): Promise<QueryResult<R>> => {
      const consulta: ConsultaCapturada = {
        sql: compilada.sql,
        parameters: compilada.parameters,
      };
      consultas.push(consulta);
      return Promise.resolve({ rows: responder(consulta, consultas.length - 1) as R[] });
    },
    streamQuery: () => {
      throw new Error('a idempotência não usa `streamQuery`');
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

/** Linha de `idempotency_keys` como o `select` de conferência a devolveria. */
interface LinhaGravada {
  user_or_token_ref: string;
  endpoint: string;
  request_hash: Buffer;
  response_status: number | null;
  response_body: unknown;
}

const ENDPOINT = 'POST /v1/tags/{code}/found-reports';
const CORPO_CANONICO = '{"note":"vi no portao"}';

function entradaDeReserva(
  sobrescrita: Partial<EntradaDeIdempotencia> = {},
): EntradaDeIdempotencia {
  return {
    chave: CHAVE,
    donoOuToken: DONO,
    endpoint: ENDPOINT,
    corpoCanonico: CORPO_CANONICO,
    agoraEmMilissegundos: INSTANTE_FIXO,
    ...sobrescrita,
  };
}

function linhaCompativel(sobrescrita: Partial<LinhaGravada> = {}): LinhaGravada {
  return {
    user_or_token_ref: DONO,
    endpoint: ENDPOINT,
    request_hash: hashDeCorpo(CORPO_CANONICO),
    response_status: 201,
    response_body: { id: 'found-report-1' },
    ...sobrescrita,
  };
}

/** Reserva perdida (o `insert` não devolve linha) e o `select` traz `linha`. */
function bancoComReservaPerdida(linha: LinhaGravada | undefined): {
  db: Db;
  consultas: ConsultaCapturada[];
} {
  return bancoQueCaptura((_consulta, ordem) =>
    ordem === 0 ? [] : linha === undefined ? [] : [linha],
  );
}

void describe('adaptador de banco: quem ganha a reserva, e o que acontece com quem perde', () => {
  void it('reserva GANHA devolve `undefined` e nem chega a ler a linha', async () => {
    const { db, consultas } = bancoQueCaptura(() => [{ key: CHAVE }]);

    const resultado = await criarIdempotencia(db).reservar(entradaDeReserva());

    assert.equal(resultado, undefined, 'quem ganhou a reserva precisa executar o efeito');
    assert.equal(consultas.length, 1, 'a reserva ganha não pode disparar leitura de conferência');
  });

  void it('reserva perdida com a linha de OUTRO DONO é RECUSADA, e o corpo gravado não vaza', async () => {
    const corpoAlheio = { id: 'found-report-1', finder_token: 'segredo-de-outro' };
    const { db } = bancoComReservaPerdida(
      linhaCompativel({
        user_or_token_ref: '018f3a2b-0000-7000-8000-0000000000ff',
        response_body: corpoAlheio,
      }),
    );

    await assert.rejects(
      () => criarIdempotencia(db).reservar(entradaDeReserva()),
      (erro: unknown) => {
        assert.ok(erro instanceof AppError);
        assert.equal(erro.problemType, 'validation-failed');
        assert.equal(erro.status, 400);
        assert.equal(JSON.stringify(erro).includes('segredo-de-outro'), false);
        return true;
      },
    );
  });

  void it('reserva perdida com a linha de OUTRA ROTA é recusada', async () => {
    const { db } = bancoComReservaPerdida(linhaCompativel({ endpoint: 'POST /v1/pets' }));

    await assert.rejects(
      () => criarIdempotencia(db).reservar(entradaDeReserva()),
      (erro: unknown) => erro instanceof AppError && erro.status === 400,
    );
  });

  void it('reserva perdida com CORPO diferente é recusada', async () => {
    const { db } = bancoComReservaPerdida(
      linhaCompativel({ request_hash: hashDeCorpo('{"note":"outra coisa"}') }),
    );

    await assert.rejects(
      () => criarIdempotencia(db).reservar(entradaDeReserva()),
      (erro: unknown) => erro instanceof AppError && erro.status === 400,
    );
  });

  void it('reserva perdida com a primeira tentativa EM CURSO responde 429, e não um status nulo', async () => {
    const { db } = bancoComReservaPerdida(
      linhaCompativel({ response_status: null, response_body: null }),
    );

    await assert.rejects(
      () => criarIdempotencia(db).reservar(entradaDeReserva()),
      (erro: unknown) =>
        erro instanceof AppError && erro.problemType === 'rate-limited' && erro.status === 429,
    );
  });

  void it('reserva perdida e linha SUMIDA falha com 500, em vez de fingir que a reserva foi ganha', async () => {
    const { db } = bancoComReservaPerdida(undefined);

    await assert.rejects(
      () => criarIdempotencia(db).reservar(entradaDeReserva()),
      (erro: unknown) =>
        erro instanceof AppError && erro.problemType === 'internal' && erro.status === 500,
    );
  });

  void it('reserva perdida com linha CONCLUÍDA e compatível devolve a resposta original', async () => {
    const { db } = bancoComReservaPerdida(linhaCompativel());

    const resultado = await criarIdempotencia(db).reservar(entradaDeReserva());

    assert.deepEqual(resultado, { status: 201, body: { id: 'found-report-1' } });
  });

  void it('a validade gravada é agora + 24 h, medida sobre o parâmetro que sai para o banco', async () => {
    const { db, consultas } = bancoQueCaptura(() => [{ key: CHAVE }]);

    await criarIdempotencia(db).reservar(entradaDeReserva());

    const consulta = consultas[0];
    assert.ok(consulta !== undefined);
    const datas = consulta.parameters.filter((valor): valor is Date => valor instanceof Date);
    assert.equal(datas.length, 2, 'a inserção e o `do update set` gravam a mesma validade');
    for (const data of datas) {
      assert.equal(data.getTime(), INSTANTE_FIXO + 24 * 3600 * 1000);
    }
  });

  void it('`liberar` NÃO apaga chave já concluída: o SQL carrega `response_status is null`', async () => {
    const { db, consultas } = bancoQueCaptura(() => []);

    await criarIdempotencia(db).liberar(CHAVE);

    assert.equal(consultas.length, 1);
    const consulta = consultas[0];
    assert.ok(consulta !== undefined);
    assert.match(consulta.sql, /^delete from "idempotency_keys" where/);
    assert.match(consulta.sql, /"response_status" is null/);
    assert.equal(consulta.parameters.includes(CHAVE), true, 'a exclusão precisa ser por chave');
  });

  void it('`concluir` restringe pela chave: sem o `where`, uma resposta sobrescreveria a tabela inteira', async () => {
    const { db, consultas } = bancoQueCaptura(() => []);

    await criarIdempotencia(db).concluir(CHAVE, 201, { id: 'found-report-1' });

    const consulta = consultas[0];
    assert.ok(consulta !== undefined);
    assert.match(consulta.sql, /^update "idempotency_keys" set/);
    assert.match(consulta.sql, /where "key" = \$\d+$/);
    assert.equal(consulta.parameters.includes(CHAVE), true);
  });

  void it('`concluir` sem corpo grava NULL, e não `undefined`', async () => {
    const { db, consultas } = bancoQueCaptura(() => []);

    await criarIdempotencia(db).concluir(CHAVE, 204, undefined);

    const consulta = consultas[0];
    assert.ok(consulta !== undefined);
    assert.equal(consulta.parameters.includes(undefined), false);
    assert.equal(consulta.parameters.includes(null), true);
  });
});

function operacaoDeMentira(
  operationId: string,
  method: MetodoHttp,
  path: string,
  parameters?: unknown,
): OperacaoDoContrato {
  return {
    operationId,
    method,
    path,
    security: [],
    securitySchemes: [],
    effects: [],
    hasRateLimit: false,
    raw: parameters === undefined ? {} : { parameters },
    parameters: Array.isArray(parameters) ? (parameters as Record<string, unknown>[]) : [],
  };
}

function contratoDeMentira(
  operacoes: readonly OperacaoDoContrato[],
  spec: Record<string, unknown> = {},
): Contrato {
  return {
    spec,
    operacoes: new Map<string, OperacaoDoContrato>(
      operacoes.map((operacao) => [operacao.operationId, operacao]),
    ),
    requestBodySchema: () => undefined,
    parameterSchemas: () => ({ params: undefined, querystring: undefined, tiposDeProblema: new Map() }),
    responseSchema: () => undefined,
  };
}

const PARAMETRO_OBRIGATORIO = {
  name: 'Idempotency-Key',
  in: 'header',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};

void describe('como a exigência é lida do contrato', () => {
  void it('parâmetro declarado por `$ref` é resolvido, e não lido como ausente', () => {
    const contrato = contratoDeMentira(
      [
        operacaoDeMentira('avisarAchado', 'post', '/tags/{code}/found-reports', [
          { $ref: '#/components/parameters/IdempotencyKeyRequired' },
        ]),
      ],
      { components: { parameters: { IdempotencyKeyRequired: PARAMETRO_OBRIGATORIO } } },
    );

    assert.equal(exigenciaDeIdempotencia(contrato, 'avisarAchado'), 'obrigatoria');
  });

  void it('`$ref` de parâmetro que não resolve não vira idempotência inventada', () => {
    const contrato = contratoDeMentira(
      [
        operacaoDeMentira('avisarAchado', 'post', '/tags/{code}/found-reports', [
          { $ref: '#/components/parameters/NomeErrado' },
        ]),
      ],
      { components: { parameters: {} } },
    );

    assert.equal(exigenciaDeIdempotencia(contrato, 'avisarAchado'), 'ausente');
  });

  void it('o cabeçalho em QUERY não conta: chave de idempotência não vai na URL', () => {
    const contrato = contratoDeMentira([
      operacaoDeMentira('avisarAchado', 'post', '/tags/{code}/found-reports', [
        { name: 'Idempotency-Key', in: 'query', required: true },
      ]),
    ]);

    assert.equal(exigenciaDeIdempotencia(contrato, 'avisarAchado'), 'ausente');
  });

  void it('a caixa do nome do cabeçalho não importa', () => {
    const contrato = contratoDeMentira([
      operacaoDeMentira('avisarAchado', 'post', '/tags/{code}/found-reports', [
        { name: 'IDEMPOTENCY-KEY', in: 'header', required: true },
      ]),
    ]);

    assert.equal(exigenciaDeIdempotencia(contrato, 'avisarAchado'), 'obrigatoria');
  });

  void it('`required` ausente é `opcional`, e `required: true` é `obrigatoria`', () => {
    const contrato = contratoDeMentira([
      operacaoDeMentira('criarPet', 'post', '/pets', [
        { name: 'Idempotency-Key', in: 'header' },
      ]),
      operacaoDeMentira('avisarAchado', 'post', '/tags/{code}/found-reports', [
        PARAMETRO_OBRIGATORIO,
      ]),
    ]);

    assert.equal(exigenciaDeIdempotencia(contrato, 'criarPet'), 'opcional');
    assert.equal(exigenciaDeIdempotencia(contrato, 'avisarAchado'), 'obrigatoria');
  });

  void it('operação sem `parameters`, ou com `parameters` que não é lista, é `ausente`', () => {
    const contrato = contratoDeMentira([
      operacaoDeMentira('listarPets', 'get', '/pets'),
      operacaoDeMentira('verPet', 'get', '/pets/{petId}', { nao: 'e-lista' }),
    ]);

    assert.equal(exigenciaDeIdempotencia(contrato, 'listarPets'), 'ausente');
    assert.equal(exigenciaDeIdempotencia(contrato, 'verPet'), 'ausente');
  });

  void it('entrada de `parameters` que não é mapa é pulada, e não derruba a leitura', () => {
    const contrato = contratoDeMentira([
      operacaoDeMentira('avisarAchado', 'post', '/tags/{code}/found-reports', [
        'Idempotency-Key',
        42,
        PARAMETRO_OBRIGATORIO,
      ]),
    ]);

    assert.equal(exigenciaDeIdempotencia(contrato, 'avisarAchado'), 'obrigatoria');
  });

  void it('`operacoesComIdempotencia` traz só as declaradas, com a exigência de cada uma', () => {
    const contrato = contratoDeMentira([
      operacaoDeMentira('listarPets', 'get', '/pets'),
      operacaoDeMentira('criarPet', 'post', '/pets', [{ name: 'Idempotency-Key', in: 'header' }]),
      operacaoDeMentira('avisarAchado', 'post', '/tags/{code}/found-reports', [
        PARAMETRO_OBRIGATORIO,
      ]),
    ]);

    assert.deepEqual(
      [...operacoesComIdempotencia(contrato).entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
      [
        ['avisarAchado', 'obrigatoria'],
        ['criarPet', 'opcional'],
      ],
    );
  });
});

interface RotaRegistrada {
  readonly method: string | string[];
  readonly url: string;
  readonly config?: Record<string, unknown>;
}

interface AppDeMentira {
  readonly app: FastifyInstance;
  readonly registrar: (rota: RotaRegistrada) => void;
  readonly avisos: string[];
  readonly informados: Record<string, unknown>[];
}

function appDeMentira(): AppDeMentira {
  const ganchos: ((rota: RotaRegistrada) => void)[] = [];
  const avisos: string[] = [];
  const informados: Record<string, unknown>[] = [];

  const app = {
    addHook: (nome: string, callback: (rota: RotaRegistrada) => void) => {
      if (nome === 'onRoute') ganchos.push(callback);
    },
    log: {
      warn: (_dados: unknown, mensagem: string) => avisos.push(mensagem),
      info: (dados: Record<string, unknown>) => informados.push(dados),
    },
  } as unknown as FastifyInstance;

  return {
    app,
    registrar: (rota) => {
      for (const gancho of ganchos) gancho(rota);
    },
    avisos,
    informados,
  };
}

const CONTRATO_DO_ACHADO = contratoDeMentira([
  operacaoDeMentira('avisarAchado', 'post', '/tags/{code}/found-reports', [PARAMETRO_OBRIGATORIO]),
  operacaoDeMentira('listarPets', 'get', '/pets'),
]);

void describe('o portão de subida: rota idempotente e contrato dizem a mesma coisa', () => {
  void it('operação que DECLARA `Idempotency-Key` e rota que não passa pela idempotência reprova', () => {
    const { app, registrar } = appDeMentira();
    const conferir = vigiarIdempotenciaDasRotas(app, CONTRATO_DO_ACHADO, '/v1');
    registrar({ method: 'POST', url: '/v1/tags/:code/found-reports' });

    assert.throws(conferir, (erro: unknown) => {
      assert.ok(erro instanceof Error);
      assert.match(erro.message, /POST \/tags\/\{code\}\/found-reports/);
      assert.match(erro.message, /não passam pela idempotência: POST/);
      return true;
    });
  });

  void it('rota marcada SEM o contrato declarar também reprova', () => {
    const { app, registrar } = appDeMentira();
    const conferir = vigiarIdempotenciaDasRotas(app, CONTRATO_DO_ACHADO, '/v1');
    registrar({ method: 'GET', url: '/v1/pets', config: { idempotencia: true } });

    assert.throws(conferir, /sem o contrato declarar: GET \/pets/);
  });

  void it('os dois lados batendo passa, e a rota entra na contagem', () => {
    const { app, registrar, informados } = appDeMentira();
    const conferir = vigiarIdempotenciaDasRotas(app, CONTRATO_DO_ACHADO, '/v1');
    registrar({
      method: 'POST',
      url: '/v1/tags/:code/found-reports',
      config: { idempotencia: true },
    });
    registrar({ method: 'GET', url: '/v1/pets' });

    conferir();

    assert.deepEqual(informados, [{ rotasIdempotentes: 1 }]);
  });

  void it('o caso acima é o que prova a conversão de caminho: sem ela NADA casaria', () => {
    const { app, registrar } = appDeMentira();
    const conferir = vigiarIdempotenciaDasRotas(app, CONTRATO_DO_ACHADO, '/v1');
    registrar({
      method: 'POST',
      url: '/v1/tags/:code/found-reports',
      config: { idempotencia: true },
    });

    assert.doesNotThrow(conferir);
  });

  void it('url que só COMEÇA com o texto do prefixo não é cortada pela metade', () => {
    const contrato = contratoDeMentira([
      operacaoDeMentira('coisa', 'post', '/v1x/pets', [PARAMETRO_OBRIGATORIO]),
    ]);
    const { app, registrar } = appDeMentira();
    const conferir = vigiarIdempotenciaDasRotas(app, contrato, '/v1');
    registrar({ method: 'POST', url: '/v1x/pets', config: { idempotencia: true } });

    assert.doesNotThrow(conferir);
  });

  void it('prefixo vazio deixa a url intacta', () => {
    const contrato = contratoDeMentira([
      operacaoDeMentira('avisarAchado', 'post', '/tags/{code}/found-reports', [
        PARAMETRO_OBRIGATORIO,
      ]),
    ]);
    const { app, registrar } = appDeMentira();
    const conferir = vigiarIdempotenciaDasRotas(app, contrato, '');
    registrar({
      method: 'POST',
      url: '/tags/:code/found-reports',
      config: { idempotencia: true },
    });

    assert.doesNotThrow(conferir);
  });

  void it('rota registrada com VÁRIOS métodos é conferida método a método', () => {
    const contrato = contratoDeMentira([
      operacaoDeMentira('criarPet', 'post', '/pets'),
      operacaoDeMentira('substituirPet', 'put', '/pets', [PARAMETRO_OBRIGATORIO]),
    ]);
    const { app, registrar } = appDeMentira();
    const conferir = vigiarIdempotenciaDasRotas(app, contrato, '/v1');
    registrar({ method: ['POST', 'PUT'], url: '/v1/pets' });

    assert.throws(conferir, /não passam pela idempotência: PUT \/pets/);
  });

  void it('rota que o contrato não conhece NÃO é assunto deste portão', () => {
    const { app, registrar } = appDeMentira();
    const conferir = vigiarIdempotenciaDasRotas(app, CONTRATO_DO_ACHADO, '/v1');
    registrar({
      method: 'POST',
      url: '/v1/tags/:code/found-reports',
      config: { idempotencia: true },
    });
    registrar({ method: 'GET', url: '/v1/interno/metricas' });

    assert.doesNotThrow(conferir);
  });

  void it('nenhuma rota idempotente registrada AVISA, em vez de terminar calado', () => {
    const { app, registrar, avisos, informados } = appDeMentira();
    const conferir = vigiarIdempotenciaDasRotas(app, CONTRATO_DO_ACHADO, '/v1');
    registrar({ method: 'GET', url: '/v1/pets' });

    conferir();

    assert.equal(avisos.length, 1, 'a ausência de alvo precisa sair no log');
    assert.match(avisos[0] ?? '', /nenhuma rota idempotente registrada/);
    assert.deepEqual(informados, [], 'não há o que informar como conferido');
  });

  void it('`$ref` de parâmetro quebrado é acusado pelo portão, e não some', () => {
    const contrato = contratoDeMentira(
      [
        operacaoDeMentira('avisarAchado', 'post', '/tags/{code}/found-reports', [
          { $ref: '#/components/parameters/NomeErrado' },
        ]),
      ],
      { components: { parameters: {} } },
    );
    const { app, registrar } = appDeMentira();
    const conferir = vigiarIdempotenciaDasRotas(app, contrato, '/v1');
    registrar({
      method: 'POST',
      url: '/v1/tags/:code/found-reports',
      config: { idempotencia: true },
    });

    assert.throws(conferir, /sem o contrato declarar/);
  });
});

void describe('forma canônica do corpo: o que PODE e o que NÃO PODE colidir', () => {
  void it('a ordem de uma LISTA é preservada — listas diferentes não podem virar a mesma chave', () => {
    assert.notEqual(canonicalizarCorpo({ fotos: ['a', 'b'] }), canonicalizarCorpo({ fotos: ['b', 'a'] }));
  });

  void it('campo `undefined` e campo ausente dão a MESMA chave', () => {
    assert.equal(
      canonicalizarCorpo({ nome: 'Bichu', raca: undefined }),
      canonicalizarCorpo({ nome: 'Bichu' }),
    );
  });

  void it('`null` e a string `"null"` NÃO colidem', () => {
    assert.notEqual(canonicalizarCorpo({ contato: null }), canonicalizarCorpo({ contato: 'null' }));
  });

  void it('tipos diferentes com a mesma aparência não colidem', () => {
    assert.notEqual(canonicalizarCorpo({ idade: 1 }), canonicalizarCorpo({ idade: '1' }));
    assert.notEqual(canonicalizarCorpo({ ativo: true }), canonicalizarCorpo({ ativo: 'true' }));
  });

  void it('corpo ausente (`undefined`) tem forma canônica estável', () => {
    assert.equal(canonicalizarCorpo(undefined), 'null');
    assert.equal(canonicalizarCorpo(undefined), canonicalizarCorpo(null));
  });
});
