/**
 * Idempotência: o que se prova aqui é o EFEITO, não a chamada.
 *
 * Um teste que só invoca `executarComIdempotencia` e confere que ela responde
 * passaria com a rota desligada e com o efeito repetido. Por isso todo caso
 * abaixo conta execuções do handler: `execucoes` é o número de vezes que o
 * efeito de verdade aconteceu, e é sobre ele que a asserção cai.
 *
 * O armazenamento é uma memória local com as mesmas três regras do adaptador de
 * banco. O que está sob teste é o caminho da requisição, que é justamente o que
 * faltava entre a tabela `idempotency_keys` e as rotas.
 */
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
/**
 * Reservada é **ausência de status**, e não um status inventado.
 *
 * Aqui estava um `0`, espelhando o que o adaptador gravava. `0` não é status
 * HTTP, a coluna do banco tem `CHECK (response_status BETWEEN 100 AND 599)`, e a
 * primeira rota idempotente de verdade terminou em 500 na reserva. O dobre
 * aceitava porque dobre não tem restrição — e é essa a lição: quando o dobre é
 * mais permissivo que a tabela, ele deixa de ser um dobre e passa a ser um
 * lugar onde o defeito se esconde.
 *
 * `guardarStatus` abaixo é a restrição do banco trazida para cá. Ela não tem
 * teste próprio: ela existe para reprovar o dia em que alguém reintroduzir um
 * valor de fora do domínio da coluna.
 */
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
    // `/v1/pets` nao tem parametro de caminho. A rota COM parametro tem casos
    // proprios em `id-do-caminho-entra-na-chave.test.ts`.
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
    // Se um dia isto falhar, a resposta NÃO é afrouxar o caso: ou a
    // especificação perdeu a declaração por engano, ou a idempotência saiu do
    // produto e este módulo inteiro é para apagar. Os dois exigem decisão de
    // gente, e é para forçar essa decisão que o caso existe.
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

/**
 * O SQL da reserva, conferido sem banco.
 *
 * Este bloco existe por um defeito real: a reserva era escrita com `.where()`
 * ANTES de `.doUpdateSet()`, o que gera `on conflict ("key") where ... do
 * update` — predicado de índice, e não condição do `UPDATE`. O Postgres aceita,
 * a linha viva é sobrescrita, e **toda segunda tentativa executa o efeito de
 * novo**. Com uma rota idempotente ligada, isso é o tutor recebendo dois avisos
 * do mesmo achador.
 *
 * Nenhum teste de comportamento pegava: o dobre acima não gera SQL. Por isso a
 * asserção é sobre o texto compilado, e ela tem as duas metades — a forma certa
 * precisa estar lá, e a errada precisa não estar.
 */
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
    // Esta é a forma que o Postgres aceita e que não restringe nada. Se ela
    // voltar, este teste é o único lugar do projeto que acusa sem subir banco.
    assert.doesNotMatch(sqlDaReserva(), /on conflict \("key"\) where/);
  });

  void it('a reserva grava ausência de status, e não um status fora de 100..599', () => {
    // `response_status` entra por parâmetro, então o valor não aparece no texto.
    // O que se confere é que a coluna está na inserção e que o valor ligado é
    // nulo — que é o que a restrição do banco exige.
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

// ---------------------------------------------------------------------------
// O ADAPTADOR DE BANCO, SEM BANCO
// ---------------------------------------------------------------------------
/**
 * `criarIdempotencia` era o buraco desta suíte: o caminho da requisição estava
 * coberto contra a memória acima, e o adaptador de verdade — o que decide se a
 * resposta de um usuário vai parar na tela de outro — não tinha nenhum caso.
 *
 * O dobre daqui não é "um banco falso": é um `Db` de verdade do Kysely, com o
 * mesmo compilador de SQL do Postgres, ligado a um driver que **captura a
 * consulta compilada** e devolve as linhas que o caso escolheu. O que isso
 * prova, e que um dobre do adaptador nunca provaria:
 *
 * - o SQL que sai é o SQL que o Postgres receberia (as asserções sobre
 *   `liberar` e `concluir` caem sobre o texto compilado, não sobre a intenção);
 * - os ramos de decisão de `reservar` rodam de verdade, sobre linhas montadas
 *   para cada conflito possível.
 *
 * O que ele NÃO prova está dito no fim do arquivo, e não foi disfarçado aqui.
 */
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
      // Se um dia a idempotência passar a usar stream, este dobre precisa saber
      // disso em vez de devolver vazio e fazer o caso passar por engano.
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
    // Relógio parado: a validade gravada é conferida por igualdade exata, e um
    // `Date.now()` aqui faria o caso passar hoje e falhar sem explicação amanhã.
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
    // Duas coisas num caso só, e a segunda é a que importa: quando a reserva é
    // ganha não há nada para conferir, e uma leitura a mais aqui é uma ida ao
    // banco em TODA requisição idempotente do produto. Se um dia o `return`
    // adiantado sair, este caso cai pela contagem de consultas.
    const { db, consultas } = bancoQueCaptura(() => [{ key: CHAVE }]);

    const resultado = await criarIdempotencia(db).reservar(entradaDeReserva());

    assert.equal(resultado, undefined, 'quem ganhou a reserva precisa executar o efeito');
    assert.equal(consultas.length, 1, 'a reserva ganha não pode disparar leitura de conferência');
  });

  void it('reserva perdida com a linha de OUTRO DONO é RECUSADA, e o corpo gravado não vaza', async () => {
    // Este é o caso mais caro do arquivo. A chave é um UUID que viaja num
    // cabeçalho; alguém que reenvie a chave de outra pessoa não pode receber a
    // resposta dela. Com a comparação de dono invertida ou ausente, o corpo
    // gravado — que no aviso de achador traz o `finder_token` e o contato
    // mediado — sairia para quem adivinhou o UUID. O caso confere as duas
    // metades: recusa, e a recusa NÃO carrega o corpo alheio.
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
    // Mesmo dono, mesmo corpo, rota diferente. Sem a comparação de `endpoint`, o
    // app que reaproveitasse a chave entre duas telas receberia a resposta da
    // tela errada — um `pet` onde esperava um `found_report`, e o parse quebra
    // longe daqui, sem nada apontando para a idempotência.
    const { db } = bancoComReservaPerdida(linhaCompativel({ endpoint: 'POST /v1/pets' }));

    await assert.rejects(
      () => criarIdempotencia(db).reservar(entradaDeReserva()),
      (erro: unknown) => erro instanceof AppError && erro.status === 400,
    );
  });

  void it('reserva perdida com CORPO diferente é recusada', async () => {
    // A fila offline reenvia o mesmo pedido; se o corpo mudou, não é o mesmo
    // pedido. Sem a conferência do hash, o tutor que corrigiu o recado antes do
    // reenvio receberia de volta a resposta do recado antigo e acharia que a
    // correção foi gravada.
    const { db } = bancoComReservaPerdida(
      linhaCompativel({ request_hash: hashDeCorpo('{"note":"outra coisa"}') }),
    );

    await assert.rejects(
      () => criarIdempotencia(db).reservar(entradaDeReserva()),
      (erro: unknown) => erro instanceof AppError && erro.status === 400,
    );
  });

  void it('reserva perdida com a primeira tentativa EM CURSO responde 429, e não um status nulo', async () => {
    // `response_status = NULL` quer dizer "alguém está executando agora". Sem
    // este ramo, o `return` do fim devolveria `{ status: null }` e a borda
    // responderia um status que não existe. Recusar com 429 é o que faz a
    // segunda aba (ou o segundo toque no botão) esperar em vez de duplicar o
    // aviso ao tutor.
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
    // O expurgo de chaves vencidas pode apagar a linha entre a tentativa de
    // inserção e a leitura. Devolver `undefined` aqui seria dizer "é a primeira
    // vez": o efeito rodaria de novo, que é exatamente o que a chave existe para
    // impedir. Errar para o lado de falhar deixa o cliente repetir.
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
    // A janela é o que separa "chave repetida" de "chave livre", e a conta é
    // feita DENTRO de `reservar` — por isso o caso vai pelo adaptador e lê o
    // parâmetro capturado, em vez de montar a data por fora (que provaria
    // apenas que o teste sabe multiplicar). Se a conta saísse em minutos, toda
    // chave nasceria praticamente vencida, a próxima tentativa reaproveitaria a
    // linha e o efeito rodaria de novo: idempotência desligada, sem sintoma. Se
    // saísse em dias, uma chave reaproveitada semanas depois recusaria um
    // pedido legítimo.
    //
    // O relógio é parado (`INSTANTE_FIXO`): a igualdade é exata, e um
    // `Date.now()` aqui faria o caso depender do milissegundo da execução.
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
    // O caso que mais dói se cair. `liberar` roda no `catch` de quem executou o
    // efeito. Se a execução falhar DEPOIS do efeito ter acontecido (uma falha na
    // serialização da resposta, por exemplo), apagar a linha concluída faz o
    // reenvio da fila offline executar o efeito de novo — e o tutor recebe dois
    // avisos do mesmo achador, que é o defeito que este módulo inteiro existe
    // para impedir. Sem banco, a única prova é o texto compilado.
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
    // Uma resposta 204 conclui a chave sem corpo. `undefined` num parâmetro
    // ligado não é um valor que o driver saiba mandar: `concluir` lançaria
    // DEPOIS do efeito já ter acontecido, a linha ficaria eternamente reservada,
    // e as 24 h seguintes de reenvio do mesmo cliente levariam 429.
    const { db, consultas } = bancoQueCaptura(() => []);

    await criarIdempotencia(db).concluir(CHAVE, 204, undefined);

    const consulta = consultas[0];
    assert.ok(consulta !== undefined);
    assert.equal(consulta.parameters.includes(undefined), false);
    assert.equal(consulta.parameters.includes(null), true);
  });
});

// ---------------------------------------------------------------------------
// A LEITURA DO CONTRATO, SOBRE DOCUMENTOS MONTADOS AQUI
// ---------------------------------------------------------------------------
/**
 * Os casos acima, sobre `api/openapi.yaml`, provam que a especificação de hoje é
 * lida certo. Não provam o que acontece com a especificação de amanhã, e é ela
 * que este bloco cobre: cada contrato abaixo tem uma forma só, escrita para que
 * a regra que está sendo conferida seja o único motivo do resultado.
 */
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
    // A especificação do Bichu declara o cabeçalho UMA vez, em
    // `components/parameters`, e cada operação o cita por `$ref`. Sem a
    // resolução, TODA operação idempotente do produto seria lida como
    // "ausente": ou o portão de subida reprova cada rota marcada, ou — se
    // ninguém as tivesse marcado — o produto sobe com a idempotência
    // silenciosamente desligada nas rotas que a prometem no contrato.
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
    // Referência quebrada é defeito da especificação. O módulo não adivinha: lê
    // como ausente, e quem acusa é o portão de subida — conferido logo abaixo.
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
    // `in: query` com o nome certo é erro de escrita da especificação. Aceitá-lo
    // seria endossar a chave viajando na URL — que entra no log do servidor, no
    // histórico do navegador e no `Referer` mandado para terceiros. A chave
    // identifica o pedido de um usuário; ela pertence ao cabeçalho.
    const contrato = contratoDeMentira([
      operacaoDeMentira('avisarAchado', 'post', '/tags/{code}/found-reports', [
        { name: 'Idempotency-Key', in: 'query', required: true },
      ]),
    ]);

    assert.equal(exigenciaDeIdempotencia(contrato, 'avisarAchado'), 'ausente');
  });

  void it('a caixa do nome do cabeçalho não importa', () => {
    // Nome de cabeçalho é insensível a caixa por RFC. Uma comparação sensível
    // faria uma especificação escrita `IDEMPOTENCY-KEY` sumir do portão: o
    // contrato prometeria idempotência e a conferência de subida não veria nada
    // para conferir.
    const contrato = contratoDeMentira([
      operacaoDeMentira('avisarAchado', 'post', '/tags/{code}/found-reports', [
        { name: 'IDEMPOTENCY-KEY', in: 'header', required: true },
      ]),
    ]);

    assert.equal(exigenciaDeIdempotencia(contrato, 'avisarAchado'), 'obrigatoria');
  });

  void it('`required` ausente é `opcional`, e `required: true` é `obrigatoria`', () => {
    // A diferença decide se uma requisição SEM chave é recusada ou executada. Se
    // a leitura se invertesse, o aviso de achador — a rota reenviada por fila
    // offline — passaria a aceitar pedido sem chave, e cada retentativa da fila
    // viraria um aviso novo para o tutor.
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
    // `parameters: [Idempotency-Key]` é o erro de escrita mais natural do
    // mundo: no mesmo arquivo, `tags` e `x-effects` são listas de texto. Aqui a
    // entrada é ignorada e a operação sai `ausente` — e se a rota estiver
    // marcada, quem acusa é o portão de subida (caso logo abaixo). O que não
    // pode acontecer é um `TypeError` durante a carga da especificação.
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

// ---------------------------------------------------------------------------
// O PORTAO DE SUBIDA
// ---------------------------------------------------------------------------

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
    // A divergência que só apareceria no segundo envio de um cliente offline: o
    // contrato promete que repetir a chave não repete o efeito, e o handler
    // executa de novo. Sem este portão, o defeito nasce na fiação (esquecer
    // `config: { idempotencia: true }`) e só é notado quando um tutor reclama de
    // receber o mesmo aviso três vezes.
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
    // O outro sentido, e ele não é simetria decorativa: uma rota que deduplica
    // sem o contrato prometer devolve, no reenvio, uma resposta gravada que o
    // cliente nunca soube que podia receber — e o app, que não leu nada sobre
    // idempotência naquela operação, trata a resposta repetida como criação
    // nova.
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
    // `caminhoDoContrato` tira o prefixo da API e troca `:code` por `{code}`. Se
    // a conversão quebrasse, nenhuma rota casaria com nenhuma operação, toda
    // `exigencia` sairia `ausente`, e o portão passaria a aprovar por vacuidade
    // — conferindo zero rotas e dizendo que está tudo certo. É a pior falha
    // possível num portão, porque ela se parece com sucesso. A metade que acusa
    // é esta: com a conversão quebrada, a rota marcada acima cairia no ramo
    // "passa pela idempotência sem o contrato declarar".
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
    // `/v1x/pets` começa com `/v1`, e um corte por prefixo de texto puro o
    // transformaria em `x/pets`. O casamento com o contrato passaria a falhar
    // numa família inteira de caminhos, silenciosamente — e "silenciosamente"
    // aqui quer dizer: o portão para de vigiar aquelas rotas e não avisa.
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
    // O Fastify aceita `method: ['POST', 'PUT']` numa rota só. Se o portão
    // olhasse apenas o primeiro, o segundo método escaparia da conferência — e o
    // método que escapa é justamente aquele em que ninguém pensou ao escrever a
    // rota. Aqui o contrato declara o cabeçalho só no PUT, e é o PUT que precisa
    // ser acusado.
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
    // Uma rota registrada fora da especificação (sonda interna, métricas) não
    // declara nem promete idempotência, e reclamar dela aqui seria o portão
    // opinando sobre cobertura de contrato — que é trabalho de outro portão. Se
    // ele passasse a reprovar, a reprovação ruidosa e fora de escopo é o
    // caminho mais curto para alguém desligar a conferência inteira.
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
    // Silêncio não é aprovação. Um portão que não encontra nada para conferir e
    // retorna calado é indistinguível de um portão que conferiu tudo — e é
    // assim que uma conferência morre sem ninguém notar. O aviso precisa
    // continuar dizendo quais operações declaram o cabeçalho e ainda não têm
    // handler.
    const { app, registrar, avisos, informados } = appDeMentira();
    const conferir = vigiarIdempotenciaDasRotas(app, CONTRATO_DO_ACHADO, '/v1');
    registrar({ method: 'GET', url: '/v1/pets' });

    conferir();

    assert.equal(avisos.length, 1, 'a ausência de alvo precisa sair no log');
    assert.match(avisos[0] ?? '', /nenhuma rota idempotente registrada/);
    assert.deepEqual(informados, [], 'não há o que informar como conferido');
  });

  void it('`$ref` de parâmetro quebrado é acusado pelo portão, e não some', () => {
    // Fecha o caso da referência não resolvida lá em cima. A operação passa a
    // ser lida como `ausente`; a rota marcada, então, cai no ramo "passa pela
    // idempotência sem o contrato declarar". O defeito da especificação derruba
    // a subida em vez de desligar a idempotência daquela rota em silêncio.
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
    // As chaves de objeto são ordenadas de propósito; as listas NÃO podem ser.
    // Se a ordenação escorregasse para dentro das listas, dois pedidos
    // genuinamente diferentes (a mesma coleção de fotos em outra ordem, dois
    // contatos trocados de posição) produziriam o mesmo hash — e o segundo
    // receberia a resposta do primeiro como se fosse dele, sem executar nada.
    assert.notEqual(canonicalizarCorpo({ fotos: ['a', 'b'] }), canonicalizarCorpo({ fotos: ['b', 'a'] }));
  });

  void it('campo `undefined` e campo ausente dão a MESMA chave', () => {
    // `JSON.stringify` descarta `undefined`, então o que sai pela rede num caso
    // é idêntico ao do outro. Se a forma canônica os diferenciasse, o reenvio da
    // fila offline — que reconstrói o objeto a partir do que foi serializado —
    // produziria outro hash e levaria 400 de "chave reaproveitada" por um pedido
    // que é literalmente o mesmo.
    assert.equal(
      canonicalizarCorpo({ nome: 'Bichu', raca: undefined }),
      canonicalizarCorpo({ nome: 'Bichu' }),
    );
  });

  void it('`null` e a string `"null"` NÃO colidem', () => {
    // `null` num campo quer dizer "apague isto"; `"null"` é texto que o usuário
    // digitou. Uma canonicalização por `String(valor)` empilharia os dois, e
    // apagar o contato passaria a ser o mesmo pedido que gravar a palavra.
    assert.notEqual(canonicalizarCorpo({ contato: null }), canonicalizarCorpo({ contato: 'null' }));
  });

  void it('tipos diferentes com a mesma aparência não colidem', () => {
    // `1` e `"1"` chegam diferentes do app e precisam continuar diferentes aqui.
    assert.notEqual(canonicalizarCorpo({ idade: 1 }), canonicalizarCorpo({ idade: '1' }));
    assert.notEqual(canonicalizarCorpo({ ativo: true }), canonicalizarCorpo({ ativo: 'true' }));
  });

  void it('corpo ausente (`undefined`) tem forma canônica estável', () => {
    // Rota idempotente com corpo vazio é o caso REAL do produto: o aviso de
    // achador é "um toque, zero campos". Se o corpo ausente não tivesse forma
    // estável, a rota mais crítica seria a que a idempotência não cobriria.
    assert.equal(canonicalizarCorpo(undefined), 'null');
    assert.equal(canonicalizarCorpo(undefined), canonicalizarCorpo(null));
  });
});
