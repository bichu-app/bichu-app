/**
 * O guarda de corpo fechado: campo que o contrato não aceita é RECUSADO, e não
 * apagado em silêncio.
 *
 * ## Por que este arquivo existe
 *
 * `corpo-fechado.ts` não tinha caso nenhum. Ele é a única coisa que impede uma
 * escrita de responder **2xx a um campo que não foi gravado** — o Ajv do
 * Fastify roda com `removeAdditional` ativo, então sem o guarda o campo
 * desconhecido desaparece antes de o manipulador existir e quem chamou recebe
 * um recibo de sucesso por um dado que o banco nunca viu.
 *
 * ## O DEFEITO QUE ESTES CASOS PRENDEM (medido em 18/10/2026)
 *
 * O guarda era **raso**. Ele montava os nomes aceitos com
 * `Object.keys(schema.properties)` e varria `Object.keys(corpo)`, só isso:
 * objeto aninhado passava inteiro, mesmo fechado no contrato. Medido nas duas
 * rotas que o instalam, com o corpo real delas:
 *
 * - `suggestDirectoryEntry` com
 *   `public_contact: { kind: 'phone', value, label: 'comercial' }` → **201**.
 *   `DirectorySuggestionContact` declara `additionalProperties: false`;
 * - `requestCollarTag` com `delivery_address: { …, cpf: '…' }` → **200**.
 *   `DeliveryAddress` declara `additionalProperties: false`, e um CPF é dado
 *   pessoal: recibo de sucesso por um dado descartado é o pior desfecho da
 *   rota.
 *
 * ## O QUE DESLIGAR PARA VER CADA CASO REPROVAR
 *
 * Em `desconhecidosDe`, dentro de `corpo-fechado.ts`:
 *
 * - **a descida:** apague o último laço (`for (const [nome, subSchema] of
 *   Object.entries(propriedades))`). Reprovam `campo desconhecido DENTRO de
 *   objeto fechado`, `o caminho inteiro sai no field` e
 *   `dentro de item de LISTA`. São esses três que o defeito real produzia;
 * - **o prefixo:** passe `prefixo` sempre como `''` na chamada recursiva.
 *   Reprova `o caminho inteiro sai no field`;
 * - **a descida em lista:** apague o ramo `Array.isArray(corpo)`. Reprova
 *   `dentro de item de LISTA`;
 * - **o respeito ao objeto ABERTO:** troque a condição
 *   `schema['additionalProperties'] === false` por `true`. Reprova
 *   `objeto aberto no contrato NÃO vira recusa`, que é o caso que impede o
 *   guarda de inventar regra que o contrato não tem;
 * - **a recusa em si:** devolva `[]` no fim de `desconhecidosDe`. Reprovam
 *   todos os casos de recusa, e passa a reprovar também
 *   `o corpo válido inteiro passa` só se alguém trocar o 400 por 200 — que é a
 *   outra ponta;
 * - **a guarda de subida:** instale o guarda sobre um schema sem
 *   `additionalProperties: false`. Reprova
 *   `guarda sobre corpo ABERTO derruba a subida`.
 *
 * Nenhum caso aqui monta schema de mentira para o caminho principal: os quatro
 * primeiros grupos usam a rota real `requestCollarTag` com o corpo que
 * `api/openapi.yaml` declara, pelo fio, como em `o-400-nomeia-o-campo.test.ts`.
 * Os casos de forma (lista, objeto aberto, subida) usam schema próprio, porque
 * o contrato hoje não tem uma lista de objetos fechados numa rota que instale o
 * guarda — e inventar uma rota no contrato para poder testar seria mudar o
 * contrato para caber no teste.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';

import { recusarCampoDesconhecido } from './corpo-fechado.js';
import { carregarContrato } from './contract.js';
import { criarServidor } from './server.js';
import { registrarRota } from './registrar-rota.js';
import { tetoDeTeste } from './teto-de-teste.js';
import { rotaDePedidoDePlaquinha } from '../../modules/tags/adapters/http/pedido-de-plaquinha-routes.js';
import type { AbsoluteUrl } from '../types/brands.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const CAMINHO_DA_SPEC = resolve(process.cwd(), 'api/openapi.yaml');
const UM_PET = '018f3a2b-0000-7000-8000-0000000000bb';

/** O endereço válido do contrato. Cada caso estraga UM campo dele. */
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

interface Resposta {
  readonly statusCode: number;
  readonly errors: { field?: string; code?: string }[];
}

/** A rota de verdade, com o corpo de verdade e o guarda que ela instala. */
async function enviar(payload: Record<string, unknown>): Promise<Resposta> {
  const contrato = carregarContrato(CAMINHO_DA_SPEC);
  const corpo = contrato.requestBodySchema(rotaDePedidoDePlaquinha.operationId);
  assert.ok(corpo !== undefined, 'o contrato deixou de declarar corpo para requestCollarTag');
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(),
  });
  registrarRota(
    app,
    rotaDePedidoDePlaquinha,
    {
      schema: { body: corpo },
      resolvedores: { account: () => 'uma-conta' },
      preValidation: [recusarCampoDesconhecido(corpo, rotaDePedidoDePlaquinha.operationId)],
    },
    (_requisicao, resposta) => Promise.resolve(resposta.status(200).send({ ok: true })),
  );
  try {
    const resposta = await app.inject({
      method: 'POST' as const,
      url: `/pets/${UM_PET}/tag-requests`,
      payload,
    });
    const lido = JSON.parse(resposta.body) as { readonly errors?: { field?: string; code?: string }[] };
    return { statusCode: resposta.statusCode, errors: lido.errors ?? [] };
  } finally {
    await app.close();
  }
}

const comoTexto = (erros: { field?: string; code?: string }[]): string[] =>
  erros.map((e) => `${String(e.field)}:${String(e.code)}`);

void describe('o guarda desce no corpo inteiro', () => {
  void it('campo desconhecido no nível de cima é recusado', async () => {
    const r = await enviar({ delivery_address: ENDERECO, cupom: 'GRATIS' });
    assert.equal(r.statusCode, 400);
    assert.deepEqual(comoTexto(r.errors), ['cupom:unknown_field']);
  });

  void it('campo desconhecido DENTRO de objeto fechado é recusado', async () => {
    const r = await enviar({ delivery_address: { ...ENDERECO, cpf: '00000000000' } });
    assert.equal(
      r.statusCode,
      400,
      'REPROVA: a rota respondeu sucesso para um CPF que ninguém gravou. `DeliveryAddress` é fechado no contrato.',
    );
    assert.deepEqual(comoTexto(r.errors), ['delivery_address.cpf:unknown_field']);
  });

  void it('o caminho inteiro sai no `field`, e não só o nome do campo', async () => {
    const r = await enviar({ delivery_address: { ...ENDERECO, city_name: 'X' } });
    assert.deepEqual(
      comoTexto(r.errors),
      ['delivery_address.city_name:unknown_field'],
      'REPROVA: sem o caminho, dois campos de nomes iguais em objetos diferentes produzem o mesmo achado e a tela marca o errado.',
    );
  });

  void it('o VALOR do campo recusado nunca sai na resposta', async () => {
    const segredo = 'DocumentoDoDestinatario#2026';
    const r = await enviar({ delivery_address: { ...ENDERECO, documento: segredo } });
    assert.equal(r.statusCode, 400);
    assert.equal(
      JSON.stringify(r.errors).includes(segredo),
      false,
      'REPROVA: o valor recusado entrou no corpo do 400. Sai o nome do campo, nunca o conteúdo.',
    );
  });

  void it('vários desconhecidos, em níveis diferentes, saem todos de uma vez', async () => {
    const r = await enviar({
      delivery_address: { ...ENDERECO, cpf: '0', rg: '1' },
      cupom: 'GRATIS',
    });
    assert.deepEqual(comoTexto(r.errors).sort(), [
      'cupom:unknown_field',
      'delivery_address.cpf:unknown_field',
      'delivery_address.rg:unknown_field',
    ]);
  });

  void it('o corpo válido inteiro passa, e o guarda não atrapalha o caminho principal', async () => {
    const r = await enviar({ delivery_address: ENDERECO, notes: 'portaria 24h' });
    assert.equal(r.statusCode, 200, `o corpo válido foi recusado: ${JSON.stringify(r.errors)}`);
    assert.deepEqual(r.errors, []);
  });

  void it('`complement` ausente não é campo desconhecido: opcional continua opcional', async () => {
    const semComplemento = { ...ENDERECO };
    const r = await enviar({ delivery_address: semComplemento });
    assert.equal(r.statusCode, 200, `o endereço sem complemento foi recusado: ${JSON.stringify(r.errors)}`);
  });
});

void describe('a forma do guarda', () => {
  /** Um schema fechado com lista de objetos fechados, que o contrato hoje não tem. */
  const COM_LISTA: Record<string, unknown> = {
    type: 'object',
    additionalProperties: false,
    properties: {
      itens: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: { nome: { type: 'string' } },
        },
      },
      aberto: {
        type: 'object',
        // SEM `additionalProperties: false`: aberto de propósito.
        properties: { conhecido: { type: 'string' } },
      },
    },
  };

  function achados(corpo: unknown): string[] {
    const capturados: { field?: string; code?: string }[] = [];
    const guarda = recusarCampoDesconhecido(COM_LISTA, 'operacaoDeTeste');
    // O tipo do gancho do Fastify declara `this: FastifyInstance`. Este guarda
    // nao usa `this` (ver `corpo-fechado.ts`), e `Reflect.apply` entrega o
    // contexto sem precisar afirmar um servidor que o caso nao tem.
    Reflect.apply(guarda, undefined, [
      { body: corpo } as never,
      {} as never,
      (erro?: Error) => {
        const problema = erro as unknown as { errors?: { field?: string; code?: string }[] } | undefined;
        capturados.push(...(problema?.errors ?? []));
      },
    ]);
    return comoTexto(capturados);
  }

  void it('dentro de item de LISTA, com o índice no caminho', () => {
    assert.deepEqual(achados({ itens: [{ nome: 'a' }, { nome: 'b', extra: 1 }] }), [
      'itens.1.extra:unknown_field',
    ]);
  });

  void it('objeto aberto no contrato NÃO vira recusa', () => {
    assert.deepEqual(
      achados({ aberto: { conhecido: 'x', qualquer: 'y' } }),
      [],
      'REPROVA: o guarda recusou campo em objeto que o contrato deixou aberto, ou seja inventou regra que o contrato não tem.',
    );
  });

  void it('corpo que não é objeto não é assunto do guarda, e ele não derruba', () => {
    assert.deepEqual(achados(undefined), []);
    assert.deepEqual(achados('texto'), []);
  });

  void it('guarda sobre corpo ABERTO derruba a subida, nomeando a operação', () => {
    assert.throws(
      () => recusarCampoDesconhecido({ type: 'object', properties: { a: {} } }, 'operacaoAberta'),
      /operacaoAberta/,
    );
  });

  void it('guarda sobre schema SEM `properties` derruba a subida', () => {
    assert.throws(
      () => recusarCampoDesconhecido({ type: 'object', additionalProperties: false }, 'operacaoVazia'),
      /operacaoVazia/,
    );
  });
});
