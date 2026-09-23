/**
 * Isca do `errors[].field`: o 400 de corpo precisa dizer QUAL campo.
 *
 * Até 22/09/2026 todo 400 de validação de corpo saía com `field: ''` — a borda
 * respondia "um ou mais campos não passaram na validação" e nada mais. O schema
 * `Problem` declara `errors[].field` justamente para a tela marcar o campo, e
 * uma cadeia vazia não marca nada: num formulário de nove campos a pessoa relê
 * tudo. O dado já estava disponível o tempo inteiro, em `erro.validation`.
 *
 * Os três casos são as três formas que o Ajv reporta, e a do meio é a que faz
 * este arquivo existir: em `required` o achado vem **no objeto**, com
 * `instancePath` vazio e o nome em `params.missingProperty`. Campo obrigatório
 * ausente é o erro mais comum de qualquer formulário, então ler só
 * `instancePath` deixaria de nomear exatamente o caso que mais precisa.
 *
 * A rota é a de verdade (`createPetPhotoUploadIntent`) com o corpo do contrato
 * de verdade, e as asserções leem o JSON que saiu pelo fio.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';

import { carregarContrato } from './contract.js';
import { criarServidor } from './server.js';
import { registrarRota } from './registrar-rota.js';
import { tetoDeTeste } from './teto-de-teste.js';
import { rotaDeIntencaoDeFoto } from '../../modules/media/adapters/http/media-routes.js';
import type { AbsoluteUrl } from '../types/brands.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const CAMINHO_DA_SPEC = resolve(process.cwd(), 'api/openapi.yaml');

interface CorpoDoProblema {
  readonly type?: string;
  readonly errors?: readonly { field?: string; code?: string; message?: string }[];
}

async function recusar(payload: Record<string, unknown>): Promise<CorpoDoProblema> {
  const contrato = carregarContrato(CAMINHO_DA_SPEC);
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(),
  });
  registrarRota(
    app,
    rotaDeIntencaoDeFoto,
    {
      schema: { body: contrato.requestBodySchema(rotaDeIntencaoDeFoto.operationId) },
      resolvedores: { account: () => 'uma-conta' },
    },
    (_request, reply) => Promise.resolve(reply.status(201).send({})),
  );
  try {
    const resposta = await app.inject({
      method: 'POST' as const,
      url: '/media/pet-photo-intents',
      payload,
    });
    assert.equal(resposta.statusCode, 400, resposta.body);
    return JSON.parse(resposta.body) as CorpoDoProblema;
  } finally {
    await app.close();
  }
}

const UM_PET = '018f3a2b-0000-7000-8000-0000000000bb';

void describe('o 400 de corpo nomeia o campo que reprovou', () => {
  void it('`enum` recusado: o campo é `content_type`', async () => {
    const corpo = await recusar({
      pet_id: UM_PET,
      content_type: 'image/svg+xml',
      byte_size: 1024,
    });
    assert.match(corpo.type ?? '', /\/validation-failed$/);
    const campos = (corpo.errors ?? []).map((erro) => erro.field);
    assert.ok(
      campos.includes('content_type'),
      `nenhum campo nomeado: ${JSON.stringify(corpo.errors)}`,
    );
  });

  void it('obrigatório ausente: o nome vem de `params.missingProperty`, e não do caminho', async () => {
    const corpo = await recusar({ pet_id: UM_PET, byte_size: 1024 });
    const campos = (corpo.errors ?? []).map((erro) => erro.field);
    assert.ok(
      campos.includes('content_type'),
      `o 'required' do Ajv tem instancePath vazio e não foi lido: ${JSON.stringify(corpo.errors)}`,
    );
  });

  void it('faixa violada: o campo é `byte_size`, com o `code` da regra', async () => {
    const corpo = await recusar({
      pet_id: UM_PET,
      content_type: 'image/jpeg',
      byte_size: 0,
    });
    const doCampo = (corpo.errors ?? []).find((erro) => erro.field === 'byte_size');
    assert.ok(doCampo !== undefined, `byte_size não foi nomeado: ${JSON.stringify(corpo.errors)}`);
    assert.equal(doCampo.code, 'minimum');
  });

  void it('nenhum campo sai com o VALOR recebido junto', async () => {
    // O valor nunca entra na resposta: corpo pode carregar senha, e parâmetro de
    // caminho pode ser o código da tag, que é credencial ao portador.
    const corpo = await recusar({
      pet_id: UM_PET,
      content_type: 'image/svg+xml',
      byte_size: 1024,
    });
    const texto = JSON.stringify(corpo.errors ?? []);
    assert.doesNotMatch(texto, /svg/i, `o valor recusado voltou na resposta: ${texto}`);
  });
});
