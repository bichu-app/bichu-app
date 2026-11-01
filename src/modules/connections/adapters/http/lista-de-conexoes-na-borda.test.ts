import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import { vigiarParametrosDasRotas } from '../../../../shared/http/validacao-de-parametros.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { AbsoluteUrl, Instant, UserId } from '../../../../shared/types/brands.js';
import { ConexaoEntrePessoas } from '../../application/conexao-entre-pessoas.js';
import {
  conexoesEmMemoria,
  type PessoaDeTeste,
} from '../persistence/conexoes-em-memoria-de-teste.js';
import { comoRespostaDaConexao, registrarRotasDeConexao } from './connection-routes.js';

const CAMINHO_DA_SPEC = resolve(process.cwd(), 'api/openapi.yaml');
const PREFIXO = '/v1';
const BASE_DE_PROBLEMAS = 'https://problemas.invalid/problems/' as AbsoluteUrl;
const MIDIA = 'https://midia.exemplo.test' as AbsoluteUrl;

const ANA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const BIA = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
const AGORA = 1_800_000_000_000 as Instant;

const PESSOAS: readonly PessoaDeTeste[] = [
  { id: ANA, apelido: 'ana-tutora', nomeDeExibicao: 'Ana', habilitada: true, pets: 1 },
  {
    id: BIA,
    apelido: 'bia-vet',
    nomeDeExibicao: 'Bia',
    habilitada: true,
    pets: 2,
    chaveDaFoto: 'u/ab/cdef/thumb.jpg',
  },
];

function levanta(): never {
  throw new Error('a lista NAO escreve');
}

async function bancada(): Promise<{ app: RegistradorDeRotas; autenticacoes: string[] }> {
  const contrato = carregarContrato(CAMINHO_DA_SPEC);
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMAS,
    isProduction: false,
    teto: tetoDeTeste(),
  });
  vigiarParametrosDasRotas(app, contrato, PREFIXO);

  const banca = conexoesEmMemoria(PESSOAS, AGORA);
  banca.semear({ pedinte: ANA, destinatario: BIA, estado: 'accepted' });
  const autenticacoes: string[] = [];

  await app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDeConexao(escopo, {
        conexoes: new ConexaoEntrePessoas({
          conexoes: banca.repositorio,
          convites: { resolver: () => Promise.resolve(undefined) },
          apelidos: { resolver: () => Promise.resolve(undefined) },
          bloqueios: { existeBloqueioEntre: () => Promise.resolve(false) },
          trilha: { record: () => Promise.resolve() },
          ids: {
            uuidv7: levanta,
            random128: levanta,
            random80: levanta,
            opaqueToken: levanta,
          },
          clock: { now: () => AGORA },
        }),
        autenticador: {
          autenticar: (token: string) => {
            autenticacoes.push(token);
            return Promise.resolve({ userId: ANA });
          },
        },
        contrato,
        baseDeMidia: MIDIA,
      });
      pronto();
    },
    { prefix: PREFIXO },
  );
  await app.ready();
  return { app, autenticacoes };
}

interface CorpoDaLista {
  readonly items: readonly Record<string, unknown>[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

void describe('`GET /v1/connections`: a lista das PRÓPRIAS conexões na borda', () => {
  void it('responde 200 com a pagina, e a pessoa tem os CINCO campos da busca', async () => {
    const { app } = await bancada();
    const resposta = await app.inject({
      method: 'GET',
      url: '/v1/connections',
      headers: { authorization: 'Bearer t' },
    });
    assert.equal(resposta.statusCode, 200);
    const corpo = JSON.parse(resposta.body) as CorpoDaLista;
    assert.deepEqual(Object.keys(corpo).sort(), ['items', 'limit', 'page', 'total']);
    assert.equal(corpo.total, 1);
    assert.deepEqual(Object.keys(corpo.items[0] ?? {}).sort(), [
      'connections_count',
      'display_name',
      'handle',
      'pets_count',
      'photo_icon_url',
    ]);
    assert.equal(corpo.items[0]?.['handle'], 'bia-vet');
  });

  void it('ISCA: o corpo de cada pessoa e EXATAMENTE os cinco de `PersonSearchResult`', () => {
    const corpo = comoRespostaDaConexao(
      {
        apelido: 'bia-vet',
        nomeDeExibicao: 'Bia',
        petsCount: 2,
        connectionsCount: 7,
        photoKey: 'u/ab/cdef/thumb.jpg',
      },
      MIDIA,
    );
    assert.deepEqual(Object.keys(corpo).sort(), [
      'connections_count',
      'display_name',
      'handle',
      'pets_count',
      'photo_icon_url',
    ]);
    assert.equal(corpo['photo_icon_url'], 'https://midia.exemplo.test/u/ab/cdef/thumb.jpg');
  });

  void it('sem foto pronta a chave vem com nulo EXPLICITO, e nunca ausente', () => {
    const corpo = comoRespostaDaConexao(
      {
        apelido: 'ana-tutora',
        nomeDeExibicao: 'Ana',
        petsCount: 0,
        connectionsCount: 0,
        photoKey: null,
      },
      MIDIA,
    );
    assert.equal(corpo['photo_icon_url'], null);
    assert.ok(
      Object.prototype.hasOwnProperty.call(corpo, 'photo_icon_url'),
      'chave que aparece e desaparece faria o cliente distinguir ausencia de nulo',
    );
  });

  void it('ISCA: a varredura de chaves REPROVA um campo acrescentado depois', () => {
    const comVazamento = {
      ...comoRespostaDaConexao(
        {
          apelido: 'bia-vet',
          nomeDeExibicao: 'Bia',
          petsCount: 2,
          connectionsCount: 7,
          photoKey: null,
        },
        MIDIA,
      ),
      public_ref: 'AAAAAAAAAAAAAAAAAAAAAA',
    };
    assert.notDeepEqual(
      Object.keys(comVazamento).sort(),
      ['connections_count', 'display_name', 'handle', 'pets_count', 'photo_icon_url'],
      'a isca passou: a varredura nao enxerga uma chave nova na projecao.',
    );
  });

  void it('sem conta e 401, e o token nunca e consultado', async () => {
    const { app, autenticacoes } = await bancada();
    const resposta = await app.inject({ method: 'GET', url: '/v1/connections' });
    assert.equal(resposta.statusCode, 401);
    assert.deepEqual(autenticacoes, [], 'o 401 vem ANTES de qualquer consulta');
  });

  void it('ISCA DE VAZAMENTO: nao existe endereco para a lista de OUTRA pessoa', async () => {
    const { app } = await bancada();
    const cabecalhos = { authorization: 'Bearer t' };

    const CAMINHO_INVENTADO = '/v1/caminho-que-nunca-existiu';
    const problemaDe = (corpo: string): Record<string, unknown> => {
      const problema = JSON.parse(corpo) as Record<string, unknown>;
      delete problema['correlation_id'];
      delete problema['instance'];
      return problema;
    };

    const inexistente = await app.inject({
      method: 'GET',
      url: CAMINHO_INVENTADO,
      headers: cabecalhos,
    });
    assert.equal(inexistente.statusCode, 404);

    for (const tentativa of [
      '/v1/connections/bia-vet',
      '/v1/connections/bia-vet/connections',
      '/v1/people/bia-vet/connections',
      '/v1/connections/of/bia-vet',
    ]) {
      const resposta = await app.inject({ method: 'GET', url: tentativa, headers: cabecalhos });
      assert.equal(
        resposta.statusCode,
        404,
        `\`${tentativa}\` nao respondeu 404: a lista de TERCEIRO continua "nunca", e ela ` +
          'nao pode ser nem 403 (que confirmaria a existencia) nem 200.',
      );
      assert.notEqual(resposta.statusCode, 403, 'ADR-0021: nunca 403');
      assert.deepEqual(
        problemaDe(resposta.body),
        problemaDe(inexistente.body),
        `o problema de \`${tentativa}\` difere do de um caminho inventado -- e a diferenca ` +
          'conta que aquele endereco significa algo.',
      );
      assert.equal((JSON.parse(resposta.body) as { instance?: string }).instance, tentativa);
    }

    const outraVez = await app.inject({
      method: 'GET',
      url: CAMINHO_INVENTADO,
      headers: cabecalhos,
    });
    assert.notEqual(
      outraVez.body,
      inexistente.body,
      'a isca passou: duas chamadas ao mesmo caminho dao o corpo identico, entao a ' +
        'comparacao byte a byte era possivel e esta sendo evitada sem motivo.',
    );
    assert.deepEqual(problemaDe(outraVez.body), problemaDe(inexistente.body));
  });

  void it('a lista nao aceita `handle` nem `q`: nao ha filtro de pessoa', async () => {
    const { app } = await bancada();
    const resposta = await app.inject({
      method: 'GET',
      url: '/v1/connections?handle=bia-vet&q=bia',
      headers: { authorization: 'Bearer t' },
    });
    assert.equal(resposta.statusCode, 200);
    const corpo = JSON.parse(resposta.body) as CorpoDaLista;
    assert.equal(corpo.total, 1);
  });

  void it('`page` e `limit` chegam na resposta, e o teto de 20 e o das irmas', async () => {
    const { app } = await bancada();
    const resposta = await app.inject({
      method: 'GET',
      url: '/v1/connections?page=1&limit=5',
      headers: { authorization: 'Bearer t' },
    });
    assert.equal(resposta.statusCode, 200);
    const corpo = JSON.parse(resposta.body) as CorpoDaLista;
    assert.equal(corpo.page, 1);
    assert.equal(corpo.limit, 5);

    const acimaDoTeto = await app.inject({
      method: 'GET',
      url: '/v1/connections?limit=21',
      headers: { authorization: 'Bearer t' },
    });
    assert.equal(acimaDoTeto.statusCode, 400, '`limit` acima de 20 e pedido malformado');
  });

  void it('a resposta nao entra em cache compartilhado', async () => {
    const { app } = await bancada();
    const resposta = await app.inject({
      method: 'GET',
      url: '/v1/connections',
      headers: { authorization: 'Bearer t' },
    });
    assert.equal(resposta.headers['cache-control'], 'private, no-store');
  });
});
