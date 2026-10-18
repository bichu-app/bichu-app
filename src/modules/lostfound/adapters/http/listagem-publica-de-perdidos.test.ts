/**
 * `GET /v1/public/lost-pets` (`listPublicLostPets`), pela borda HTTP.
 *
 * Três coisas se provam aqui, e as três eram afirmação sem medida antes deste
 * arquivo — a operação estava no contrato e **não tinha rota**:
 *
 * 1. **A listagem mostra pet perdido de verdade**, com foto, bairro e quando
 *    foi visto, e o cartão carrega o `share_token` como chave. O contrapeso é a
 *    lista vazia: recorte sem resultado responde 200 com `total: 0` e `items:
 *    []`, nunca um erro.
 * 2. **Nenhum UUID interno sai.** O dublê da porta é HOSTIL, pela mesma receita
 *    de `leitura-publica-do-caso.test.ts`: ele devolve o e-mail, o telefone, o
 *    endereço e os UUIDs do tutor, do pet e do caso como propriedades a mais, e
 *    planta os mesmos dados dentro do texto livre. A resposta passa por
 *    `shared/http/vazamento-publico.ts`, que reprova por propriedade não
 *    declarada, nome proibido, valor plantado e **qualquer UUID**. É o cenário
 *    de alguém acrescentar `...linha` à projeção um dia.
 * 3. **A rota é alcançável SEM CONTA.** A operação declara `security: []`, e
 *    este arquivo pede sem cabeçalho `Authorization` nenhum. Um 401 aqui seria
 *    a porta pela qual a vizinhança acha o pet, fechada.
 *
 * O que este arquivo NÃO cobre: a consulta SQL. Com dublê no lugar da porta,
 * uma consulta que juntasse `users` ou que esquecesse `conta_habilitada`
 * passaria aqui. Quem cobre é
 * `adapters/persistence/listagem-publica-de-perdidos-sem-id-interno.test.ts`,
 * que lê o SQL compilado.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { carregarContrato, type Contrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import {
  achadosDeVazamento,
  propriedadesDeclaradas,
  type ValorPlantado,
} from '../../../../shared/http/vazamento-publico.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { vigiarParametrosDasRotas } from '../../../../shared/http/validacao-de-parametros.js';
import type { AbsoluteUrl, Instant } from '../../../../shared/types/brands.js';
import { ListagemPublicaDePerdidosService } from '../../application/listagem-publica-de-perdidos.js';
import type {
  ListagemPublicaDePerdidos,
  PaginaDePerdidos,
  PerdidoPublico,
  RecorteDePerdidos,
} from '../../ports/listagem-publica-de-perdidos.js';
import { registrarRotaDaListagemDePerdidos } from './listagem-publica-de-perdidos-routes.js';

const TUTOR = '018f3a2b-0000-7000-8000-0000000000aa';
const PET_ID = '018f3a2b-0000-7000-8000-0000000000cc';
const CASO_ID = '018f3a2b-0000-7000-8000-0000000000dd';
const TOKEN = 'k3J9-share-token-opaco-0001';

const EMAIL_DO_TUTOR = 'tutor.privado@exemplo.com';
const TELEFONE_DO_TUTOR = '+55 11 98765-4321';
const ENDERECO_DO_TUTOR = 'Rua das Acácias, 120';

const AGORA = 1_792_000_000_000 as Instant;

const PLANTADOS: readonly ValorPlantado[] = [
  { rotulo: 'e-mail do tutor', valor: EMAIL_DO_TUTOR },
  { rotulo: 'telefone do tutor', valor: TELEFONE_DO_TUTOR, porDigitos: true },
  { rotulo: 'endereço do tutor', valor: 'Acácias' },
  { rotulo: 'UUID do tutor', valor: TUTOR },
  { rotulo: 'UUID do pet', valor: PET_ID },
  { rotulo: 'UUID do caso', valor: CASO_ID },
];

/**
 * O perdido legítimo, com os dados sensíveis plantados no texto livre e com as
 * propriedades a mais que uma porta descuidada carregaria. O `as` é o ponto: a
 * interface não admite esses campos, e o dublê os força para provar que a
 * projeção é lista branca e não cópia.
 */
function perdidoHostil(parcial: Partial<PerdidoPublico> = {}): PerdidoPublico {
  const legitimo: PerdidoPublico = {
    shareToken: TOKEN,
    petNome: `Mel ${TELEFONE_DO_TUTOR}`,
    especie: 'dog',
    porte: 'P',
    racaRotulo: `Poodle, fala com ${EMAIL_DO_TUTOR}`,
    corRotulo: 'Caramelo',
    vistoPorUltimoEm: new Date('2026-10-17T18:30:00.000Z'),
    cidade: 'São Paulo',
    bairro: 'Vila Mariana',
    chaveDaFoto: 'pets/abc/thumb/f00d.webp',
    ...parcial,
  };
  return {
    ...legitimo,
    id: CASO_ID,
    petId: PET_ID,
    ownerUserId: TUTOR,
    owner_user_id: TUTOR,
    email: EMAIL_DO_TUTOR,
    phone: TELEFONE_DO_TUTOR,
    address: ENDERECO_DO_TUTOR,
    lat: -23.56,
    lon: -46.68,
  } as unknown as PerdidoPublico;
}

interface Bancada {
  readonly app: RegistradorDeRotas;
  readonly contrato: Contrato;
  readonly recortes: RecorteDePerdidos[];
  readonly conferirParametros: () => void;
}

function montar(pagina: PaginaDePerdidos): Bancada {
  const recortes: RecorteDePerdidos[] = [];
  const porta: ListagemPublicaDePerdidos = {
    listar: (recorte) => {
      recortes.push(recorte);
      return Promise.resolve(pagina);
    },
  };
  const contrato = carregarContrato('api/openapi.yaml');
  const app = criarServidor({
    problemBaseUrl: 'https://api.exemplo.invalid/problems' as AbsoluteUrl,
    isProduction: false,
    teto: tetoDeTeste(),
  });
  const conferirParametros = vigiarParametrosDasRotas(app, contrato, '/v1');
  void app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotaDaListagemDePerdidos(escopo, {
        listagem: new ListagemPublicaDePerdidosService(
          porta,
          {
            baseDaWeb: 'https://web.exemplo.invalid' as AbsoluteUrl,
            baseDeMidia: 'https://midia.exemplo.invalid' as AbsoluteUrl,
          },
          { now: () => AGORA },
        ),
      });
      pronto();
    },
    { prefix: '/v1' },
  );
  return { app, contrato, recortes, conferirParametros };
}

interface Resposta {
  readonly status: number;
  readonly cabecalhos: Record<string, unknown>;
  readonly corpo: Record<string, unknown>;
}

/** **Sem `Authorization`, de propósito**: a operação é pública e deslogada. */
async function pedirSemConta(bancada: Bancada, url: string): Promise<Resposta> {
  const resposta = await bancada.app.inject({ method: 'GET', url });
  return {
    status: resposta.statusCode,
    cabecalhos: resposta.headers,
    corpo: JSON.parse(resposta.body) as Record<string, unknown>,
  };
}

function declaradas(contrato: Contrato): ReadonlySet<string> {
  const schema = contrato.responseSchema('listPublicLostPets', '200');
  if (schema === undefined) {
    throw new Error('O contrato não declara o corpo 200 de listPublicLostPets.');
  }
  return propriedadesDeclaradas(schema);
}

const URL_DA_LISTA = '/v1/public/lost-pets?city=S%C3%A3o%20Paulo';

void describe('a listagem pública de perdidos mostra pet perdido de verdade', () => {
  void it('devolve 200 SEM CONTA, com o pet, o bairro e quando ele foi visto', async () => {
    const bancada = montar({ itens: [perdidoHostil()], total: 87 });
    const resposta = await pedirSemConta(bancada, URL_DA_LISTA);

    assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
    const itens = resposta.corpo['items'] as Record<string, unknown>[];
    assert.equal(itens.length, 1);
    assert.equal(itens[0]?.['area_label'], 'Vila Mariana, São Paulo');
    assert.equal(itens[0]?.['lost_since'], '2026-10-17T18:30:00.000Z');
    assert.equal(itens[0]?.['share_token'], TOKEN);
    assert.equal(
      itens[0]?.['photo_url'],
      'https://midia.exemplo.invalid/pets/abc/thumb/f00d.webp',
    );
    assert.equal(itens[0]?.['share_url'], `https://web.exemplo.invalid/p/${TOKEN}`);
    // `total` alimenta "Mostrando 1 a 20 de 87", e os padrões do contrato
    // (`page: 1`, `limit: 20`) voltam na resposta para a tela não supor.
    assert.equal(resposta.corpo['total'], 87);
    assert.equal(resposta.corpo['page'], 1);
    assert.equal(resposta.corpo['limit'], 20);
  });

  void it('CONTRAPESO: lista vazia responde 200 com total 0, e não um erro', async () => {
    const bancada = montar({ itens: [], total: 0 });
    const resposta = await pedirSemConta(bancada, URL_DA_LISTA);

    assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
    assert.deepEqual(resposta.corpo['items'], []);
    assert.equal(resposta.corpo['total'], 0);
  });

  void it('o recorte chega à porta com a janela padrão do contrato, `30d`', async () => {
    const bancada = montar({ itens: [], total: 0 });
    await pedirSemConta(bancada, URL_DA_LISTA);
    const recorte = bancada.recortes[0];
    assert.equal(recorte?.janela, '30d');
    assert.equal(recorte?.cidade, 'São Paulo');
    assert.equal(recorte?.pagina, 1);
    assert.equal(recorte?.limite, 20);
    // O relógio é injetado: a janela não lê `Date.now()`.
    assert.equal(recorte?.agora.getTime(), AGORA);
  });

  void it('`applied_filters` devolve o recorte que de fato valeu', async () => {
    const bancada = montar({ itens: [], total: 0 });
    const resposta = await pedirSemConta(
      bancada,
      '/v1/public/lost-pets?city=Campinas&neighborhood=Cambu%C3%AD&species=cat&period=7d',
    );
    assert.deepEqual(resposta.corpo['applied_filters'], {
      city: 'Campinas',
      neighborhood: 'Cambuí',
      species: 'cat',
      period: '7d',
    });
  });

  void it('`city` ausente responde 400, o status que a operação declara', async () => {
    const bancada = montar({ itens: [], total: 0 });
    const resposta = await pedirSemConta(bancada, '/v1/public/lost-pets');
    assert.equal(resposta.status, 400, JSON.stringify(resposta.corpo));
    // E nada chegou à porta: o esquema recusa antes do manipulador.
    assert.equal(bancada.recortes.length, 0);
  });

  void it('a rota passa pelo guarda de parâmetros sem derrubar a subida', async () => {
    const bancada = montar({ itens: [], total: 0 });
    // O pedido vem PRIMEIRO de propósito: é ele que leva o Fastify a `ready()`
    // e registra as rotas. Conferir antes acusa "nenhuma rota recebeu
    // validação" sobre um servidor que ainda não tem rota nenhuma — e foi
    // exatamente assim que esta isca reprovou na primeira rodada.
    await pedirSemConta(bancada, URL_DA_LISTA);
    bancada.conferirParametros();
  });
});

void describe('não-vazamento: a listagem pública não carrega id interno nem dado do tutor', () => {
  void it('zero achados do detector, com a porta devolvendo tudo que não devia', async () => {
    const bancada = montar({ itens: [perdidoHostil(), perdidoHostil()], total: 2 });
    const resposta = await pedirSemConta(bancada, URL_DA_LISTA);
    assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
    assert.deepEqual(
      achadosDeVazamento(resposta.corpo, {
        declaradas: declaradas(bancada.contrato),
        plantados: PLANTADOS,
      }),
      [],
    );
  });

  void it('ISCA: um UUID no lugar do `share_token` é PEGO pelo detector', async () => {
    // Sem esta isca o caso de cima provaria apenas que o detector foi chamado.
    const bancada = montar({
      itens: [perdidoHostil({ shareToken: CASO_ID })],
      total: 1,
    });
    const resposta = await pedirSemConta(bancada, URL_DA_LISTA);
    const achados = achadosDeVazamento(resposta.corpo, {
      declaradas: declaradas(bancada.contrato),
      plantados: PLANTADOS,
    });
    assert.ok(achados.length > 0, 'o detector não pegou um UUID interno na chave da lista');
  });

  void it('`area_label` é NULO quando o caso só tem coordenada (BICHUS-21 critério 5)', async () => {
    const bancada = montar({
      itens: [perdidoHostil({ cidade: null, bairro: null })],
      total: 1,
    });
    const resposta = await pedirSemConta(bancada, URL_DA_LISTA);
    const itens = resposta.corpo['items'] as Record<string, unknown>[];
    // Nulo, e não "Região não informada": rótulo fixo dentro de um campo de
    // dado é indistinguível de um bairro com esse nome. O texto é do cliente.
    assert.equal(itens[0]?.['area_label'], null);
  });

  void it('`Cache-Control: no-store` e `X-Robots-Tag: noindex`', async () => {
    const bancada = montar({ itens: [perdidoHostil()], total: 1 });
    const resposta = await pedirSemConta(bancada, URL_DA_LISTA);
    assert.equal(resposta.cabecalhos['cache-control'], 'no-store');
    assert.equal(resposta.cabecalhos['x-robots-tag'], 'noindex, nofollow');
  });
});
