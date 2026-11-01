import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolve } from 'node:path';

import { campoDoErro, campoDoSchema, camposDoSchema } from './erros-de-schema.js';
import { carregarContrato } from './contract.js';
import { criarServidor } from './server.js';
import { registrarRota } from './registrar-rota.js';
import { tetoDeTeste } from './teto-de-teste.js';
import { rotaDePedidoDePlaquinha } from '../../modules/tags/adapters/http/pedido-de-plaquinha-routes.js';
import type { AbsoluteUrl } from '../types/brands.js';

const UM_PET = '018f3a2b-0000-7000-8000-0000000000bb';

const ENDERECO: Record<string, unknown> = {
  recipient_name: 'Mariana Destinataria',
  recipient_phone: '+5511987654321',
  postal_code: '01311000',
  street: 'Avenida Paulista Ficticia',
  street_number: '1578B',
  neighborhood: 'Bela Vista Inventada',
  city: 'Sao Paulo dos Testes',
  state: 'SP',
};

void describe('campoDoErro: o caminho e a propriedade se SOMAM', () => {
  void it('required na raiz: o nome vem dos params, sem caminho', () => {
    assert.equal(
      campoDoErro({ instancePath: '', keyword: 'required', params: { missingProperty: 'delivery_address' } }),
      'delivery_address',
    );
  });

  void it('required aninhado: caminho MAIS a propriedade que faltou', () => {
    assert.equal(
      campoDoErro({
        instancePath: '/delivery_address',
        keyword: 'required',
        params: { missingProperty: 'recipient_name' },
      }),
      'delivery_address.recipient_name',
      'o contêiner sozinho não diz qual dos campos do endereço reclamar, e é o defeito que este arquivo prende',
    );
  });

  void it('additionalProperties aninhado: o nome inventado volta no caminho inteiro', () => {
    assert.equal(
      campoDoErro({
        instancePath: '/delivery_address',
        keyword: 'additionalProperties',
        params: { additionalProperty: 'cpf' },
      }),
      'delivery_address.cpf',
    );
  });

  void it('pattern num campo aninhado: só o caminho, com `/` virando `.`', () => {
    assert.equal(
      campoDoErro({ instancePath: '/delivery_address/postal_code', keyword: 'pattern', params: {} }),
      'delivery_address.postal_code',
    );
  });

  void it('pattern na raiz: o caminho de um campo de primeiro nível', () => {
    assert.equal(campoDoErro({ instancePath: '/notes', keyword: 'maxLength', params: {} }), 'notes');
  });

  void it('item de lista: o índice entra no caminho, e o nome que faltou nele', () => {
    assert.equal(
      campoDoErro({ instancePath: '/tags/2', keyword: 'required', params: { missingProperty: 'nome' } }),
      'tags.2.nome',
    );
  });

  void it('achado sobre o corpo inteiro: vazio, porque não há campo a apontar', () => {
    assert.equal(campoDoErro({ instancePath: '', keyword: 'type', params: { type: 'object' } }), '');
  });

  void it('params ausente não quebra, e não inventa campo', () => {
    assert.equal(campoDoErro({ instancePath: '/notes' }), 'notes');
    assert.equal(campoDoErro({}), '');
  });
});

void describe('campoDoSchema: o código e a mensagem', () => {
  void it('o código vem do keyword do Ajv, e não de um rótulo fixo', () => {
    assert.equal(
      campoDoSchema({ instancePath: '/notes', keyword: 'maxLength', message: 'x' }).code,
      'maxLength',
    );
    assert.equal(
      campoDoSchema({ instancePath: '', keyword: 'required', params: { missingProperty: 'a' }, message: 'y' }).code,
      'required',
    );
  });

  void it('sem keyword, o código é `schema` — e nunca `undefined` no corpo da resposta', () => {
    assert.equal(campoDoSchema({ instancePath: '/notes' }).code, 'schema');
  });

  void it('o valor recebido NUNCA sai: só o nome do campo e a regra violada', () => {
    const senha = 'CorrespondenciaSecreta#2026';
    const campo = campoDoSchema({
      instancePath: '/new_password',
      keyword: 'minLength',
      message: 'must NOT have fewer than 12 characters',
      params: { limit: 12, data: senha },
    });
    assert.equal(campo.field, 'new_password');
    assert.equal(
      JSON.stringify(campo).includes(senha),
      false,
      'REPROVA: o valor reprovado entrou no corpo do 400. Parâmetro pode ser código de tag (credencial ao portador) e corpo pode ser senha.',
    );
  });
});

void describe('camposDoSchema: o lote', () => {
  void it('lote vazio é indistinguível de lote inexistente, e os dois dão `undefined`', () => {
    assert.equal(camposDoSchema([]), undefined);
    assert.equal(camposDoSchema(undefined), undefined);
    assert.equal(camposDoSchema('nao e lista'), undefined);
  });

  void it('cada achado do lote vira um campo, na ordem', () => {
    const campos = camposDoSchema([
      { instancePath: '/delivery_address', keyword: 'required', params: { missingProperty: 'recipient_name' } },
      { instancePath: '/delivery_address/postal_code', keyword: 'pattern' },
    ]);
    assert.deepEqual(
      campos?.map((c) => c.field),
      ['delivery_address.recipient_name', 'delivery_address.postal_code'],
    );
  });

  void it('elemento nulo no lote não derruba a tradução', () => {
    assert.deepEqual(camposDoSchema([null])?.map((c) => c.field), ['']);
  });
});

void describe('o formato do achado é o que o Ajv realmente entrega', () => {
  async function recusar(
    payload: Record<string, unknown>,
  ): Promise<{ field?: string; code?: string }[]> {
    const contrato = carregarContrato(resolve(process.cwd(), 'api/openapi.yaml'));
    const app = criarServidor({
      problemBaseUrl: 'https://api.bichu.test/problems' as AbsoluteUrl,
      isProduction: false,
      teto: tetoDeTeste(),
    });
    registrarRota(
      app,
      rotaDePedidoDePlaquinha,
      {
        schema: { body: contrato.requestBodySchema(rotaDePedidoDePlaquinha.operationId) },
        resolvedores: { account: () => 'uma-conta' },
      },
      (_requisicao, resposta) => Promise.resolve(resposta.status(200).send({})),
    );
    try {
      const resposta = await app.inject({
        method: 'POST' as const,
        url: `/pets/${UM_PET}/tag-requests`,
        payload,
      });
      assert.equal(resposta.statusCode, 400, resposta.body);
      const corpo = JSON.parse(resposta.body) as {
        readonly errors?: { field?: string; code?: string }[];
      };
      return corpo.errors ?? [];
    } finally {
      await app.close();
    }
  }

  void it('required ANINHADO chega ao corpo do 400 com o campo que faltou', async () => {
    const erros = await recusar({ delivery_address: { ...ENDERECO, recipient_name: undefined } });
    assert.deepEqual(
      erros.map((e) => `${String(e.field)}:${String(e.code)}`),
      ['delivery_address.recipient_name:required'],
      'o contêiner sozinho não diz qual dos oito campos do endereço reclamar',
    );
  });

  void it('pattern ANINHADO chega com o caminho do campo', async () => {
    const erros = await recusar({
      delivery_address: { ...ENDERECO, postal_code: '01311-000' },
    });
    assert.deepEqual(
      erros.map((e) => `${String(e.field)}:${String(e.code)}`),
      ['delivery_address.postal_code:pattern'],
    );
  });

  void it('required na RAIZ continua nomeando o campo da raiz', async () => {
    const erros = await recusar({});
    assert.deepEqual(
      erros.map((e) => `${String(e.field)}:${String(e.code)}`),
      ['delivery_address:required'],
    );
  });
});
