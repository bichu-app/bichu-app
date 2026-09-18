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
} from 'kysely';
import type { Database } from '../db/schema.js';
import type { Db } from '../db/pool.js';
import { carregarContrato } from './contract.js';
import { AppError } from './errors.js';
import {
  canonicalizarCorpo,
  executarComIdempotencia,
  exigenciaDeIdempotencia,
  montarReservaDeIdempotencia,
  operacoesComIdempotencia,
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
