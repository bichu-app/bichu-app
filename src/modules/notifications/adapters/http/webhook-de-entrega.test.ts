import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';

import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import type { AbsoluteUrl } from '../../../../shared/types/brands.js';
import { registrarRotaDoWebhookDeEntrega } from './webhook-de-entrega.js';
import type { EventoParaGravar, RegistroDeEntregas } from '../../ports/registro-de-entregas.js';

const SEGREDO = 'segredo-de-teste-com-32-bytes!!!';
const TUTOR = 'tutor@exemplo.invalid';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;

interface Bancada {
  readonly app: RegistradorDeRotas;
  readonly gravados: EventoParaGravar[];
  readonly suprimidos: string[];
  readonly logs: unknown[];
}

function subirApp(opcoes: { segredoDoServidor?: string } = {}): Bancada {
  const gravados: EventoParaGravar[] = [];
  const suprimidos: string[] = [];
  const logs: unknown[] = [];
  const vistos = new Set<string>();

  const registro: RegistroDeEntregas = {
    registrar(evento) {
      const chave = JSON.stringify([evento.messageId, evento.recordType]);
      if (vistos.has(chave)) return Promise.resolve(false);
      vistos.add(chave);
      gravados.push(evento);
      return Promise.resolve(true);
    },
    marcarEnderecoNaoEntregavel(endereco) {
      suprimidos.push(endereco);
      return Promise.resolve(true);
    },
  };

  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(),
  });

  app.addHook('onRequest', (request, _reply, pronto) => {
    for (const nivel of ['info', 'warn', 'error'] as const) {
      const original = request.log[nivel].bind(request.log);
      request.log[nivel] = (dados: unknown, mensagem?: string) => {
        if (!ehLogDoFastify(dados)) logs.push(dados);
        original(dados, mensagem);
      };
    }
    pronto();
  });

  registrarRotaDoWebhookDeEntrega(app, {
    registro,
    segredo: Buffer.from(opcoes.segredoDoServidor ?? SEGREDO, 'utf8'),
    contrato: carregarContrato('api/openapi.yaml'),
  });

  return { app, gravados, suprimidos, logs };
}

function semACchave(corpo: Record<string, unknown>, chave: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(corpo).filter(([nome]) => nome !== chave));
}

function devolucao(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    RecordType: 'Bounce',
    MessageID: 'mensagem-1',
    Recipient: TUTOR,
    Type: 'HardBounce',
    Description: 'A caixa nao existe',
    DeliveredAt: '2026-09-19T12:00:00.000Z',
    ...extra,
  };
}

function ehLogDoFastify(dados: unknown): boolean {
  if (typeof dados !== 'object' || dados === null) return false;
  return 'req' in dados || 'res' in dados;
}

async function chamar(
  bancada: Bancada,
  opcoes: { assinatura?: string; corpo?: unknown } = {},
): Promise<Awaited<ReturnType<RegistradorDeRotas['inject']>>> {
  return bancada.app.inject({
    method: 'POST',
    url: '/webhooks/postmark',
    headers: {
      'content-type': 'application/json',
      ...(opcoes.assinatura === undefined ? {} : { 'x-postmark-signature': opcoes.assinatura }),
    },
    payload: JSON.stringify(opcoes.corpo ?? devolucao()),
  });
}

void describe('autenticação: o webhook é chamada DE ENTRADA, da internet aberta', () => {
  void it('SEM o cabeçalho de assinatura responde 401 e não executa nada', async () => {
    const bancada = subirApp();
    const resposta = await chamar(bancada);

    assert.equal(resposta.statusCode, 401);
    assert.equal(bancada.gravados.length, 0, 'nada pode ser gravado sem assinatura');
    assert.deepEqual(bancada.suprimidos, [], 'nenhum endereço pode ser suprimido sem assinatura');
  });

  void it('com assinatura ERRADA responde 401 e não executa nada', async () => {
    const bancada = subirApp();
    const resposta = await chamar(bancada, { assinatura: 'x'.repeat(SEGREDO.length) });

    assert.equal(resposta.statusCode, 401);
    assert.equal(bancada.gravados.length, 0);
    assert.deepEqual(bancada.suprimidos, []);
  });

  void it('assinatura que é PREFIXO do segredo não passa', async () => {
    const bancada = subirApp();
    const resposta = await chamar(bancada, { assinatura: SEGREDO.slice(0, -1) });

    assert.equal(resposta.statusCode, 401);
    assert.equal(bancada.gravados.length, 0);
  });

  void it('assinatura vazia não passa', async () => {
    const bancada = subirApp();
    const resposta = await chamar(bancada, { assinatura: '' });

    assert.equal(resposta.statusCode, 401);
    assert.equal(bancada.gravados.length, 0);
  });

  void it('o 401 sai em `application/problem+json` e sem `next_action`', async () => {
    const bancada = subirApp();
    const resposta = await chamar(bancada, { assinatura: 'errada' });
    const corpo = resposta.json<Record<string, unknown>>();

    assert.match(String(resposta.headers['content-type']), /application\/problem\+json/);
    assert.equal(corpo['status'], 401);
    assert.equal(String(corpo['type']).endsWith('/unauthenticated'), true);

    assert.equal('next_action' in corpo, false, 'não se manda um robô fazer login');
  });

  void it('o corpo do 401 é IDÊNTICO para cabeçalho ausente e para segredo errado', async () => {
    const semCabecalho = (await chamar(subirApp()))
      .json<Record<string, unknown>>();
    const comSegredoErrado = (await chamar(subirApp(), { assinatura: 'errada' }))
      .json<Record<string, unknown>>();

    const semCorrelacao = (corpo: Record<string, unknown>): Record<string, unknown> =>
      Object.fromEntries(Object.entries(corpo).filter(([chave]) => chave !== 'correlation_id'));
    assert.deepEqual(semCorrelacao(semCabecalho), semCorrelacao(comSegredoErrado));
  });

  void it('ISCA: com o segredo CERTO o mesmo pedido passa', async () => {
    const bancada = subirApp();
    const resposta = await chamar(bancada, { assinatura: SEGREDO });

    assert.equal(resposta.statusCode, 204);
    assert.equal(bancada.gravados.length, 1);
  });
});

void describe('idempotência pela borda: o provedor reenvia', () => {
  void it('o reenvio responde 204 e não produz segundo efeito', async () => {
    const bancada = subirApp();
    const primeira = await chamar(bancada, { assinatura: SEGREDO });
    const segunda = await chamar(bancada, { assinatura: SEGREDO });

    assert.equal(primeira.statusCode, 204);
    assert.equal(segunda.statusCode, 204);
    assert.equal(bancada.gravados.length, 1);
    assert.equal(bancada.suprimidos.length, 1, 'o endereço não pode ser suprimido duas vezes');
  });
});

void describe('contato mediado e ADR-0010 item 6: o que NÃO sai daqui', () => {
  void it('a resposta de sucesso é 204 sem corpo nenhum', async () => {
    const bancada = subirApp();
    const resposta = await chamar(bancada, { assinatura: SEGREDO });

    assert.equal(resposta.statusCode, 204);
    assert.equal(resposta.body, '');
  });

  void it('o e-mail do destinatário NUNCA aparece no log', async () => {
    const bancada = subirApp();
    await chamar(bancada, { assinatura: SEGREDO });

    const tudoQueFoiLogado = JSON.stringify(bancada.logs);
    assert.equal(
      tudoQueFoiLogado.includes(TUTOR),
      false,
      `o endereço do tutor vazou para o log: ${tudoQueFoiLogado}`,
    );
    assert.equal(tudoQueFoiLogado.includes('exemplo.invalid'), false);

    assert.equal(tudoQueFoiLogado.includes('mensagem-1'), true, 'o `MessageID` precisa ser logado');
  });

  void it('ISCA: o teste de log enxerga o e-mail quando ele realmente vaza', async () => {
    const bancada = subirApp();
    await chamar(bancada, { assinatura: SEGREDO });

    assert.ok(bancada.logs.length > 0, 'a captura precisa ter pegado alguma linha da rota');
    bancada.logs.push({ recipient: TUTOR });
    assert.equal(JSON.stringify(bancada.logs).includes(TUTOR), true);
  });

  void it('o e-mail também não aparece no corpo do 401', async () => {
    const bancada = subirApp();
    const resposta = await chamar(bancada, { assinatura: 'errada' });

    assert.equal(resposta.body.includes(TUTOR), false);
  });
});

void describe('o corpo é validado pelo schema do contrato, e não por regra local', () => {
  void it('corpo sem `MessageID` é recusado', async () => {
    const bancada = subirApp();
    const semId = semACchave(devolucao(), 'MessageID');
    const resposta = await chamar(bancada, { assinatura: SEGREDO, corpo: semId });

    assert.equal(resposta.statusCode, 400);
    assert.equal(bancada.gravados.length, 0);
  });

  void it('`RecordType` fora do `enum` é recusado antes de chegar ao banco', async () => {
    const bancada = subirApp();
    const resposta = await chamar(bancada, {
      assinatura: SEGREDO,
      corpo: devolucao({ RecordType: 'Inventado' }),
    });

    assert.equal(resposta.statusCode, 400);
    assert.equal(bancada.gravados.length, 0);
  });

  void it('corpo inválido com assinatura ERRADA responde 401, e não 400', async () => {
    const bancada = subirApp();
    const resposta = await chamar(bancada, {
      assinatura: 'errada',
      corpo: { isto: 'nao e um evento' },
    });

    assert.equal(resposta.statusCode, 401);
  });

  void it('`DeliveredAt` AUSENTE não derruba o evento', async () => {
    const bancada = subirApp();
    const semData = semACchave(devolucao(), 'DeliveredAt');
    const resposta = await chamar(bancada, { assinatura: SEGREDO, corpo: semData });

    assert.equal(resposta.statusCode, 204);
    assert.equal(bancada.gravados.length, 1);
    assert.equal(bancada.gravados[0]?.ocorridoEm, null);
  });

  void it('`DeliveredAt` ILEGÍVEL é recusado pelo schema do contrato, com 400', async () => {
    const bancada = subirApp();
    const resposta = await chamar(bancada, {
      assinatura: SEGREDO,
      corpo: devolucao({ DeliveredAt: 'nao-e-uma-data' }),
    });

    assert.equal(resposta.statusCode, 400);
    assert.equal(bancada.gravados.length, 0);
  });

  void it('a rota fica FORA de `/v1`, como o contrato declara', async () => {
    const bancada = subirApp();
    const fora = await chamar(bancada, { assinatura: SEGREDO });
    const dentro = await bancada.app.inject({
      method: 'POST',
      url: '/v1/webhooks/postmark',
      headers: { 'content-type': 'application/json', 'x-postmark-signature': SEGREDO },
      payload: JSON.stringify(devolucao()),
    });

    assert.equal(fora.statusCode, 204);
    assert.equal(dentro.statusCode, 404, 'a rota não pode existir sob `/v1`');
  });
});
