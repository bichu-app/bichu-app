import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { criarServidor } from '../../../../shared/http/server.js';
import {
  inventarioDoQueNaoEAplicado,
  registrarRota,
  zerarInventario,
} from '../../../../shared/http/registrar-rota.js';
import {
  criarContadorDesligado,
  criarContadorEmMemoria,
  inicioDaJanela,
  janelaEmSegundos,
} from '../../../../shared/http/rate-limit.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import {
  resolvedoresDoEnvio,
  rotaDeEnvioDeMensagem,
  type DependenciasDasRotasDeConversa,
} from './conversation-routes.js';
import type { RateLimitStore } from '../../../../shared/ports/rate-limit-store.js';
import type { AbsoluteUrl, UserId } from '../../../../shared/types/brands.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const CONVERSA = '018f3a2b-0000-7000-8000-0000000000cc';
const CONTA = '018f3a2b-0000-7000-8000-0000000000aa';
const OUTRA_CONVERSA = '018f3a2b-0000-7000-8000-0000000000dd';

const TETO_POR_HORA = 30;

function servidor(contador: RateLimitStore) {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(contador),
    bodyLimitBytes: 1_048_576,
  });
  registrarRota(
    app,
    rotaDeEnvioDeMensagem,
    { resolvedores: resolvedoresDoEnvio(dependenciasDeTeste()) },
    (_request, reply) => Promise.resolve(reply.status(201).send({ ok: true })),
  );
  return app;
}

function dependenciasDeTeste(): DependenciasDasRotasDeConversa {
  return {
    autenticador: { autenticar: () => Promise.resolve({ userId: CONTA as UserId }) },
    conversas: undefined as unknown as DependenciasDasRotasDeConversa['conversas'],
    contrato: undefined as unknown as DependenciasDasRotasDeConversa['contrato'],
    idempotencia: undefined as unknown as DependenciasDasRotasDeConversa['idempotencia'],
    clock: undefined as unknown as DependenciasDasRotasDeConversa['clock'],
    assinarFoto: (chave: string) =>
      Promise.resolve(`https://privado.invalid/${chave}` as AbsoluteUrl),
    baseDeMidia: undefined as unknown as DependenciasDasRotasDeConversa['baseDeMidia'],
  };
}

async function enviar(app: ReturnType<typeof servidor>, conversa: string) {
  return app.inject({
    method: 'POST',
    url: `/conversations/${conversa}/messages`,
    headers: { authorization: 'Bearer token-de-teste' },
    payload: { body: 'oi' },
  });
}

function tipoDe(corpo: string): string | undefined {
  try {
    const { type } = JSON.parse(corpo) as { type?: unknown };
    return typeof type === 'string' ? type.slice(type.lastIndexOf('/') + 1) : undefined;
  } catch {
    return undefined;
  }
}

void describe('critério 10 — 30 mensagens por hora por participante, com 429', () => {
  void it('a 30ª passa e a 31ª é recusada com `rate-limited`', async () => {
    zerarInventario();
    const app = servidor(criarContadorEmMemoria(() => Date.now()));
    try {
      for (let i = 0; i < TETO_POR_HORA; i += 1) {
        const resposta = await enviar(app, CONVERSA);
        assert.equal(resposta.statusCode, 201, `a ${String(i + 1)}ª foi recusada cedo demais`);
      }
      const estourou = await enviar(app, CONVERSA);
      assert.equal(estourou.statusCode, 429);
      assert.equal(tipoDe(estourou.body), 'rate-limited');
      assert.ok(
        estourou.headers['retry-after'] !== undefined,
        '429 sem `Retry-After` manda o cliente tentar de novo às cegas',
      );
    } finally {
      await app.close();
    }
  });

  void it('o balde é POR CONVERSA: estourar numa não cala a pessoa na outra', async () => {
    zerarInventario();
    const app = servidor(criarContadorEmMemoria(() => Date.now()));
    try {
      for (let i = 0; i <= TETO_POR_HORA; i += 1) await enviar(app, CONVERSA);
      const outra = await enviar(app, OUTRA_CONVERSA);
      assert.equal(outra.statusCode, 201, 'o teto de uma conversa calou a pessoa na outra');
    } finally {
      await app.close();
    }
  });

  void it('duas entradas na mesma dimensão não se somam, nem às 00:00 UTC', async () => {
    zerarInventario();
    const MEIA_NOITE_UTC = Date.parse('2026-09-23T00:00:00.000Z');
    const app = servidor(criarContadorEmMemoria(() => MEIA_NOITE_UTC));
    try {
      for (let i = 0; i < TETO_POR_HORA; i += 1) {
        const resposta = await enviar(app, CONVERSA);
        assert.equal(
          resposta.statusCode,
          201,
          `a ${String(i + 1)}ª foi recusada cedo demais: o balde de 1 h e o de 24 h voltaram ` +
            'a compartilhar chave, e o teto de 30 virou 15',
        );
      }
      assert.equal((await enviar(app, CONVERSA)).statusCode, 429);
    } finally {
      await app.close();
    }
  });

  void it('00:30 UTC — a hora em que as duas entradas somavam no mesmo balde', async () => {
    zerarInventario();
    const dentroDaColisao = Date.parse('2026-09-29T00:30:00Z');
    assert.equal(
      inicioDaJanela(dentroDaColisao, janelaEmSegundos('1h')).getTime(),
      inicioDaJanela(dentroDaColisao, janelaEmSegundos('24h')).getTime(),
      'a premissa deste caso caiu: os dois inícios de janela deixaram de coincidir',
    );
    const app = servidor(criarContadorEmMemoria(() => dentroDaColisao));
    try {
      for (let i = 0; i < TETO_POR_HORA; i += 1) {
        const resposta = await enviar(app, CONVERSA);
        assert.equal(resposta.statusCode, 201, `a ${String(i + 1)}ª foi recusada cedo demais`);
      }
      const estourou = await enviar(app, CONVERSA);
      assert.equal(estourou.statusCode, 429, 'a 31ª passou: o teto parou de valer');
      assert.equal(tipoDe(estourou.body), 'rate-limited');
    } finally {
      await app.close();
    }
  });

  void it('ISCA — com o contador DESLIGADO, a 31ª passa, e este arquivo reprova', async () => {
    zerarInventario();
    const app = servidor(criarContadorDesligado());
    try {
      for (let i = 0; i < TETO_POR_HORA; i += 1) await enviar(app, CONVERSA);
      const trigesimaPrimeira = await enviar(app, CONVERSA);
      assert.equal(
        trigesimaPrimeira.statusCode,
        201,
        'o contador desligado recusou: a isca parou de medir o que ela existe para medir',
      );
    } finally {
      await app.close();
    }
  });
});

void describe('o que a borda NÃO aplica precisa estar dito em voz alta', () => {
  void it('a entrada de `distinct_cases` entra no inventário, com o motivo', async () => {
    zerarInventario();
    const app = servidor(criarContadorEmMemoria(() => Date.now()));
    try {
      const inventario = inventarioDoQueNaoEAplicado().filter(
        (e) => e.operationId === 'postConversationMessage',
      );
      assert.equal(inventario.length, 1, `inventário: ${JSON.stringify(inventario)}`);
      assert.deepEqual(inventario[0]?.entrada.dimension, ['account']);
      assert.match(inventario[0]?.motivo ?? '', /distinct_cases/);
    } finally {
      await app.close();
    }
  });

  void it('a rota declara as TRÊS entradas que o contrato declara', () => {
    assert.deepEqual(
      rotaDeEnvioDeMensagem.rateLimit.map((e) => [e.dimension.join('+'), e.limit, e.onExceed]),
      [
        ['conversation_participant', 30, 'deny_429'],
        ['conversation_participant', 200, 'hold_for_review'],
        ['account', 3, 'hold_for_review'],
      ],
    );
  });
});
