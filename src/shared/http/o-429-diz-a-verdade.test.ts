import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { criarServidor } from './server.js';
import { registrarRota } from './registrar-rota.js';
import { tetoDeTeste } from './teto-de-teste.js';
import { rotaDePedidoDeRedefinicao } from '../../modules/identity/adapters/http/routes.js';
import { rotaDeIntencaoDeFotoDoAchado } from '../../modules/found/adapters/http/found-report-routes.js';
import type { AbsoluteUrl } from '../types/brands.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;

const AFIRMA_A_DIMENSAO =
  /aparelho|dispositivo|celular|smartphone|\brede\b|\bip\b|endere[çc]o|wi-?fi|conex[ãa]o|navegador/i;

const PRAZO_VAGO = /\binstantes?\b|\bem breve\b|\bmais tarde\b|\bdaqui a pouco\b|\blogo mais\b/i;

interface CorpoDoProblema {
  readonly type?: string;
  readonly title?: string;
  readonly detail?: string;
  readonly next_action?: string;
}

function servidor() {
  return criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(),
  });
}

interface RespostaLida {
  readonly status: number;
  readonly corpo: CorpoDoProblema;
  readonly retryAfter: string | undefined;
  readonly texto: string;
}

async function estourar(
  registrar: (app: ReturnType<typeof servidor>) => void,
  url: string,
  vezes: number,
): Promise<RespostaLida> {
  const app = servidor();
  registrar(app);
  try {
    let ultima = await app.inject({ method: 'POST' as const, url });
    for (let i = 1; i < vezes; i += 1) ultima = await app.inject({ method: 'POST' as const, url });
    const cabecalho: unknown = ultima.headers['retry-after'];
    const corpo = JSON.parse(ultima.body) as CorpoDoProblema;
    return {
      status: ultima.statusCode,
      corpo,
      retryAfter: typeof cabecalho === 'string' ? cabecalho : undefined,
      texto: `${corpo.title ?? ''} ${corpo.detail ?? ''}`,
    };
  } finally {
    await app.close();
  }
}

function pedidoDeRedefinicao(app: ReturnType<typeof servidor>): void {
  registrarRota(
    app,
    rotaDePedidoDeRedefinicao,
    {
      resolvedores: {
        email: (_request, sigilo) => sigilo.hmac('quem-esqueceu-a-senha@bichu.test'),
      },
    },
    (_request, reply) => Promise.resolve(reply.status(202).send()),
  );
}

function intencaoDeFotoDoAchado(app: ReturnType<typeof servidor>): void {
  registrarRota(
    app,
    rotaDeIntencaoDeFotoDoAchado,
    {
      resolvedores: {
        found_report: (_request, sigilo) => sigilo.hmac('um-aviso-so'),
      },
    },
    (_request, reply) => Promise.resolve(reply.status(201).send({})),
  );
}

void describe('o 429 de janela que reabre', () => {
  void it('não afirma dimensão nenhuma: nem "deste aparelho", nem "desta rede"', async () => {
    const lida = await estourar(pedidoDeRedefinicao, '/auth/password-reset', 4);

    assert.equal(lida.status, 429);
    assert.match(lida.corpo.type ?? '', /\/rate-limited$/);
    assert.doesNotMatch(
      lida.texto,
      AFIRMA_A_DIMENSAO,
      `o corpo do 429 voltou a nomear a dimensão do balde: ${lida.texto}`,
    );
  });

  void it('o prazo é o número do `Retry-After`, e não uma vaguidade', async () => {
    const lida = await estourar(pedidoDeRedefinicao, '/auth/password-reset', 4);

    assert.doesNotMatch(lida.texto, PRAZO_VAGO, `o prazo voltou a ser vago: ${lida.texto}`);

    assert.ok(lida.retryAfter !== undefined, 'o 429 saiu sem `Retry-After`');
    const segundos = Number(lida.retryAfter);
    assert.ok(Number.isInteger(segundos) && segundos > 0 && segundos <= 3600, lida.retryAfter);

    const casado = /Tente de novo em (\d+) (segundos?|minutos?|horas?)/.exec(lida.corpo.title ?? '');
    assert.ok(casado !== null, `título sem prazo em palavras: ${String(lida.corpo.title)}`);
    const quantidade = Number(casado[1]);
    const emSegundos = casado[2]?.startsWith('hora')
      ? quantidade * 3600
      : casado[2]?.startsWith('minuto')
        ? quantidade * 60
        : quantidade;
    assert.ok(
      emSegundos >= segundos && emSegundos < segundos + 3600,
      `o texto diz ${String(emSegundos)}s e o cabeçalho diz ${String(segundos)}s`,
    );
  });

  void it('tem saída: `next_action` é `retry_later`', async () => {
    const lida = await estourar(pedidoDeRedefinicao, '/auth/password-reset', 4);
    assert.equal(lida.corpo.next_action, 'retry_later');
  });
});

void describe('o 429 de teto que NÃO reabre (`window: lifetime`)', () => {
  void it('não promete prazo nenhum, porque não há', async () => {
    const lida = await estourar(
      intencaoDeFotoDoAchado,
      '/media/found-report-photo-intents',
      4,
    );

    assert.equal(lida.status, 429);
    assert.doesNotMatch(lida.texto, PRAZO_VAGO, lida.texto);
    assert.doesNotMatch(
      lida.texto,
      /\d+\s*(segundo|minuto|hora|dia)/i,
      `o teto vitalício voltou a prometer um prazo: ${lida.texto}`,
    );
    assert.match(lida.texto, /não reinicia/i);
  });

  void it('sai sem `Retry-After`: número que o servidor sabe errado é pior que nenhum', async () => {
    const lida = await estourar(
      intencaoDeFotoDoAchado,
      '/media/found-report-photo-intents',
      4,
    );
    assert.equal(lida.retryAfter, undefined);
  });

  void it('não afirma dimensão, e não oferece `retry_later` — esperar não resolve', async () => {
    const lida = await estourar(
      intencaoDeFotoDoAchado,
      '/media/found-report-photo-intents',
      4,
    );
    assert.doesNotMatch(lida.texto, AFIRMA_A_DIMENSAO, lida.texto);
    assert.equal(lida.corpo.next_action, undefined);
  });
});

void describe('as três primeiras passam: o teto recusa a quarta, e só ela', () => {
  void it('a 3ª chamada da redefinição ainda é 202', async () => {
    const app = servidor();
    pedidoDeRedefinicao(app);
    try {
      for (let i = 0; i < 2; i += 1) {
        await app.inject({ method: 'POST' as const, url: '/auth/password-reset' });
      }
      const terceira = await app.inject({ method: 'POST' as const, url: '/auth/password-reset' });
      assert.equal(terceira.statusCode, 202);
    } finally {
      await app.close();
    }
  });

  void it('a 3ª intenção de foto do achado ainda é 201', async () => {
    const app = servidor();
    intencaoDeFotoDoAchado(app);
    try {
      for (let i = 0; i < 2; i += 1) {
        await app.inject({ method: 'POST' as const, url: '/media/found-report-photo-intents' });
      }
      const terceira = await app.inject({
        method: 'POST' as const,
        url: '/media/found-report-photo-intents',
      });
      assert.equal(terceira.statusCode, 201);
    } finally {
      await app.close();
    }
  });
});
