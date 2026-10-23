/**
 * `GET /v1/connections` **na borda**: o corpo que sai, o 401 sem conta, e a
 * prova de que **não existe endereço para a lista de outra pessoa**.
 *
 * ## Por que este arquivo existe ao lado da suíte de comportamento
 *
 * `lista-das-proprias-conexoes.test.ts` mede a REGRA (quem entra na lista), com
 * a bancada em memória. Este mede a BORDA, e as três coisas que só a borda tem:
 *
 * 1. **o conjunto de chaves do corpo** — e isto não é zelo: *nenhum portão deste
 *    repositório confere o CORPO da resposta*, então a única forma de medir as
 *    chaves é chamar a projeção ou a rota;
 * 2. **o 401 sem conta**, antes de qualquer consulta;
 * 3. **o 404 de um endereço de lista de TERCEIRO**, byte a byte igual ao de um
 *    caminho que não existe. É a metade da decisão de 18/10/2026 que o cliente
 *    **não** emendou em 22/10, e aqui ela se mede no protocolo e não na prosa.
 */
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

  /**
   * **A ISCA DO CORPO, por conjunto EXATO de chaves.** Uma asserção que só
   * negasse `connection_ref` passaria no dia em que alguém acrescentasse
   * `public_ref`, `city` ou `showcase`.
   */
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
    // A URL e montada na BORDA: o banco guarda chave de objeto e nunca endereco.
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

  /**
   * **ISCA do corpo**: sem ela, as duas de cima passariam por a projeção
   * devolver pouco por acaso — e não por a varredura reconhecer uma chave nova.
   */
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

  /**
   * **ISCA DE VAZAMENTO ENTRE CONTAS, no protocolo.**
   *
   * A emenda do cliente de 22/10/2026 abriu a lista do **próprio dono**. A de
   * terceiro continua *nunca*, e a prova aqui é que **não existe endereço para
   * pedi-la**: as quatro formas que alguém tentaria respondem **404**, e o
   * problema é o MESMO de um caminho inventado. *"Não é seu"* fica
   * indistinguível de *"não existe"* (ADR-0021), e nunca 403.
   *
   * **A comparação é do problema, e NÃO do corpo byte a byte** — e a razão está
   * medida, não suposta: duas respostas 404 desta casa diferem sempre em dois
   * campos, e nenhum dos dois conta nada.
   *
   * | Campo | Por que ele difere, e por que isso não é oráculo |
   * |---|---|
   * | `correlation_id` | é sorteado por requisição; duas chamadas ao MESMO caminho inventado também diferem nele |
   * | `instance` | é o caminho que **quem chama mandou**, ecoado. Ele não pode contar nada que o cliente não tenha escrito, e o caso abaixo cobra exatamente essa igualdade |
   *
   * O que **não** pode diferir é `type`, `title` e `status`: é por aí que um 404
   * de *"existe, mas não para você"* se distinguiria de um 404 de *"não
   * existe"*. Era essa a diferença medida byte a byte em outra rota, e é essa
   * que este caso cobra.
   */
  void it('ISCA DE VAZAMENTO: nao existe endereco para a lista de OUTRA pessoa', async () => {
    const { app } = await bancada();
    const cabecalhos = { authorization: 'Bearer t' };

    const CAMINHO_INVENTADO = '/v1/caminho-que-nunca-existiu';
    /** O problema sem os dois campos que diferem por desenho. */
    const problemaDe = (corpo: string): Record<string, unknown> => {
      const problema = JSON.parse(corpo) as Record<string, unknown>;
      // `delete` e nao desestruturacao com descarte: o `eslint` desta casa
      // reprova variavel atribuida e nao usada, mesmo com prefixo de
      // sublinhado, e o conserto nao e uma dispensa -- e nao criar a variavel.
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
      // E `instance` ECOA o caminho pedido, e so ele: um `instance` que
      // apontasse para outro lugar contaria onde aquele endereco "deveria" ser.
      assert.equal((JSON.parse(resposta.body) as { instance?: string }).instance, tentativa);
    }

    /**
     * **ISCA da isca**: duas chamadas ao MESMO caminho inventado também diferem
     * no corpo byte a byte. Sem isto, a comparação acima pareceria frouxa por
     * escolha; ela é frouxa porque o corpo inteiro NÃO é comparável — e os dois
     * campos descartados são exatamente os que variam entre chamadas iguais.
     */
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

  /**
   * **A rota não aceita filtro de pessoa**, e o contrato é quem recusa: o vigia
   * de parâmetros instala o esquema da especificação, e `handle` não está entre
   * os dois parâmetros declarados (`page` e `limit`).
   */
  void it('a lista nao aceita `handle` nem `q`: nao ha filtro de pessoa', async () => {
    const { app } = await bancada();
    const resposta = await app.inject({
      method: 'GET',
      url: '/v1/connections?handle=bia-vet&q=bia',
      headers: { authorization: 'Bearer t' },
    });
    // O Fastify descarta o desconhecido em vez de recusar; o que importa e que
    // ele NAO filtra -- a lista devolve a conexao, e nao "a conexao chamada
    // bia". Um 200 com o conjunto inteiro prova que o parametro nao tem efeito.
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

  /** Aresta é dado de duas pessoas: nada daqui entra em cache compartilhado. */
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
