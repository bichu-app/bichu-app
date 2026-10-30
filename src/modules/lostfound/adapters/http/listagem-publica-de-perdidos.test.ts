/** `GET /v1/public/lost-pets` (`listPublicLostPets`), pela borda HTTP. */
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
 * propriedades a mais que uma porta descuidada carregaria.
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
    encontradoPelaComunidade: false,
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

/** Sem `Authorization`, de propósito**: a operação é pública e deslogada. */
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

  /**
   * ISCA do contrato: `period` perdeu o `default: 30d` em `api/openapi.yaml`
   * (cliente, 18/10/2026), e é por isso que a ausência chega INDEFINIDA à porta.
   */
  void it('ISCA: `period` ausente chega INDEFINIDO à porta — janela aberta', async () => {
    const bancada = montar({ itens: [], total: 0 });
    await pedirSemConta(bancada, URL_DA_LISTA);
    const recorte = bancada.recortes[0];
    assert.equal(
      recorte?.janela,
      undefined,
      `a janela deveria chegar indefinida, e chegou \`${String(recorte?.janela)}\`. ` +
        'Se for `30d`, o `default` voltou ao contrato e o Ajv o está injetando.',
    );
    assert.equal(recorte?.cidade, 'São Paulo');
    assert.equal(recorte?.pagina, 1);
    assert.equal(recorte?.limite, 20);
    assert.equal(recorte?.agora.getTime(), AGORA);
  });

  void it('ISCA: sem `period`, `applied_filters` NÃO cita `period`', async () => {
    const bancada = montar({ itens: [], total: 0 });
    const resposta = await pedirSemConta(bancada, URL_DA_LISTA);
    assert.deepEqual(resposta.corpo['applied_filters'], { city: 'São Paulo' });
  });

  void it('CONTRAPESO: `period=30d` PEDIDO continua valendo e aparece', async () => {
    const bancada = montar({ itens: [], total: 0 });
    const resposta = await pedirSemConta(
      bancada,
      '/v1/public/lost-pets?city=S%C3%A3o%20Paulo&period=30d',
    );
    assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
    assert.equal(bancada.recortes[0]?.janela, '30d');
    assert.deepEqual(resposta.corpo['applied_filters'], {
      city: 'São Paulo',
      period: '30d',
    });
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

  /**
   * ISCA (a) do pedido do cliente de 19/10/2026: *"o campo cidade do filtro da
   * página pet não deve ser obrigatório"*.
   */
  void it('ISCA: a lista abre SEM `city` — 200, e com itens', async () => {
    const bancada = montar({ itens: [perdidoHostil()], total: 87 });
    const resposta = await pedirSemConta(bancada, '/v1/public/lost-pets');
    assert.equal(resposta.status, 200, JSON.stringify(resposta.corpo));
    const itens = resposta.corpo['items'] as Record<string, unknown>[];
    assert.equal(itens.length, 1, 'a lista sem cidade tem de TRAZER item');
    assert.equal(resposta.corpo['total'], 87);
  });

  /** ISCA do texto vazio: `city` ausente chega INDEFINIDA, e não como `''`. */
  void it('ISCA: `city` ausente chega INDEFINIDA à porta, e não como texto vazio', async () => {
    const bancada = montar({ itens: [], total: 0 });
    await pedirSemConta(bancada, '/v1/public/lost-pets');
    const recorte = bancada.recortes[0];
    assert.equal(bancada.recortes.length, 1, 'a porta tem de ser chamada');
    assert.equal(
      recorte?.cidade,
      undefined,
      `a cidade deveria chegar indefinida, e chegou \`${String(recorte?.cidade)}\`. ` +
        "Se for `''`, o `?? ''` voltou à rota.",
    );
  });

  void it('ISCA: sem `city`, `applied_filters` NÃO cita `city`', async () => {
    const bancada = montar({ itens: [], total: 0 });
    const resposta = await pedirSemConta(bancada, '/v1/public/lost-pets');
    assert.deepEqual(resposta.corpo['applied_filters'], {});
  });

  /**
   * ISCA (f) do refinamento de 19/10: *"devemos filtrar pelos 20 últimos pets
   * cadastrados"*.
   */
  void it('ISCA: o recorte padrão pede a página 1 com limite 20', async () => {
    const bancada = montar({ itens: [], total: 0 });
    await pedirSemConta(bancada, '/v1/public/lost-pets');
    assert.equal(bancada.recortes[0]?.pagina, 1);
    assert.equal(bancada.recortes[0]?.limite, 20);
  });

  void it('CONTRAPESO: `city` com UMA letra continua 400 — `minLength: 2` vale', async () => {
    const bancada = montar({ itens: [], total: 0 });
    const resposta = await pedirSemConta(bancada, '/v1/public/lost-pets?city=S');
    assert.equal(resposta.status, 400, JSON.stringify(resposta.corpo));
    assert.equal(bancada.recortes.length, 0, 'nada chega à porta com 400');
  });

  void it('CONTRAPESO: `city` PEDIDA continua recortando e aparece', async () => {
    const bancada = montar({ itens: [], total: 0 });
    const resposta = await pedirSemConta(bancada, URL_DA_LISTA);
    assert.equal(bancada.recortes[0]?.cidade, 'São Paulo');
    assert.deepEqual(resposta.corpo['applied_filters'], { city: 'São Paulo' });
  });

  void it('a rota passa pelo guarda de parâmetros sem derrubar a subida', async () => {
    const bancada = montar({ itens: [], total: 0 });
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
    assert.equal(itens[0]?.['area_label'], null);
  });

  void it('`Cache-Control: no-store` e `X-Robots-Tag: noindex`', async () => {
    const bancada = montar({ itens: [perdidoHostil()], total: 1 });
    const resposta = await pedirSemConta(bancada, URL_DA_LISTA);
    assert.equal(resposta.cabecalhos['cache-control'], 'no-store');
    assert.equal(resposta.cabecalhos['x-robots-tag'], 'noindex, nofollow');
  });
});

/**
 * O ADR-0006 PROÍBE COORDENADA NOS DOIS SENTIDOS NESTA ROTA, E SÓ UM DELES TINHA
 * PORTÃO.
 */
void describe('ADR-0006: a listagem pública não aceita coordenada NEM distância no pedido', () => {
  const NOMES_DE_COORDENADA = [
    'lat',
    'lon',
    'latitude',
    'longitude',
    'point',
    'reference_point',
    'geo',
    'geom',
    'geohash',
    'coordinate',
    'coordinates',
    'distance_m',
    'distance_km',
    'radius_m',
    'radius',
    'near',
    'bbox',
    'map_url',
  ];

  function operacao(): { readonly parameters: readonly Record<string, unknown>[] } {
    const op = carregarContrato('api/openapi.yaml').operacoes.get('listPublicLostPets');
    if (op === undefined) {
      throw new Error(
        'O contrato não declara `listPublicLostPets`: este caso não tem o que ' +
          'percorrer e reprova em vez de aprovar por omissão.',
      );
    }
    return op;
  }

  void it('a operação declara parâmetro, e há o que percorrer', () => {
    assert.ok(
      operacao().parameters.length > 0,
      'sem parâmetro declarado não há como afirmar que nenhum é coordenada',
    );
  });

  /**
   * DESLIGANDO: acrescente `- name: lat` / `in: query` aos `parameters` de
   * `listPublicLostPets` em `api/openapi.yaml`.
   */
  void it('ISCA: nenhum parâmetro da rota é coordenada, distância ou raio', () => {
    const achados = operacao()
      .parameters.map((p) => p['name'])
      .filter((nome): nome is string => typeof nome === 'string')
      .filter((nome) => NOMES_DE_COORDENADA.includes(nome.toLowerCase()));
    assert.deepEqual(
      achados,
      [],
      `o ADR-0006 proíbe estes parâmetros em \`listPublicLostPets\`: ${achados.join(', ')}. ` +
        'Ordenar a lista pública por proximidade exige emenda DATADA do ADR-0006 e do ' +
        'ADR-0010 (itens 4 e 5), e não um parâmetro novo.',
    );
  });

  void it('ISCA: o recorte que a porta recebe não tem campo de coordenada', () => {
    const bancada = montar({ itens: [], total: 0 });
    return pedirSemConta(
      bancada,
      '/v1/public/lost-pets?lat=-23.56&lon=-46.65&radius_m=5000',
    ).then(() => {
      const recorte = bancada.recortes[0] as unknown as Record<string, unknown>;
      assert.ok(recorte !== undefined, 'a porta tem de ser chamada');
      const vazados = NOMES_DE_COORDENADA.filter((nome) => recorte[nome] !== undefined);
      assert.deepEqual(
        vazados,
        [],
        `o recorte chegou com ${vazados.join(', ')}: a rota passou coordenada adiante`,
      );
    });
  });
});
