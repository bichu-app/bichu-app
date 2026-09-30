/**
 * Iscas do corpo do 429: a mensagem do teto **não pode voltar a mentir**.
 *
 * Até 22/09/2026 ela mentia duas vezes, e cada mentira tem uma isca aqui:
 *
 * 1. *"Recebemos muitos pedidos **deste aparelho**"* — o balde nunca foi de
 *    aparelho. São doze dimensões, e num balde de IP (CGNAT de operadora, NAT de
 *    escritório) a frase acusava quem estava fazendo o primeiro pedido do dia.
 * 2. *"Tente de novo **em instantes**"* — a janela é fixa, e o `Retry-After` da
 *    mesma resposta já trazia o número certo.
 *
 * ## Por que estes casos leem a RESPOSTA, e não a constante
 *
 * Três testes deste repositório comparavam o texto renderizado com a mesma
 * constante que o produzia. Isso é tautologia: fica verde com qualquer texto,
 * inclusive com a mentira de volta. Aqui nenhum caso importa `problemas`: cada
 * asserção é uma cadeia **escrita neste arquivo** confrontada com o JSON que
 * saiu pelo fio, depois de `montarProblema` e de `reply.send`.
 *
 * ## Por que as rotas são as de verdade
 *
 * `requestPasswordReset` e `createFoundReportPhotoUploadIntent` são rotas do
 * produto, com os NÚMEROS delas — 3 por hora por e-mail, e 3 por aviso **para
 * sempre**. A segunda é a única `window: lifetime` do contrato, e é ela que
 * exercita o caminho em que prometer prazo seria a mesma mentira com um número
 * mais convincente.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { criarServidor } from './server.js';
import { registrarRota } from './registrar-rota.js';
import { tetoDeTeste } from './teto-de-teste.js';
import { rotaDePedidoDeRedefinicao } from '../../modules/identity/adapters/http/routes.js';
import { rotaDeIntencaoDeFotoDoAchado } from '../../modules/found/adapters/http/found-report-routes.js';
import type { AbsoluteUrl } from '../types/brands.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;

/**
 * Toda palavra que afirma **por onde** a contagem acontece.
 *
 * `aparelho` e `dispositivo` são a mentira antiga. `rede`, `IP`, `wi-fi` e
 * `conexão` são a troca fácil e errada: seriam verdade em `ip` e `ip_24`, falso
 * nas outras dez dimensões, e em qualquer uma delas diriam a quem está sondando
 * o teto o que rotacionar para contorná-lo.
 */
const AFIRMA_A_DIMENSAO =
  /aparelho|dispositivo|celular|smartphone|\brede\b|\bip\b|endere[çc]o|wi-?fi|conex[ãa]o|navegador/i;

/** O prazo vago que o `Retry-After` da própria resposta contradizia. */
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

/** O que saiu pelo fio: corpo desserializado e cabeçalhos, nada reconstruído. */
interface RespostaLida {
  readonly status: number;
  readonly corpo: CorpoDoProblema;
  readonly retryAfter: string | undefined;
  /** Título e detalhe juntos: as duas frases que a pessoa lê na tela. */
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

/** `requestPasswordReset`: 3 por hora por e-mail, `deny_429`. A 4ª estoura. */
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

/** `createFoundReportPhotoUploadIntent`: 3 por aviso, `lifetime`. A 4ª estoura. */
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

    // O cabeçalho existe, é um inteiro de segundos, e cabe na janela de 1 h que
    // a rota declara.
    assert.ok(lida.retryAfter !== undefined, 'o 429 saiu sem `Retry-After`');
    const segundos = Number(lida.retryAfter);
    assert.ok(Number.isInteger(segundos) && segundos > 0 && segundos <= 3600, lida.retryAfter);

    // E o texto diz o MESMO prazo, em palavras. A unidade é conferida contra o
    // cabeçalho: o par (número, unidade) da frase tem que caber no número do
    // cabeçalho, senão as duas metades da resposta voltaram a discordar.
    const casado = /Tente de novo em (\d+) (segundos?|minutos?|horas?)/.exec(lida.corpo.title ?? '');
    assert.ok(casado !== null, `título sem prazo em palavras: ${String(lida.corpo.title)}`);
    const quantidade = Number(casado[1]);
    const emSegundos = casado[2]?.startsWith('hora')
      ? quantidade * 3600
      : casado[2]?.startsWith('minuto')
        ? quantidade * 60
        : quantidade;
    // Arredonda para cima, então o prazo escrito é >= o do cabeçalho, e nunca
    // mais de uma unidade acima dele.
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
    // Nenhum "em 24 horas": o teto de formato do `Retry-After` não é promessa de
    // reabertura, e escrevê-lo no corpo seria a mentira antiga com outro número.
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
  // O contraponto. Sem ele, um mecanismo que recusasse tudo passaria em todos os
  // casos acima, e as iscas provariam apenas que o servidor sabe responder 429.
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
