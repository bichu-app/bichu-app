/**
 * Isca do `useDefaults`: o `default` do contrato NAO chega ao manipulador.
 *
 * Ate 18/10/2026 o Fastify montava o Ajv com o padrao dele, `useDefaults:
 * true`, e o Ajv ESCREVIA no que chegou -- corpo, query e parametro -- o
 * `default` de todo campo que faltou. Numa criacao isso passava por
 * inofensivo. Numa EDICAO PARCIAL era o contrario do que a operacao promete, e
 * custou tres defeitos silenciosos medidos no mesmo dia, o pior deles
 * devolvendo a lista publica um caso de pet perdido que o tutor tinha tirado
 * dela.
 *
 * `criarServidor` passa `ajv: { customOptions: { useDefaults: false } }`, e
 * este arquivo e quem cobra: ele mede pelo FIO, com a rota de verdade e o
 * schema de verdade do contrato, o que o manipulador recebe.
 *
 * Os dois ultimos casos existem para o conserto nao ter trocado um defeito por
 * outro: `customOptions` SOMA-SE as opcoes do Fastify em vez de substitui-las,
 * entao `coerceTypes` e `removeAdditional` tem de continuar como estavam. Se
 * um dia alguem trocar o objeto inteiro em vez de acrescentar uma chave, sao
 * eles que acusam.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';

import { carregarContrato } from './contract.js';
import { criarServidor } from './server.js';
import { registrarRota } from './registrar-rota.js';
import { tetoDeTeste } from './teto-de-teste.js';
import { rotaDaEdicaoDoEncontro, rotaDaAgenda } from '../../modules/network/adapters/http/network-routes.js';
import type { AbsoluteUrl } from '../types/brands.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const CAMINHO_DA_SPEC = resolve(process.cwd(), 'api/openapi.yaml');

function servidor(): ReturnType<typeof criarServidor> {
  return criarServidor({ problemBaseUrl: BASE_DE_PROBLEMA, isProduction: false, teto: tetoDeTeste() });
}

/**
 * Manda `payload` no corpo do `PATCH` do encontro e devolve o que o
 * manipulador VIU -- sem nenhum `semPadroes` pelo caminho: o schema e o do
 * contrato, cru.
 */
async function corpoVistoPeloManipulador(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const contrato = carregarContrato(CAMINHO_DA_SPEC);
  const app = servidor();
  let visto: Record<string, unknown> = {};
  registrarRota(
    app,
    rotaDaEdicaoDoEncontro,
    {
      schema: { body: contrato.requestBodySchema(rotaDaEdicaoDoEncontro.operationId) },
      resolvedores: { account: () => 'uma-conta' },
    },
    (request, reply) => {
      visto = request.body as Record<string, unknown>;
      return Promise.resolve(reply.status(200).send({}));
    },
  );
  try {
    const resposta = await app.inject({
      method: 'PATCH' as const,
      url: '/network/events/um-encontro',
      headers: { authorization: 'Bearer x', 'if-match': '"1"' },
      payload,
    });
    assert.equal(resposta.statusCode, 200, resposta.body);
    return visto;
  } finally {
    await app.close();
  }
}

void describe('o default do contrato nao e injetado no que chega', () => {
  void it('o PATCH do encontro chega com os campos que vieram, e so com eles', async () => {
    const visto = await corpoVistoPeloManipulador({ title: 'Encontro novo', notes: 'levar agua' });

    assert.deepEqual(
      Object.keys(visto).sort(),
      ['notes', 'title'],
      'o Ajv acrescentou campo que ninguem mandou; `useDefaults` voltou a `true`',
    );
    // Os dois nominalmente, porque sao os que foram MEDIDOS em 17/10: o
    // contrato ainda alcanca o `default` deles (ele esta certo no schema da
    // criacao), e o que mudou e o Ajv nao os escrever mais no PATCH.
    assert.equal(visto['accepted_sizes'], undefined);
    assert.equal(visto['dog_age'], undefined);
  });

  void it('campo mandado de verdade continua chegando, inclusive igual ao default', async () => {
    const visto = await corpoVistoPeloManipulador({ title: 'Encontro novo', dog_age: 'any' });
    assert.deepEqual(visto, { title: 'Encontro novo', dog_age: 'any' });
  });

  void it('a query da agenda chega sem `page`, `limit` e `when`: quem supre o padrao e o caso de uso', async () => {
    const contrato = carregarContrato(CAMINHO_DA_SPEC);
    const app = servidor();
    let visto: Record<string, unknown> = {};
    registrarRota(
      app,
      rotaDaAgenda,
      { schema: { querystring: contrato.parameterSchemas(rotaDaAgenda.operationId).querystring } },
      (request, reply) => {
        visto = request.query as Record<string, unknown>;
        return Promise.resolve(reply.status(200).send({}));
      },
    );
    try {
      const resposta = await app.inject({ method: 'GET' as const, url: '/network/events?city=Curitiba' });
      assert.equal(resposta.statusCode, 200, resposta.body);
      assert.deepEqual(Object.keys(visto), ['city'], 'o Ajv acrescentou parametro que ninguem mandou');
    } finally {
      await app.close();
    }
  });

  void it('`coerceTypes` continua ligado: `limit=5` na query chega como numero', async () => {
    const contrato = carregarContrato(CAMINHO_DA_SPEC);
    const app = servidor();
    let visto: Record<string, unknown> = {};
    registrarRota(
      app,
      rotaDaAgenda,
      { schema: { querystring: contrato.parameterSchemas(rotaDaAgenda.operationId).querystring } },
      (request, reply) => {
        visto = request.query as Record<string, unknown>;
        return Promise.resolve(reply.status(200).send({}));
      },
    );
    try {
      await app.inject({ method: 'GET' as const, url: '/network/events?limit=5' });
      assert.equal(visto['limit'], 5, 'a query veio como texto: `customOptions` substituiu as opcoes do Fastify');
    } finally {
      await app.close();
    }
  });
});
