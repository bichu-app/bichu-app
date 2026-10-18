/**
 * `campoDoErro` e `camposDoSchema`: o 400 de validação diz **qual** campo.
 *
 * ## Por que este arquivo existe
 *
 * `erros-de-schema.ts` é a única tradução entre o achado do Ajv e o
 * `errors[].field` do `Problem`, e é dela que toda tela de formulário dos
 * quatro clientes tira "falta o CEP" em vez de "não foi possível".
 *
 * Ela NÃO estava descoberta, e dizer que estava seria o erro simétrico:
 * `o-400-nomeia-o-campo.test.ts` já a exercita por quatro casos, pelo fio, com
 * a rota real `createPetPhotoUploadIntent`. O que faltava era uma dimensão
 * específica — **aninhamento**. O corpo daquela rota é PLANO
 * (`pet_id`, `content_type`, `byte_size`), então todos os seus `required`
 * nascem na raiz, onde o `instancePath` do Ajv vem vazio. Nenhum caso da
 * árvore exercitava um `required` dentro de um objeto, e é só lá que o defeito
 * abaixo aparece. Nenhuma função deste módulo era chamada por nome em
 * `*.test.ts` nenhum, então nenhum caso cobria a tradução em unidade.
 *
 * ## O DEFEITO QUE ESTES CASOS PRENDEM (medido em 18/10/2026)
 *
 * `campoDoErro` **escolhia** entre o caminho da instância e a propriedade
 * nomeada nos `params`, devolvendo o primeiro que existisse:
 *
 * ```ts
 * if (caminho !== '') return caminho;              // <- saía aqui
 * return textoDe(params['missingProperty']) ?? ... // <- nunca chegava
 * ```
 *
 * O cabeçalho do arquivo justificava isso dizendo que, num `required`, "o
 * `instancePath` vem vazio". Isso só vale quando a propriedade que faltou é da
 * **raiz** do corpo. Num objeto aninhado o Ajv reporta o `required` no objeto
 * que perdeu a propriedade: `instancePath` vem `/delivery_address`, não-vazio,
 * e o nome que faltou fica em `params.missingProperty` — que a saída antecipada
 * jogava fora.
 *
 * Consequência medida: `POST /v1/pets/{petId}/tag-requests` sem
 * `recipient_name` respondia
 * `errors: [{ field: 'delivery_address', code: 'required' }]`, apontando o
 * CONTÊINER. O contrato promete o contrário com estas palavras: "Campo de
 * endereco faltando ou malformado responde `400` apontando **qual** campo,
 * pelo `errors[].field`" (`api/openapi.yaml`, `requestCollarTag`). O
 * formulário do endereço tem oito campos obrigatórios e recebia um só nome
 * para todos eles.
 *
 * ## O QUE DESLIGAR PARA VER CADA CASO REPROVAR
 *
 * Em `campoDoErro`, dentro de `erros-de-schema.ts`:
 *
 * - **soma das duas pontas:** troque o fim da função por
 *   `if (caminho !== '') return caminho;` seguido do `?? ''` antigo. Reprova
 *   `required aninhado` e `additionalProperties aninhado` — e são esses dois
 *   que o defeito real produzia;
 * - **a ponta do caminho:** devolva só `propriedade ?? ''`. Reprova
 *   `pattern num campo aninhado` e `pattern na raiz`;
 * - **a ponta da propriedade:** devolva só `caminho`. Reprova
 *   `required na raiz`, `required aninhado` e `additionalProperties aninhado`;
 * - **a tradução de `/` para `.`:** tire o segundo `replace`. Reprova
 *   `pattern num campo aninhado` e `item de lista`;
 * - **o `code`:** fixe `code: 'schema'` em `campoDoSchema`. Reprova
 *   `o código vem do keyword do Ajv`;
 * - **o silêncio sobre o valor:** acrescente o `data` do achado à `message`.
 *   Reprova `o valor recebido NUNCA sai`;
 * - **o `undefined` de lote vazio:** devolva `[]` em `camposDoSchema`.
 *   Reprova `lote vazio é indistinguível de lote inexistente`.
 *
 * Nenhum caso aqui afirma o próprio arranjo: todos partem da forma que o Ajv
 * produz de verdade, e a forma é conferida por execução em
 * `o formato do achado é o que o Ajv realmente entrega`, que valida com o Ajv
 * do Fastify e lê `erro.validation` em vez de montar o objeto à mão. Sem esse
 * caso, os outros estariam afirmando uma suposição sobre a biblioteca.
 */
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

/** O endereço válido do contrato. Cada caso abaixo estraga UM campo dele. */
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
      // O Ajv carrega o dado reprovado em alguns achados; nada dele pode vazar.
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

/**
 * A ponte com a realidade. Os casos acima montam o achado do Ajv à mão; este
 * confere, POR EXECUÇÃO e pelo fio, que a forma montada é a que o Ajv do
 * Fastify produz — `instancePath` não-vazio junto de `params.missingProperty`
 * num `required` **aninhado**. Sem ele, todo o resto deste arquivo seria uma
 * afirmação sobre a biblioteca, e o dia em que o Ajv mudasse a forma os casos
 * continuariam verdes medindo um mundo que não existe mais.
 *
 * A rota é a de verdade (`requestCollarTag`) com o corpo do contrato de
 * verdade, no mesmo arranjo de `o-400-nomeia-o-campo.test.ts`. Ela foi
 * escolhida por ser a única com objeto aninhado obrigatório
 * (`delivery_address`, oito campos), que é a dimensão que faltava.
 */
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

  /*
   * NÃO existe caso de `additionalProperties` aninhado POR AQUI, e a ausência é
   * deliberada. Nesta configuração o Ajv do Fastify roda com `removeAdditional`
   * ativo: campo desconhecido é APAGADO antes de virar achado, então ele nunca
   * chega a `erros-de-schema.ts` e um caso aqui estaria medindo a camada
   * errada. Quem recusa campo desconhecido é o guarda de
   * `corpo-fechado.ts`, com `code: 'unknown_field'`, e é lá que o caminho
   * aninhado é afirmado (`corpo-fechado.test.ts`). O mapeamento em si — um
   * achado de `additionalProperties` virar `delivery_address.cpf` — fica
   * provado em unidade, no caso `additionalProperties aninhado` acima, e é ele
   * que continua valendo no dia em que `removeAdditional: false` entrar.
   */
  void it('required na RAIZ continua nomeando o campo da raiz', async () => {
    const erros = await recusar({});
    assert.deepEqual(
      erros.map((e) => `${String(e.field)}:${String(e.code)}`),
      ['delivery_address:required'],
    );
  });
});
