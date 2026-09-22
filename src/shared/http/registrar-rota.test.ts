/**
 * BICHUS-178: o teto declarado passa a ser aplicado pelo REGISTRO da rota.
 *
 * Cada bloco abaixo nomeia o critério de aceite que ele fecha. Onde o critério
 * diz "isca", há um segundo caso que **precisa reprovar** com o mecanismo
 * desligado: sem ele, um teste de limite que passa com o limitador desligado não
 * testa limite nenhum — e era exatamente o estado do repositório até 21/09, em
 * que o 429 só existia dentro de teste.
 *
 * As rotas reais (`rotaDeRenovacao`, `rotaDePedidoDeRedefinicao`) são usadas com
 * os NÚMEROS delas, e não com números inventados aqui. Um teste que declarasse o
 * seu próprio teto de 10/min provaria que o mecanismo conta, e não que o teto do
 * produto vale.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';

import { criarServidor } from './server.js';
import { defineRoute } from './route-definition.js';
import { registrarRota, zerarInventario, inventarioDoQueNaoEAplicado } from './registrar-rota.js';
import { criarContadorDesligado, criarContadorEmMemoria } from './rate-limit.js';
import { tetoDeTeste } from './teto-de-teste.js';
import { problemas } from './errors.js';
import type { RateLimitStore } from '../ports/rate-limit-store.js';
import type { AbsoluteUrl } from '../types/brands.js';
import {
  rotaDePedidoDeRedefinicao,
  rotaDeRenovacao,
} from '../../modules/identity/adapters/http/routes.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;

function contadorNovo(): RateLimitStore {
  return criarContadorEmMemoria(() => Date.now());
}

function servidor(contador: RateLimitStore = contadorNovo()) {
  return criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(contador),
    // Silencia o log do Fastify: 21 requisições por caso tornam a saída
    // ilegível, e o que este arquivo mede é status, não linha de log.
    bodyLimitBytes: 1_048_576,
  });
}

/** O slug de `type`, que é por onde o cliente decide (RFC 9457). */
function tipoDe(corpo: string): string | undefined {
  try {
    const { type } = JSON.parse(corpo) as { type?: unknown };
    return typeof type === 'string' ? type.slice(type.lastIndexOf('/') + 1) : undefined;
  } catch {
    return undefined;
  }
}

void describe('critério 1: o registro aplica o teto sem o autor da rota chamar nada', () => {
  const rotaDeExemplo = defineRoute({
    operationId: 'exemploComTeto',
    method: 'post',
    path: '/exemplo',
    effects: ['notifies'],
    rateLimit: [{ dimension: ['ip'], limit: 2, window: '1h', onExceed: 'deny_429' }],
  });

  /** O handler não sabe que existe teto. É esse o ponto. */
  async function statusDasTres(contador: RateLimitStore): Promise<number[]> {
    const app = servidor(contador);
    registrarRota(app, rotaDeExemplo, {}, async (_request, reply) => reply.status(200).send({}));

    const status: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const resposta = await app.inject({
        method: 'POST',
        url: '/exemplo',
        headers: { 'x-forwarded-for': '198.51.100.7' },
      });
      status.push(resposta.statusCode);
    }
    await app.close();
    return status;
  }

  void it('a terceira chamada sobre um teto de 2 recebe 429', async () => {
    assert.deepEqual(await statusDasTres(contadorNovo()), [200, 200, 429]);
  });

  void it('ISCA: com o limitador desligado a terceira passa, e o caso acima reprova', async () => {
    assert.deepEqual(
      await statusDasTres(criarContadorDesligado()),
      [200, 200, 200],
      'com o contador desligado nada é recusado. Este caso existe para registrar, no ' +
        'repositório, o que o caso anterior mede — e para que desligar o teto o derrube.',
    );
  });

  void it('o 429 sai como problem+json com `type: rate-limited` e `Retry-After`', async () => {
    const app = servidor();
    registrarRota(app, rotaDeExemplo, {}, async (_request, reply) => reply.status(200).send({}));

    let ultima = await app.inject({ method: 'POST', url: '/exemplo' });
    for (let i = 0; i < 2; i += 1) {
      ultima = await app.inject({ method: 'POST', url: '/exemplo' });
    }
    await app.close();

    assert.equal(ultima.statusCode, 429);
    assert.equal(tipoDe(ultima.body), 'rate-limited');
    // RFC 9110: 429 sem `Retry-After` deixa o cliente offline martelando.
    assert.ok(Number(ultima.headers['retry-after']) >= 1);
  });
});

void describe('critério 2: registrar sem aplicar não é exprimível', () => {
  void it('servidor sem contador derruba o REGISTRO, nomeando o que falta', () => {
    const cru = Fastify();
    const rota = defineRoute({
      operationId: 'semContador',
      method: 'get',
      path: '/sem-contador',
      effects: [],
    });

    assert.throws(
      () => {
        registrarRota(cru, rota, {}, async (_request, reply) => reply.send({}));
      },
      /contador de teto/,
      'um servidor sem contador precisa derrubar a subida, e não servir rota sem teto',
    );
  });
});

void describe('critério 4: token_family 10/min na renovação', () => {
  async function renovar(contador: RateLimitStore, vezes: number): Promise<number[]> {
    const app = servidor(contador);
    registrarRota(
      app,
      rotaDeRenovacao,
      // Uma família fixa: o que se mede é o teto da dimensão, não a resolução.
      { resolvedores: { token_family: () => 'familia-unica' } },
      async (_request, reply) => reply.status(200).send({}),
    );

    const status: number[] = [];
    for (let i = 0; i < vezes; i += 1) {
      const resposta = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refresh_token: 'opaco' },
      });
      status.push(resposta.statusCode);
    }
    await app.close();
    return status;
  }

  void it('a 11ª renovação da mesma família no minuto recebe 429', async () => {
    const status = await renovar(contadorNovo(), 11);
    assert.deepEqual(status.slice(0, 10), Array.from({ length: 10 }, () => 200));
    assert.equal(status[10], 429);
  });

  void it('ISCA: com o limitador desligado a 11ª passa', async () => {
    const status = await renovar(criarContadorDesligado(), 11);
    assert.equal(status[10], 200);
  });
});

void describe('critério 5: email 3/h na recuperação de senha', () => {
  async function pedirRedefinicao(contador: RateLimitStore, vezes: number): Promise<number[]> {
    const app = servidor(contador);
    registrarRota(
      app,
      rotaDePedidoDeRedefinicao,
      { resolvedores: { email: (_request, sigilo) => sigilo.hmac('email:tutor@exemplo.invalid') } },
      async (_request, reply) => reply.status(202).send(),
    );

    const status: number[] = [];
    for (let i = 0; i < vezes; i += 1) {
      const resposta = await app.inject({
        method: 'POST',
        url: '/auth/password-reset',
        payload: { email: 'tutor@exemplo.invalid' },
      });
      status.push(resposta.statusCode);
    }
    await app.close();
    return status;
  }

  void it('o 4º pedido do mesmo e-mail na hora recebe 429', async () => {
    assert.deepEqual(await pedirRedefinicao(contadorNovo(), 4), [202, 202, 202, 429]);
  });

  void it('ISCA: com o limitador desligado o 4º passa', async () => {
    assert.deepEqual(await pedirRedefinicao(criarContadorDesligado(), 4), [202, 202, 202, 202]);
  });
});

void describe('critério 8: a tentativa válida não consome o contador de inválidas', () => {
  const rotaComInvalidas = defineRoute({
    operationId: 'exemploDeInvalidas',
    method: 'post',
    path: '/confere',
    effects: ['verifies_secret'],
    rateLimit: [
      {
        dimension: ['ip'],
        appliesTo: 'invalid_attempts',
        limit: 2,
        window: '1h',
        onExceed: 'deny_429',
      },
    ],
  });

  /**
   * `?ok=1` responde 200; qualquer outra coisa lança `unauthenticated`, que é um
   * dos tipos que significam credencial recusada.
   */
  function bancada(contador: RateLimitStore) {
    const app = servidor(contador);
    registrarRota(app, rotaComInvalidas, {}, async (request, reply) => {
      const { ok } = request.query as { ok?: string };
      if (ok !== '1') throw problemas.naoAutenticado();
      return reply.status(200).send({});
    });
    return app;
  }

  async function bater(app: ReturnType<typeof bancada>, valida: boolean): Promise<number> {
    const resposta = await app.inject({
      method: 'POST',
      url: valida ? '/confere?ok=1' : '/confere',
      headers: { 'x-forwarded-for': '198.51.100.20' },
    });
    return resposta.statusCode;
  }

  void it('alternando válida e inválida, só as inválidas contam', async () => {
    const app = bancada(contadorNovo());

    // VINTE VÁLIDAS NÃO GASTAM NADA. É este laço que fecha o critério 8: com
    // `hit()` na entrada, a décima já teria estourado um teto de 2.
    for (let i = 0; i < 20; i += 1) {
      assert.equal(await bater(app, true), 200, `a ${String(i + 1)}ª válida consumiu o balde`);
    }

    assert.equal(await bater(app, false), 401, '1ª inválida: recusada pela credencial');
    assert.equal(await bater(app, true), 200, 'a válida continua passando com 1 de 2 no balde');
    assert.equal(await bater(app, false), 401, '2ª inválida: o balde chega ao teto');

    // DEPOIS DO TETO, TUDO É RECUSADO — inclusive o que teria sido válido, e a
    // consequência é deliberada, não um efeito colateral. O servidor não tem
    // como saber que uma tentativa era válida sem fazer a conferência cara, que
    // é exatamente o trabalho que o teto existe para não pagar. Estourar as 2
    // inválidas fecha a rota para aquele endereço até a janela virar.
    const depoisDoTeto = await app.inject({
      method: 'POST',
      url: '/confere?ok=1',
      headers: { 'x-forwarded-for': '198.51.100.20' },
    });
    assert.equal(depoisDoTeto.statusCode, 429);
    assert.equal(tipoDe(depoisDoTeto.body), 'rate-limited');

    await app.close();
  });

  void it('ISCA: com o limitador desligado a 3ª inválida sai 401 e não 429', async () => {
    const app = bancada(criarContadorDesligado());
    for (let i = 0; i < 3; i += 1) {
      assert.equal(await bater(app, false), 401);
    }
    await app.close();
  });
});

void describe('critério 9: a contagem acontece na dimensão declarada', () => {
  const porIp = defineRoute({
    operationId: 'exemploPorIp',
    method: 'get',
    path: '/por-ip',
    effects: [],
    rateLimit: [{ dimension: ['ip'], limit: 1, window: '1h', onExceed: 'deny_429' }],
  });

  void it('dois endereços diferentes têm baldes diferentes; o mesmo endereço, não', async () => {
    const app = servidor();
    registrarRota(app, porIp, {}, async (_request, reply) => reply.status(200).send({}));

    const chamar = async (ip: string): Promise<number> =>
      (await app.inject({ method: 'GET', url: '/por-ip', headers: { 'x-forwarded-for': ip } }))
        .statusCode;

    assert.equal(await chamar('203.0.113.1'), 200);
    assert.equal(await chamar('203.0.113.1'), 429, 'segundo pedido do MESMO endereço');
    assert.equal(
      await chamar('198.51.100.1'),
      200,
      'outro endereço não pode herdar o balde do primeiro',
    );

    await app.close();
  });

  void it('a chave do balde não carrega o endereço em claro (SEC-010)', async () => {
    const chaves: string[] = [];
    const espiao: RateLimitStore = {
      hit: (chave) => {
        chaves.push(chave);
        return Promise.resolve({ allowed: true, remaining: 1 });
      },
      peek: () => Promise.resolve({ allowed: true, remaining: 1 }),
      reset: () => Promise.resolve(),
    };

    const app = servidor(espiao);
    registrarRota(app, porIp, {}, async (_request, reply) => reply.status(200).send({}));
    await app.inject({
      method: 'GET',
      url: '/por-ip',
      headers: { 'x-forwarded-for': '203.0.113.42' },
    });
    await app.close();

    assert.equal(chaves.length, 1);
    assert.ok(
      !chaves[0]?.includes('203.0.113'),
      `a chave do balde carrega o endereço em claro: ${chaves[0] ?? ''}. ` +
        'Ela vai para `rate_limit_counters` e sobrevive à exclusão da conta.',
    );
  });
});

void describe('o que o mecanismo NÃO aplica sai inventariado, e não em silêncio', () => {
  void it('`counts: distinct_identities` e `when:` entram no inventário com o motivo', () => {
    zerarInventario();

    const rotaComContagemDistinta = defineRoute({
      operationId: 'exemploDistinto',
      method: 'post',
      path: '/distinto',
      effects: ['notifies'],
      rateLimit: [
        {
          dimension: ['ip'],
          counts: 'distinct_identities',
          limit: 3,
          window: '1h',
          onExceed: 'group_notification',
        },
        {
          dimension: ['ip'],
          when: 'pet_lost',
          limit: 30,
          window: '24h',
          onExceed: 'notify_once_and_review',
        },
      ],
    });

    const app = servidor();
    registrarRota(app, rotaComContagemDistinta, {}, async (_request, reply) => reply.send({}));

    const fora = inventarioDoQueNaoEAplicado();
    assert.equal(fora.length, 2);
    assert.match(fora[0]?.motivo ?? '', /valores distintos/);
    assert.match(fora[1]?.motivo ?? '', /estado do pet/);
    zerarInventario();
  });
});
