/**
 * O teto da rota de envio, exercido pelo servidor de verdade.
 *
 * ## Por que este arquivo existe separado
 *
 * A conversa é um caminho de abuso óbvio: é por ela que o falso achador aborda
 * o tutor, e é nela que o produto promete um teto. Um teto **declarado** e não
 * aplicado foi exatamente o defeito da BICHUS-178, e ele ficou de pé por
 * semanas com o portão de contrato verde — porque o portão lia a especificação
 * e nunca abria `src/`.
 *
 * Então aqui a rota REAL é registrada num servidor REAL, com os NÚMEROS dela, e
 * as requisições são mandadas até estourar. Um teste que declarasse o seu
 * próprio teto de 3/min provaria que o mecanismo conta, e não que o teto do
 * produto vale.
 *
 * ## As duas iscas
 *
 * 1. **Com o contador desligado, o mesmo caso precisa REPROVAR.** Sem ela, um
 *    teste de limite que passa com o limitador desligado não testa limite
 *    nenhum.
 * 2. **As entradas que a borda NÃO aplica precisam aparecer no inventário.** As
 *    duas de `hold_for_review` são trabalho de domínio, e o perigo aqui não é
 *    elas não serem aplicadas: é elas sumirem em silêncio, que é a proteção que
 *    se acredita existir.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { criarServidor } from '../../../../shared/http/server.js';
import {
  inventarioDoQueNaoEAplicado,
  registrarRota,
  zerarInventario,
} from '../../../../shared/http/registrar-rota.js';
import { criarContadorDesligado, criarContadorEmMemoria } from '../../../../shared/http/rate-limit.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import { rotaDeEnvioDeMensagem } from './conversation-routes.js';
import type { RateLimitStore } from '../../../../shared/ports/rate-limit-store.js';
import type { AbsoluteUrl } from '../../../../shared/types/brands.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const CONVERSA = '018f3a2b-0000-7000-8000-0000000000cc';
const CONTA = '018f3a2b-0000-7000-8000-0000000000aa';
const OUTRA_CONVERSA = '018f3a2b-0000-7000-8000-0000000000dd';

/** O número que o contrato declara. Repetido aqui de propósito: ver o cabeçalho. */
const TETO_POR_HORA = 30;

function servidor(contador: RateLimitStore) {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(contador),
    bodyLimitBytes: 1_048_576,
  });
  // A rota real, com os resolvedores reais na forma em que o registro os
  // recebe: a conversa do caminho e a conta de quem chama.
  registrarRota(
    app,
    rotaDeEnvioDeMensagem,
    {
      resolvedores: {
        conversation_participant: (request) => {
          const { conversationId } = request.params as { conversationId?: string };
          return conversationId === undefined ? undefined : `${conversationId}:${CONTA}`;
        },
        account: () => CONTA,
      },
    },
    (_request, reply) => Promise.resolve(reply.status(201).send({ ok: true })),
  );
  return app;
}

async function enviar(app: ReturnType<typeof servidor>, conversa: string) {
  return app.inject({
    method: 'POST',
    url: `/conversations/${conversa}/messages`,
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
    // Quem está combinando a devolução de dois animais ao mesmo tempo seria
    // recusado por estar usando o produto. É por isso que a dimensão é o par
    // (conversa, participante), e não `account`.
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

  void it('ISCA — com o contador DESLIGADO, a 31ª passa, e este arquivo reprova', async () => {
    // Sem esta isca, os dois casos acima passariam num sistema sem teto nenhum.
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
    // Ela não é aplicada porque a porta `RateLimitStore` conta requisições, e
    // esta conta CASOS. Quem a torna verdade é o serviço, em `avaliarRetencao`.
    // O que não pode é ela sumir: proteção que se acredita existir é pior que
    // proteção ausente, porque ninguém procura o que acredita já ter.
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
    // Apagar uma entrada daqui não quebra nada visível: o teto simplesmente
    // deixa de existir, que é o defeito que a BICHUS-178 consertou uma vez.
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
