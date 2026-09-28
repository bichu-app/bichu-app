/**
 * As tres rotas da `Rede`, sobre um Fastify de verdade.
 *
 * Sobe o servidor em vez de chamar o manipulador porque o que estas rotas
 * prometem so existe com o framework no caminho: o **401** de quem pede o
 * ponto sem conta, o **404** do encontro invisivel, o **429** do teto (que e
 * um gancho, e nao um `if`) e a **serializacao real** da resposta -- que e onde
 * uma coordenada vazaria.
 *
 * ## As iscas deste arquivo, e como cada uma foi provada
 *
 * Cada linha foi desligada no codigo de producao, a suite rodou e reprovou com
 * o nome do caso na saida, e o arquivo foi restaurado. As linhas "23/09,
 * emenda" foram medidas na emenda da BICHUS-251 (ADR-0027 12), Node 22
 * (`/opt/homebrew/opt/node@22`).
 *
 * | o que foi desligado | `fail` |
 * |---|---|
 * | `ordemPadraoDe` devolvendo `proximos` tambem para `past` | 2 |
 * | `effective_when` saindo fixo em `upcoming` | 1 |
 * | `deny_429` virando `log_and_alert` no teto da agenda | 1 |
 * | 23/09, emenda: `location` sem `chamadorAutenticado` (responde sem conta) | 4 |
 * | 23/09, emenda: `location` consultando ANTES de autenticar | 2 |
 * | 23/09, emenda: o 404 do `location` virando 403 | 1 |
 * | 23/09, emenda: o detalhe levando o ponto junto (`point` no corpo publico) | 1 |
 * | `rateLimit` removido da agenda (tem efeito) | **nao compila** |
 * | dimensao `account` do `location` declarada sem resolvedor | **nao compila** |
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import { problemas } from '../../../../shared/http/errors.js';
import {
  criarContadorDesligado,
  criarContadorEmMemoria,
} from '../../../../shared/http/rate-limit.js';
import type { RateLimitStore } from '../../../../shared/ports/rate-limit-store.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { Clock } from '../../../../shared/ports/index.js';
import type { AbsoluteUrl, Instant, UserId } from '../../../../shared/types/brands.js';
import type { EncontroDaRede } from '../../domain/encontro-da-rede.js';
import type {
  DesfechoDaDesistencia,
  DesfechoDoPedido,
  LocalDoEncontro,
  NetworkRepository,
  PaginaDaAgenda,
  PaginaDosMeusPedidos,
  PaginaPorDistancia,
  PedidoDaConta,
  RecorteDaAgenda,
} from '../../ports/network-repository.js';
import { ordemPadraoDe, registrarRotasDaRede, rotaDaAgenda, rotaDoLocal } from './network-routes.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const QUEM_CHAMA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const AGORA = Date.UTC(2026, 8, 23, 12, 0, 0);
const UMA_HORA = 3_600_000;
const SLUG = 'encontro-de-domingo-na-benedito';
const PONTO = { lat: -23.5617, lon: -46.6823 };

const ENCONTRO: EncontroDaRede = {
  slug: SLUG,
  title: 'Encontro de domingo na Benedito Calixto',
  summary: 'Cachorros de todos os portes, sombra e agua fresca.',
  placeName: 'Praça Benedito Calixto',
  neighborhood: 'Pinheiros',
  city: 'São Paulo',
  state: 'SP',
  startsAt: (AGORA + UMA_HORA) as Instant,
  endsAt: (AGORA + 3 * UMA_HORA) as Instant,
  timeZone: 'America/Sao_Paulo',
  publicacao: 'published',
  dataLocal: '2026-09-23',
  visibilidade: 'public',
  entrada: { tipo: 'free' },
  portesAceitos: ['P', 'M', 'G', 'GG'],
  idadeDosCaes: 'any',
  vacinacaoExigida: true,
  areaCercada: false,
  estrutura: [],
  paraLevar: [],
  observacoes: null,
  imagens: [],
};

const PRIVADO: EncontroDaRede = {
  ...ENCONTRO,
  slug: 'p-q8w3n5z1ty',
  visibilidade: 'private',
  placeName: 'ISCA-LUGAR',
  neighborhood: 'ISCA-BAIRRO',
  summary: 'ISCA-RESUMO',
};

interface Cenario {
  readonly contador?: RateLimitStore;
  /** `undefined` e o encontro que nao existe OU nao e visivel -- o mesmo caso. */
  readonly encontro?: EncontroDaRede | undefined;
  readonly local?: LocalDoEncontro | undefined;
  readonly pedido?: DesfechoDoPedido;
  readonly desistencia?: DesfechoDaDesistencia;
  readonly detalhes?: EncontroDaRede | undefined;
  readonly temRegiao?: boolean;
}

const recortesVistos: RecorteDaAgenda[] = [];
const locaisPedidos: string[] = [];

function repositorio(cenario: Cenario): NetworkRepository {
  return {
    listarAgenda: (recorte): Promise<PaginaDaAgenda> => {
      recortesVistos.push(recorte);
      return Promise.resolve({ itens: [ENCONTRO], total: 1 });
    },
    buscarEncontro: (): Promise<EncontroDaRede | undefined> =>
      Promise.resolve('encontro' in cenario ? cenario.encontro : ENCONTRO),
    buscarLocalDoEncontro: (slug): Promise<LocalDoEncontro | undefined> => {
      locaisPedidos.push(slug);
      return Promise.resolve('local' in cenario ? cenario.local : { ponto: PONTO });
    },
    listarPorDistancia: (): Promise<PaginaPorDistancia> =>
      Promise.resolve({
        itens: [{ encontro: ENCONTRO, distanciaM: 1249 }],
        total: 1,
        temRegiao: cenario.temRegiao ?? true,
      }),
    buscarDetalhesPrivados: (): Promise<EncontroDaRede | undefined> =>
      Promise.resolve('detalhes' in cenario ? cenario.detalhes : PRIVADO),
    pedirParaParticipar: (): Promise<DesfechoDoPedido> =>
      Promise.resolve(
        cenario.pedido ?? {
          tipo: 'ok',
          pedido: { decisao: 'pending', pedidoEm: AGORA as Instant, encontro: PRIVADO },
        },
      ),
    lerMeuPedido: (): Promise<PedidoDaConta | undefined> =>
      Promise.resolve({ decisao: 'declined', pedidoEm: AGORA as Instant, encontro: PRIVADO }),
    desistirDoPedido: (): Promise<DesfechoDaDesistencia> =>
      Promise.resolve(cenario.desistencia ?? { tipo: 'ok', pedidoEm: AGORA as Instant }),
    listarMeusPedidos: (): Promise<PaginaDosMeusPedidos> =>
      Promise.resolve({
        itens: [{ decisao: 'declined', pedidoEm: AGORA as Instant, encontro: PRIVADO }],
        total: 1,
      }),
  };
}

function servidor(
  cenario: Cenario = {},
  autenticar: (token: string) => Promise<{ userId: UserId }> = (token) =>
    Promise.resolve({ userId: token as UserId }),
): RegistradorDeRotas {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(cenario.contador ?? criarContadorEmMemoria(() => AGORA)),
    bodyLimitBytes: 1_048_576,
  });
  const clock: Clock = { now: () => AGORA as ReturnType<Clock['now']> };
  registrarRotasDaRede(app, { rede: repositorio(cenario), autenticador: { autenticar }, clock });
  return app;
}

interface Resposta {
  readonly status: number;
  readonly cache: string | string[] | number | undefined;
  readonly corpo: Record<string, unknown>;
  readonly bruto: string;
}

async function pedir(
  app: RegistradorDeRotas,
  opcoes: { url?: string; como?: UserId | null; metodo?: 'GET' | 'POST' | 'DELETE' } = {},
): Promise<Resposta> {
  const como = opcoes.como === undefined ? null : opcoes.como;
  const resposta = await app.inject({
    method: opcoes.metodo ?? 'GET',
    url: opcoes.url ?? '/network/events',
    ...(como === null ? {} : { headers: { authorization: `Bearer ${como}` } }),
  });
  return {
    status: resposta.statusCode,
    cache: resposta.headers['cache-control'],
    corpo: resposta.body === '' ? {} : (JSON.parse(resposta.body) as Record<string, unknown>),
    bruto: resposta.body,
  };
}

const URL_DO_LOCAL = `/network/events/${SLUG}/location`;

void describe('a agenda e publica, e a ordem depende do recorte de tempo', () => {
  void it('sem conta nenhuma, responde 200 -- a Rede e navegavel deslogado', async () => {
    const resposta = await pedir(servidor());
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo['total'], 1);
    assert.equal(resposta.corpo['page'], 1);
    assert.equal(resposta.corpo['limit'], 20);
  });

  void it('sem `when`, o recorte que vale e `upcoming` e a ordem e `proximos`', async () => {
    // O default de `when` importa: uma agenda que abre misturando o que passou
    // com o que vem e o defeito mais comum de agenda.
    const resposta = await pedir(servidor());
    assert.equal(resposta.corpo['effective_when'], 'upcoming');
    assert.equal(resposta.corpo['effective_sort'], 'proximos');
  });

  void it('com `when=past` e SEM `sort`, a ordem que vale e `recentes`', async () => {
    // ISCA: com `ordemPadraoDe` devolvendo `proximos` para tudo, este caso le
    // `proximos`. O cliente que nao mandou `sort` nao tem como saber a ordem
    // sem `effective_sort`, e a barra de listagem mostra a ordem REAL.
    const resposta = await pedir(servidor(), { url: '/network/events?when=past' });
    assert.equal(resposta.corpo['effective_when'], 'past');
    assert.equal(resposta.corpo['effective_sort'], 'recentes');
  });

  void it('com `when=all` e SEM `sort`, a ordem que vale e `proximos`', async () => {
    const resposta = await pedir(servidor(), { url: '/network/events?when=all' });
    assert.equal(resposta.corpo['effective_when'], 'all');
    assert.equal(resposta.corpo['effective_sort'], 'proximos');
  });

  void it('o `sort` pedido ganha do default, inclusive no passado', async () => {
    const resposta = await pedir(servidor(), {
      url: '/network/events?when=past&sort=proximos',
    });
    assert.equal(resposta.corpo['effective_sort'], 'proximos');
  });

  void it('a ordem e o recorte que valeram chegam ao repositorio, e nao so a resposta', async () => {
    // Devolver `effective_sort` correto e consultar em outra ordem seria a
    // resposta afirmando uma ordem sobre uma lista que o servidor ordenou de
    // outro jeito -- exatamente o que este campo existe para impedir.
    recortesVistos.length = 0;
    await pedir(servidor(), { url: '/network/events?when=past' });
    const recorte = recortesVistos.at(-1);
    assert.ok(recorte !== undefined);
    assert.equal(recorte.when, 'past');
    assert.equal(recorte.sort, 'recentes');
    assert.equal(recorte.agora, AGORA);
  });

  void it('sem filtro nenhum, `applied_filters` traz `scope: all`', async () => {
    const resposta = await pedir(servidor());
    assert.deepEqual(resposta.corpo['applied_filters'], { scope: 'all' });
  });

  void it('os filtros informados voltam em `applied_filters`, para a tela escrever', async () => {
    const resposta = await pedir(servidor(), {
      url: '/network/events?q=domingo&city=S%C3%A3o%20Paulo',
    });
    assert.deepEqual(resposta.corpo['applied_filters'], { q: 'domingo', city: 'São Paulo' });
  });

  void it('`when` NAO entra em `applied_filters`: ele tem campo proprio', async () => {
    // Poe-lo tambem ali faria a tela mostrar "Proximos" como filtro escolhido,
    // e o botao de limpar filtros passaria a prometer que apaga o estado normal
    // da agenda.
    const resposta = await pedir(servidor(), { url: '/network/events?when=past' });
    assert.deepEqual(resposta.corpo['applied_filters'], { scope: 'all' });
  });

  void it('o cartao traz o fuso e o rotulo calculado no servidor', async () => {
    const resposta = await pedir(servidor());
    const itens = resposta.corpo['items'] as Record<string, unknown>[];
    assert.equal(itens[0]?.['time_zone'], 'America/Sao_Paulo');
    assert.equal(itens[0]?.['status'], 'upcoming');
  });
});

void describe('nenhuma coordenada e nenhuma pessoa nas leituras publicas', () => {
  void it('a listagem NAO devolve UUID nem ponto em lugar nenhum do corpo', async () => {
    const resposta = await pedir(servidor());
    assert.equal(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(resposta.bruto),
      false,
      'ISCA: qualquer UUID no corpo reprova. O endereco de um encontro e o `slug`.',
    );
    for (const proibido of ['"lat"', '"lon"', '"point"']) {
      assert.equal(resposta.bruto.includes(proibido), false, `${proibido} na agenda publica.`);
    }
  });

  void it('o detalhe, COM conta, continua sem ponto: o corpo e um so', async () => {
    // ISCA: se o detalhe levar o ponto junto quando ha token, este caso acusa.
    // `getNetworkEvent` tem autenticacao opcional, e para o portao de contrato
    // publico isso e operacao publica (ADR-0027 12.5).
    const comConta = await pedir(servidor(), { url: `/network/events/${SLUG}`, como: QUEM_CHAMA });
    const semConta = await pedir(servidor(), { url: `/network/events/${SLUG}` });
    assert.equal(comConta.status, 200);
    assert.equal(comConta.bruto, semConta.bruto, 'ADR-0021: o corpo nao muda conforme o chamador.');
    for (const proibido of ['"lat"', '"lon"', '"point"', 'checkin', 'gallery', 'viewer_']) {
      assert.equal(comConta.bruto.includes(proibido), false, `${proibido} no detalhe publico.`);
    }
  });

  void it('o detalhe com token INVALIDO atende como quem nao tem conta', async () => {
    // O detalhe nao le o token. Um token vencido nao pode virar 401 numa rota
    // que atende sem token nenhum.
    const app = servidor({}, () => Promise.reject(new Error('token vencido')));
    const resposta = await pedir(app, { url: `/network/events/${SLUG}`, como: QUEM_CHAMA });
    assert.equal(resposta.status, 200);
  });

  void it('encontro invisivel ou inexistente: 404, e nunca 403', async () => {
    const resposta = await pedir(servidor({ encontro: undefined }), {
      url: '/network/events/encontro-que-foi-retirado',
    });
    assert.equal(resposta.status, 404);
  });

  void it('o cancelado sai na leitura publica com `status` `cancelled`', async () => {
    const resposta = await pedir(servidor({ encontro: { ...ENCONTRO, publicacao: 'cancelled' } }), {
      url: `/network/events/${SLUG}`,
    });
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo['status'], 'cancelled');
  });
});

void describe('getNetworkEventLocation: o ponto, so com conta', () => {
  void it('ISCA -- SEM cabecalho de credencial, 401, e o repositorio nem e consultado', async () => {
    // A prova negativa da emenda 1 do ADR-0010: sem conta, nao ha ponto. E o
    // 401 vem ANTES da consulta -- sem conta nao se descobre nem se o `slug`
    // existe.
    locaisPedidos.length = 0;
    const resposta = await pedir(servidor(), { url: URL_DO_LOCAL, como: null });
    assert.equal(resposta.status, 401);
    assert.equal(resposta.bruto.includes('"lat"'), false);
    assert.deepEqual(locaisPedidos, [], 'o repositorio foi consultado antes da autenticacao');
  });

  void it('ISCA -- com "Bearer " vazio, 401 tambem', async () => {
    const resposta = await servidor().inject({
      method: 'GET',
      url: URL_DO_LOCAL,
      headers: { authorization: 'Bearer    ' },
    });
    assert.equal(resposta.statusCode, 401);
  });

  void it('ISCA -- com token recusado pelo servico de identidade, 401', async () => {
    // O servico de identidade recusa com o mesmo problema que ele devolve em
    // producao; a rota nao traduz nem engole.
    const app = servidor({}, () => Promise.reject(problemas.naoAutenticado()));
    const resposta = await pedir(app, { url: URL_DO_LOCAL, como: QUEM_CHAMA });
    assert.equal(resposta.status, 401);
    assert.equal(resposta.bruto.includes('"lat"'), false);
  });

  void it('sem conta, 401 MESMO para `slug` que nao existe -- o 401 nao conta que ele existe', async () => {
    const resposta = await pedir(servidor({ local: undefined }), {
      url: '/network/events/nao-existe-isto/location',
      como: null,
    });
    assert.equal(resposta.status, 401);
  });

  void it('com conta, devolve `{ point: { lat, lon } }`, e o corpo tem so isso', async () => {
    const resposta = await pedir(servidor(), { url: URL_DO_LOCAL, como: QUEM_CHAMA });
    assert.equal(resposta.status, 200);
    assert.deepEqual(resposta.corpo, { point: PONTO });
  });

  void it('com conta e sem ponto marcado, `point` e nulo', async () => {
    const resposta = await pedir(servidor({ local: { ponto: null } }), {
      url: URL_DO_LOCAL,
      como: QUEM_CHAMA,
    });
    assert.equal(resposta.status, 200);
    assert.deepEqual(resposta.corpo, { point: null });
  });

  void it('encontro invisivel ou inexistente: 404 com o mesmo corpo do detalhe, e nunca 403', async () => {
    const local = await pedir(servidor({ local: undefined }), {
      url: '/network/events/encontro-que-foi-retirado/location',
      como: QUEM_CHAMA,
    });
    const detalhe = await pedir(servidor({ encontro: undefined }), {
      url: '/network/events/encontro-que-foi-retirado',
    });
    assert.equal(local.status, 404);
    assert.deepEqual(
      { ...local.corpo, instance: undefined, correlation_id: undefined },
      { ...detalhe.corpo, instance: undefined, correlation_id: undefined },
      'ADR-0027 12.5: o 404 do ponto e o mesmo corpo do 404 do detalhe',
    );
  });

  void it('o `slug` do caminho chega ao repositorio, e so ele', async () => {
    locaisPedidos.length = 0;
    await pedir(servidor(), { url: URL_DO_LOCAL, como: QUEM_CHAMA });
    assert.deepEqual(locaisPedidos, [SLUG]);
  });
});

void describe('os tetos das tres rotas', () => {
  void it('a chamada 301 da agenda na mesma hora e recusada com 429', async () => {
    const contador = criarContadorEmMemoria(() => AGORA);
    const app = servidor({ contador });
    for (let i = 0; i < 300; i += 1) {
      const ok = await pedir(app);
      assert.equal(ok.status, 200, `a chamada ${String(i + 1)} deveria passar`);
    }
    const recusada = await pedir(app);
    assert.equal(
      recusada.status,
      429,
      'ISCA: com `log_and_alert` no lugar de `deny_429`, esta chamada responde 200.',
    );
  });

  void it('com o contador desligado, a 301 passa -- e e isso que prova que o caso mede LIMITE', async () => {
    const app = servidor({ contador: criarContadorDesligado() });
    for (let i = 0; i < 300; i += 1) await pedir(app);
    assert.equal((await pedir(app)).status, 200);
  });

  void it('a agenda conta por IP, porque nao ha conta para contar', () => {
    assert.deepEqual(
      rotaDaAgenda.rateLimit.map((entrada) => entrada.dimension),
      [['ip']],
    );
    assert.equal(rotaDaAgenda.rateLimit.length, 1, 'um teto so, e uma dimensao so');
  });

  void it('o ponto conta por CONTA, porque ele exige uma (ADR-0027 12.5)', () => {
    assert.deepEqual(
      rotaDoLocal.rateLimit?.map((entrada) => entrada.dimension),
      [['account']],
    );
  });

  void it('a chamada 601 do ponto pela mesma conta na mesma hora e recusada com 429', async () => {
    const app = servidor({ contador: criarContadorEmMemoria(() => AGORA) });
    for (let i = 0; i < 600; i += 1) {
      const ok = await pedir(app, { url: URL_DO_LOCAL, como: QUEM_CHAMA });
      assert.equal(ok.status, 200, `a chamada ${String(i + 1)} deveria passar`);
    }
    assert.equal((await pedir(app, { url: URL_DO_LOCAL, como: QUEM_CHAMA })).status, 429);
  });
});

const ROTAS_COM_CONTA: readonly { metodo: 'GET' | 'POST' | 'DELETE'; url: string }[] = [
  { metodo: 'GET', url: '/network/events/nearby' },
  { metodo: 'GET', url: `/network/events/${SLUG}/location` },
  { metodo: 'GET', url: `/network/events/${SLUG}/private-details` },
  { metodo: 'POST', url: `/network/events/${SLUG}/join-request` },
  { metodo: 'GET', url: `/network/events/${SLUG}/join-request` },
  { metodo: 'DELETE', url: `/network/events/${SLUG}/join-request` },
  { metodo: 'GET', url: '/network/join-requests' },
];

void describe('as sete operacoes com conta: 401 sem token, e nada do encontro no corpo', () => {
  for (const rota of ROTAS_COM_CONTA) {
    void it(`ISCA -- ${rota.metodo} ${rota.url} sem token responde 401`, async () => {
      const resposta = await pedir(servidor(), { metodo: rota.metodo, url: rota.url, como: null });
      assert.equal(resposta.status, 401);
      for (const proibido of ['ISCA-', '"lat"', '"state"', 'Benedito']) {
        assert.equal(resposta.bruto.includes(proibido), false, `${proibido} no 401 de ${rota.url}`);
      }
    });
  }
});

void describe('o privado na leitura publica e o teaser', () => {
  void it('o detalhe do privado tem exatamente cinco campos, com e sem conta', async () => {
    const app = servidor({ encontro: PRIVADO });
    const semConta = await pedir(app, { url: `/network/events/${PRIVADO.slug}` });
    const comConta = await pedir(app, { url: `/network/events/${PRIVADO.slug}`, como: QUEM_CHAMA });
    assert.deepEqual(Object.keys(semConta.corpo).sort(), ['local_date', 'slug', 'status', 'title', 'visibility']);
    assert.equal(semConta.bruto, comConta.bruto, 'ADR-0021: a forma vem do evento, nao do chamador');
    assert.equal(semConta.bruto.includes('ISCA-'), false);
  });

  void it('private-details e location respondem com `private, no-store`', async () => {
    const detalhes = await pedir(servidor(), { url: `/network/events/${SLUG}/private-details`, como: QUEM_CHAMA });
    const local = await pedir(servidor(), { url: `/network/events/${SLUG}/location`, como: QUEM_CHAMA });
    assert.equal(detalhes.status, 200);
    assert.equal(detalhes.cache, 'private, no-store');
    assert.equal(local.cache, 'private, no-store');
  });

  void it('private-details sem aprovacao e 404, com o mesmo corpo do detalhe inexistente', async () => {
    const detalhes = await pedir(servidor({ detalhes: undefined }), {
      url: `/network/events/${SLUG}/private-details`,
      como: QUEM_CHAMA,
    });
    const inexistente = await pedir(servidor({ encontro: undefined }), { url: '/network/events/nao-existe' });
    assert.equal(detalhes.status, 404);
    assert.deepEqual(
      { ...detalhes.corpo, instance: undefined, correlation_id: undefined },
      { ...inexistente.corpo, instance: undefined, correlation_id: undefined },
    );
  });
});

void describe('o pedido para participar, no vocabulario do app', () => {
  void it('ISCA -- o recusado sai como `requested`, nunca como `declined`', async () => {
    const resposta = await pedir(servidor(), { url: `/network/events/${SLUG}/join-request`, como: QUEM_CHAMA });
    assert.deepEqual(Object.keys(resposta.corpo).sort(), ['requested_at', 'state']);
    assert.equal(resposta.corpo['state'], 'requested');
    assert.equal(resposta.bruto.includes('declined'), false);
  });

  void it('pedir em encontro encerrado e 400 `event_ended`', async () => {
    const resposta = await pedir(servidor({ pedido: { tipo: 'encerrado' } }), {
      metodo: 'POST',
      url: `/network/events/${SLUG}/join-request`,
      como: QUEM_CHAMA,
    });
    assert.equal(resposta.status, 400);
    assert.equal(resposta.bruto.includes('event_ended'), true);
  });

  void it('desistir de aprovado e 400 `join_request_final`, e desistir de pedido e 200 `withdrawn`', async () => {
    const final = await pedir(servidor({ desistencia: { tipo: 'final' } }), {
      metodo: 'DELETE',
      url: `/network/events/${SLUG}/join-request`,
      como: QUEM_CHAMA,
    });
    assert.equal(final.status, 400);
    const ok = await pedir(servidor(), { metodo: 'DELETE', url: `/network/events/${SLUG}/join-request`, como: QUEM_CHAMA });
    assert.equal(ok.corpo['state'], 'withdrawn');
  });

  void it('meus pedidos traz o teaser e o estado, e nada oculto', async () => {
    const resposta = await pedir(servidor(), { url: '/network/join-requests', como: QUEM_CHAMA });
    const itens = resposta.corpo['items'] as Record<string, unknown>[];
    assert.deepEqual(Object.keys(itens[0] ?? {}).sort(), ['event', 'requested_at', 'state']);
    assert.equal(resposta.bruto.includes('ISCA-'), false);
    assert.equal(resposta.bruto.includes('declined'), false);
  });
});

void describe('a agenda por distancia', () => {
  void it('com regiao, a distancia sai arredondada a 100 m e a ordem e `distancia`', async () => {
    const resposta = await pedir(servidor(), { url: '/network/events/nearby', como: QUEM_CHAMA });
    const itens = resposta.corpo['items'] as Record<string, unknown>[];
    assert.equal(itens[0]?.['distance_m'], 1200);
    assert.equal(resposta.corpo['effective_sort'], 'distancia');
  });

  void it('sem regiao, a ordem efetiva e `proximos`, e a resposta diz isso', async () => {
    const resposta = await pedir(servidor({ temRegiao: false }), { url: '/network/events/nearby', como: QUEM_CHAMA });
    assert.equal(resposta.corpo['effective_sort'], 'proximos');
  });
});

void describe('a regra do default de ordem, isolada', () => {
  void it('`upcoming` e `all` abrem em `proximos`, e `past` em `recentes`', () => {
    assert.equal(ordemPadraoDe('upcoming'), 'proximos');
    assert.equal(ordemPadraoDe('all'), 'proximos');
    assert.equal(ordemPadraoDe('past'), 'recentes');
  });
});
