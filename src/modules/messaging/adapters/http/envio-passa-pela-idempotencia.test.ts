import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { criarContadorEmMemoria } from '../../../../shared/http/rate-limit.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import { hashDeCorpo } from '../../../../shared/crypto/digest.js';
import { problemas } from '../../../../shared/http/errors.js';
import {
  vigiarIdempotenciaDasRotas,
  type EntradaDeIdempotencia,
  type Idempotencia,
  type RespostaGravada,
} from '../../../../shared/http/idempotency.js';
import { registrarRotasDeConversas } from './conversation-routes.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { Clock } from '../../../../shared/ports/index.js';
import type { MensagemGravada } from '../../ports/conversation-repository.js';
import type { ConversationId, AbsoluteUrl, UserId } from '../../../../shared/types/brands.js';
import type { DependenciasDasRotasDeConversa } from './conversation-routes.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const AGORA = Date.UTC(2026, 8, 22, 12, 0, 0);
const CONVERSA = '018f3a2b-0000-7000-8000-0000000000cc';
const OUTRA_CONVERSA = '018f3a2b-0000-7000-8000-0000000000dd';
const CONTA = '018f3a2b-0000-7000-8000-0000000000aa';
const CHAVE = '9f0b6a2e-4d1c-4f2a-9b3e-7c5d8a1f0e42';

function idempotenciaEmMemoria(): Idempotencia {
  const linhas = new Map<string, { resumo: string; dono: string; gravada?: RespostaGravada }>();
  return {
    reservar(entrada: EntradaDeIdempotencia): Promise<RespostaGravada | undefined> {
      const resumo = hashDeCorpo(entrada.corpoCanonico).toString('hex');
      const existente = linhas.get(entrada.chave);
      if (existente === undefined) {
        linhas.set(entrada.chave, { resumo, dono: entrada.donoOuToken });
        return Promise.resolve(undefined);
      }
      if (existente.resumo !== resumo || existente.dono !== entrada.donoOuToken) {
        throw problemas.validacao([
          { field: 'Idempotency-Key', code: 'reused', message: 'Chave usada para outro pedido.' },
        ]);
      }
      return Promise.resolve(existente.gravada);
    },
    concluir(chave: string, status: number, corpo: unknown): Promise<void> {
      const linha = linhas.get(chave);
      if (linha !== undefined) linha.gravada = { status, body: corpo };
      return Promise.resolve();
    },
    liberar(chave: string): Promise<void> {
      linhas.delete(chave);
      return Promise.resolve();
    },
  };
}

interface Bancada {
  readonly app: RegistradorDeRotas;
  readonly envios: () => number;
}

function bancada(): Bancada {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(criarContadorEmMemoria(() => AGORA)),
    bodyLimitBytes: 1_048_576,
  });

  let chamadas = 0;
  const clock: Clock = { now: () => AGORA as ReturnType<Clock['now']> };

  const conversas = {
    enviar(conversa: ConversationId, texto: string): Promise<MensagemGravada> {
      chamadas += 1;
      return Promise.resolve({
        id: `018f3a2b-0000-7000-8000-0000000000${String(10 + chamadas)}`,
        senderRole: 'owner',
        body: `${texto} (${conversa})`,
        redactions: [],
        createdAt: new Date(AGORA),
      } as unknown as MensagemGravada);
    },
  } as unknown as DependenciasDasRotasDeConversa['conversas'];

  registrarRotasDeConversas(app, {
    conversas,
    autenticador: { autenticar: (token: string) => Promise.resolve({ userId: token as UserId }) },
    contrato: carregarContrato('api/openapi.yaml'),
    idempotencia: idempotenciaEmMemoria(),
    clock,
    assinarFoto: (chave: string) =>
      Promise.resolve(`https://privado.invalid/${chave}` as AbsoluteUrl),
    baseDeMidia: 'https://midia.test' as DependenciasDasRotasDeConversa['baseDeMidia'],
  });

  return { app, envios: () => chamadas };
}

function enviar(
  app: RegistradorDeRotas,
  opcoes: { conversa?: string; chave?: string; texto?: string } = {},
) {
  return app.inject({
    method: 'POST',
    url: `/conversations/${opcoes.conversa ?? CONVERSA}/messages`,
    headers: {
      authorization: `Bearer ${CONTA}`,
      ...(opcoes.chave === undefined ? {} : { 'idempotency-key': opcoes.chave }),
    },
    payload: { body: opcoes.texto ?? 'estou com ele aqui em casa' },
  });
}

void describe('o envio de mensagem honra a Idempotency-Key que o contrato declara', () => {
  void it('o segundo envio com a mesma chave não chama o serviço de novo', async () => {
    const { app, envios } = bancada();

    const primeira = await enviar(app, { chave: CHAVE });
    const segunda = await enviar(app, { chave: CHAVE });
    await app.close();

    assert.equal(primeira.statusCode, 201);
    assert.equal(segunda.statusCode, 201);
    assert.deepEqual(JSON.parse(segunda.body), JSON.parse(primeira.body));
    assert.equal(
      envios(),
      1,
      'o serviço foi chamado duas vezes: o reenvio da fila offline criaria duas mensagens iguais',
    );
  });

  void it('sem chave, cada envio é um envio: a idempotência é opcional no contrato', async () => {
    const { app, envios } = bancada();

    assert.equal((await enviar(app)).statusCode, 201);
    assert.equal((await enviar(app)).statusCode, 201);
    await app.close();

    assert.equal(envios(), 2);
  });

  void it('a mesma chave em outra conversa é recusada, e não devolve a mensagem da primeira', async () => {
    const { app, envios } = bancada();

    const primeira = await enviar(app, { chave: CHAVE, conversa: CONVERSA });
    const segunda = await enviar(app, { chave: CHAVE, conversa: OUTRA_CONVERSA });
    await app.close();

    assert.equal(primeira.statusCode, 201);
    assert.equal(segunda.statusCode, 400);
    assert.equal(envios(), 1);
  });

  void it('chave que não é UUID é recusada antes de qualquer efeito', async () => {
    const { app, envios } = bancada();

    const resposta = await enviar(app, { chave: 'nao-e-uuid' });
    await app.close();

    assert.equal(resposta.statusCode, 400);
    assert.equal(envios(), 0);
  });

  void it('o portão de subida aprova esta rota contra o contrato', async () => {
    const app = criarServidor({
      problemBaseUrl: BASE_DE_PROBLEMA,
      isProduction: false,
      teto: tetoDeTeste(criarContadorEmMemoria(() => AGORA)),
      bodyLimitBytes: 1_048_576,
    });
    const contrato = carregarContrato('api/openapi.yaml');
    const conferir = vigiarIdempotenciaDasRotas(app, contrato, '/v1');
    const clock: Clock = { now: () => AGORA as ReturnType<Clock['now']> };

    registrarRotasDeConversas(app, {
      conversas: undefined as unknown as DependenciasDasRotasDeConversa['conversas'],
      autenticador: { autenticar: () => Promise.resolve({ userId: CONTA as UserId }) },
      contrato,
      idempotencia: idempotenciaEmMemoria(),
      clock,
      assinarFoto: (chave: string) =>
        Promise.resolve(`https://privado.invalid/${chave}` as AbsoluteUrl),
      baseDeMidia: 'https://midia.test' as DependenciasDasRotasDeConversa['baseDeMidia'],
    });
    await app.ready();

    assert.doesNotThrow(conferir);
    await app.close();
  });
});
