import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import { recusarCampoDesconhecido } from '../../../../shared/http/corpo-fechado.js';
import { corpoSemPadroes } from '../../../../shared/http/sem-padroes.js';
import { comoIso } from '../../../../shared/time/clock.js';
import { comoEtag } from '../../domain/escrita-do-encontro.js';
import {
  distanciaArredondada,
  estadoDoPedidoNoApp,
  projetarDetalhesPrivados,
  projetarEncontro,
  projetarLocalizacao,
  projetarMeuEncontro,
  projetarTeaser,
  type EncontroPublicoProjetado,
} from '../../domain/encontro-da-rede.js';
import type {
  NetworkRepository,
  OrdemDaAgenda,
  PedidoDaConta,
  RecorteNoTempo,
} from '../../ports/network-repository.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import type { Clock } from '../../../../shared/ports/index.js';
import type { AbsoluteUrl } from '../../../../shared/types/brands.js';
import type { DisponibilidadeDaPagina } from '../../../lostfound/ports/disponibilidade-da-pagina.js';
import type { EncontroDaComunidade } from '../../application/encontro-da-comunidade.js';
import type {
  CorpoDoCancelamentoDaComunidade,
  CorpoDoEncontroDaComunidade,
  PatchDoEncontroDaComunidade,
} from '../../domain/encontro-da-comunidade.js';
import {
  comoFamiliaDeSessao,
  type FamiliaDeSessao,
} from '../../../identity/ports/localizacao-de-referencia-repository.js';
import type { StatusDoEncontro } from '../../domain/encontro-da-rede.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';

/** Os tetos sao os do contrato, COPIADOS de la. */
export const rotaDaAgenda = defineRoute({
  operationId: 'listNetworkEvents',
  method: 'get',
  path: '/network/events',
  effects: ['expensive_query'],
  rateLimit: [{ dimension: ['ip'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDoEncontro = defineRoute({
  operationId: 'getNetworkEvent',
  method: 'get',
  path: '/network/events/:eventSlug',
  effects: [],
  rateLimit: [{ dimension: ['ip'], limit: 600, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDaAgendaPorDistancia = defineRoute({
  operationId: 'listNearbyNetworkEvents',
  method: 'get',
  path: '/network/events/nearby',
  effects: ['expensive_query'],
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

/** `account`, e nao `ip` (ADR-0027 12.5). */
export const rotaDoLocal = defineRoute({
  operationId: 'getNetworkEventLocation',
  method: 'get',
  path: '/network/events/:eventSlug/location',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 600, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDosDetalhesPrivados = defineRoute({
  operationId: 'getNetworkEventPrivateDetails',
  method: 'get',
  path: '/network/events/:eventSlug/private-details',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 600, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDoPedido = defineRoute({
  operationId: 'requestToJoinNetworkEvent',
  method: 'post',
  path: '/network/events/:eventSlug/join-request',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDoMeuPedido = defineRoute({
  operationId: 'getMyNetworkEventJoinRequest',
  method: 'get',
  path: '/network/events/:eventSlug/join-request',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 600, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDaDesistencia = defineRoute({
  operationId: 'withdrawNetworkEventJoinRequest',
  method: 'delete',
  path: '/network/events/:eventSlug/join-request',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

/**
 * "Meus eventos": a lista do DONO e a leitura que entrega o `ETag` (19/10/2026,
 * decisao do cliente).
 */
export const rotaDosMeusEncontros = defineRoute({
  operationId: 'listMyNetworkEvents',
  method: 'get',
  path: '/network/my-events',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDoMeuEncontro = defineRoute({
  operationId: 'getMyNetworkEvent',
  method: 'get',
  path: '/network/my-events/:eventSlug',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 600, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDosMeusPedidos = defineRoute({
  operationId: 'listMyNetworkEventJoinRequests',
  method: 'get',
  path: '/network/join-requests',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

/** As tres escritas da comunidade (ADR-0025 emenda 3). */
export const rotaDaCriacaoDeEncontro = defineRoute({
  operationId: 'createNetworkEvent',
  method: 'post',
  path: '/network/events',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 5, window: '24h', onExceed: 'deny_429' }],
});

export const rotaDaEdicaoDoEncontro = defineRoute({
  operationId: 'updateNetworkEvent',
  method: 'patch',
  path: '/network/events/:eventSlug',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDoCancelamentoDoEncontro = defineRoute({
  operationId: 'cancelNetworkEvent',
  method: 'post',
  path: '/network/events/:eventSlug/cancellation',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 30, window: '1h', onExceed: 'deny_429' }],
});

const PAGINA_INICIAL = 1;
const TAMANHO_PADRAO = 20;
const RECORTE_PADRAO: RecorteNoTempo = 'upcoming';
const SEM_CACHE = 'private, no-store';

/**
 * O default de `sort` **depende de `when`**: com `past` e `recentes`, com os
 * outros e `proximos`.
 */
export function ordemPadraoDe(quando: RecorteNoTempo): OrdemDaAgenda {
  return quando === 'past' ? 'recentes' : 'proximos';
}

export interface Autenticador {
  /**
   * `sid` e a familia de refresh que emitiu o token -- a SESSAO DE APARELHO do
   * ADR-0002, emenda 1, secao 2.
   */
  autenticar(token: string): Promise<{ userId: UserId; sid?: string | undefined }>;
}

interface ChamadorDaRede {
  readonly userId: UserId;
  readonly familia: FamiliaDeSessao | undefined;
}

export interface DependenciasDasRotasDaRede {
  readonly rede: NetworkRepository;
  readonly autenticador: Autenticador;
  readonly clock: Clock;
  /** As escritas da comunidade: criar, editar o proprio e cancelar o proprio. */
  readonly escritas: EncontroDaComunidade;
  /** De onde sai o esquema do corpo: a declaracao e a do contrato. */
  readonly contrato: Contrato;
  /**
   * `WEB_BASE_URL`: onde o site mora, e de onde sai o endereco da pagina publica do
   * encontro.
   */
  readonly baseDaWeb: AbsoluteUrl;
  /**
   * O interruptor das paginas publicas do site (`site_page_availability`, migracoes
   * `20261020000010` e `20261020000017`).
   */
  readonly paginas: DisponibilidadeDaPagina;
}

interface QueryDaAgenda {
  readonly q?: string;
  readonly city?: string;
  readonly when?: RecorteNoTempo;
  readonly status?: StatusDoEncontro;
  readonly sort?: string;
  readonly admission?: 'free' | 'paid';
  readonly visibility?: 'public' | 'private';
  readonly size?: string;
  readonly max_km?: 2 | 5 | 10;
  readonly page?: number;
  readonly limit?: number;
}

interface QueryDosMeusPedidos {
  readonly q?: string;
  readonly state?: 'requested' | 'approved' | 'withdrawn' | 'expired';
  readonly page?: number;
  readonly limit?: number;
}

interface QueryDaPagina {
  readonly status?: StatusDoEncontro;
  readonly page?: number;
  readonly limit?: number;
}

interface CaminhoDoEncontro {
  readonly eventSlug: string;
}

function aparado(valor: string | undefined): string | undefined {
  const t = valor?.trim();
  return t === undefined || t === '' ? undefined : t;
}

function recortesAplicados(entradas: Record<string, string | undefined>): Record<string, string> {
  const aplicados: Record<string, string> = {};
  for (const [nome, valor] of Object.entries(entradas)) {
    if (valor !== undefined) aplicados[nome] = valor;
  }
  if (Object.keys(aplicados).length === 0) aplicados['scope'] = 'all';
  return aplicados;
}

function filtrosDaAgenda(query: QueryDaAgenda) {
  return {
    q: aparado(query.q),
    city: aparado(query.city),
    admission: query.admission,
    size: query.size,
  };
}

function tokenDaRequisicao(request: FastifyRequest): string | undefined {
  const cabecalho = request.headers.authorization;
  if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) return undefined;
  const token = cabecalho.slice('Bearer '.length).trim();
  return token === '' ? undefined : token;
}

function identidadeDoChamador(
  request: FastifyRequest,
  deps: DependenciasDasRotasDaRede,
): Promise<ChamadorDaRede> {
  return memoDaRequisicao(request, 'rede:chamador', async () => {
    const token = tokenDaRequisicao(request);
    if (token === undefined) throw problemas.naoAutenticado();
    const { userId, sid } = await deps.autenticador.autenticar(token);
    return {
      userId,
      familia: typeof sid === 'string' && sid !== '' ? comoFamiliaDeSessao(sid) : undefined,
    };
  });
}

async function chamadorAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDaRede,
): Promise<UserId> {
  return (await identidadeDoChamador(request, deps)).userId;
}

async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDaRede,
): Promise<string | undefined> {
  try {
    return await chamadorAutenticado(request, deps);
  } catch {
    return undefined;
  }
}

async function contextoDoAutor(
  request: FastifyRequest,
  deps: DependenciasDasRotasDaRede,
): Promise<{ userId: UserId; correlationId: string; ip: string | undefined }> {
  return { userId: await chamadorAutenticado(request, deps), correlationId: request.id, ip: request.ip };
}

function projetarPedido(pedido: PedidoDaConta, agora: Instant) {
  return {
    state: estadoDoPedidoNoApp(pedido.decisao, pedido.encontro, agora),
    requested_at: comoIso(pedido.pedidoEm),
  };
}

function recusaDoPedido(code: 'event_ended' | 'join_request_final') {
  return problemas.validacao(
    [{ field: 'eventSlug', code, message: code === 'event_ended' ? 'O encontro ja terminou.' : 'O pedido nao pode mais mudar.' }],
    code === 'event_ended' ? 'O encontro ja terminou.' : 'O pedido nao pode mais mudar.',
  );
}

export function registrarRotasDaRede(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDaRede,
): void {
  const porConta = { resolvedores: { account: (request: FastifyRequest) => contaDoTeto(request, deps) } };

  const corpoDaCriacao = corpoDe(deps.contrato, rotaDaCriacaoDeEncontro.operationId);
  registrarRota(
    app,
    rotaDaCriacaoDeEncontro,
    {
      schema: { body: corpoDaCriacao },
      resolvedores: porConta.resolvedores,
      preValidation: [recusarCampoDesconhecido(corpoDaCriacao, rotaDaCriacaoDeEncontro.operationId)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const escrito = await deps.escritas.criar(
        await contextoDoAutor(request, deps),
        request.body as CorpoDoEncontroDaComunidade,
      );
      return reply
        .status(201)
        .header('ETag', escrito.etag)
        .header('Cache-Control', SEM_CACHE)
        .send(escrito.recurso);
    },
  );

  const corpoDaEdicao = corpoDe(deps.contrato, rotaDaEdicaoDoEncontro.operationId);
  registrarRota(
    app,
    rotaDaEdicaoDoEncontro,
    {
      schema: { body: corpoSemPadroes(corpoDaEdicao) },
      resolvedores: porConta.resolvedores,
      preValidation: [recusarCampoDesconhecido(corpoDaEdicao, rotaDaEdicaoDoEncontro.operationId)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventSlug } = (request.params ?? {}) as CaminhoDoEncontro;
      const escrito = await deps.escritas.editar(
        await contextoDoAutor(request, deps),
        eventSlug,
        request.headers['if-match'],
        request.body as PatchDoEncontroDaComunidade,
      );
      return reply
        .header('ETag', escrito.etag)
        .header('Cache-Control', SEM_CACHE)
        .send(escrito.recurso);
    },
  );

  const corpoDoCancelamento = corpoDe(deps.contrato, rotaDoCancelamentoDoEncontro.operationId);
  registrarRota(
    app,
    rotaDoCancelamentoDoEncontro,
    {
      schema: { body: corpoDoCancelamento },
      resolvedores: porConta.resolvedores,
      preValidation: [
        recusarCampoDesconhecido(corpoDoCancelamento, rotaDoCancelamentoDoEncontro.operationId),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { eventSlug } = (request.params ?? {}) as CaminhoDoEncontro;
      const escrito = await deps.escritas.cancelar(
        await contextoDoAutor(request, deps),
        eventSlug,
        request.headers['if-match'],
        request.body as CorpoDoCancelamentoDaComunidade,
      );
      return reply
        .header('ETag', escrito.etag)
        .header('Cache-Control', SEM_CACHE)
        .send(escrito.recurso);
    },
  );

  registrarRota(app, rotaDaAgenda, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query ?? {}) as QueryDaAgenda;
    const page = query.page ?? PAGINA_INICIAL;
    const limit = query.limit ?? TAMANHO_PADRAO;
    const when = query.when ?? RECORTE_PADRAO;
    const sort = (query.sort as OrdemDaAgenda | undefined) ?? ordemPadraoDe(when);
    const filtros = filtrosDaAgenda(query);
    const agora = deps.clock.now();

    const pagina = await deps.rede.listarAgenda({
      ...filtros,
      visibility: query.visibility,
      status: query.status,
      when,
      sort,
      agora,
      page,
      limit,
    });

    return reply.send({
      items: pagina.itens.map((encontro) => projetarEncontro(encontro, agora)),
      page,
      limit,
      total: pagina.total,
      effective_sort: sort,
      effective_when: when,
      applied_filters: recortesAplicados({ ...filtros, visibility: query.visibility, status: query.status }),
    });
  });

  registrarRota(app, rotaDoEncontro, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const { eventSlug } = (request.params ?? {}) as CaminhoDoEncontro;
    const encontro = await deps.rede.buscarEncontro(eventSlug);
    if (encontro === undefined) throw problemas.naoEncontrado();
    const publicada = await deps.paginas.estaPublicada('network_event');
    return reply.send(
      projetarEncontro(encontro, deps.clock.now(), {
        baseDaWeb: deps.baseDaWeb,
        publicada,
      }),
    );
  });

  registrarRota(
    app,
    rotaDaAgendaPorDistancia,
    porConta,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await identidadeDoChamador(request, deps);
      const query = (request.query ?? {}) as QueryDaAgenda;
      const page = query.page ?? PAGINA_INICIAL;
      const limit = query.limit ?? TAMANHO_PADRAO;
      const when = query.when ?? RECORTE_PADRAO;
      const pedida = query.sort === 'proximos' ? 'proximos' : 'distancia';
      const filtros = filtrosDaAgenda(query);
      const agora = deps.clock.now();

      const pagina = await deps.rede.listarPorDistancia({
        ...filtros,
        chamador: chamador.userId,
        familia: chamador.familia,
        when,
        sort: pedida,
        maxKm: query.max_km,
        agora,
        page,
        limit,
      });

      const efetiva = pagina.temRegiao ? pedida : 'proximos';
      return reply.send({
        items: pagina.itens.map(({ encontro, distanciaM }) => ({
          ...(projetarEncontro(encontro, agora) as EncontroPublicoProjetado),
          distance_m: distanciaArredondada(distanciaM),
        })),
        page,
        limit,
        total: pagina.total,
        effective_sort: efetiva,
        effective_when: when,
        applied_filters: recortesAplicados({
          ...filtros,
          max_km: pagina.temRegiao && query.max_km !== undefined ? String(query.max_km) : undefined,
        }),
      });
    },
  );

  registrarRota(app, rotaDoLocal, porConta, async (request: FastifyRequest, reply: FastifyReply) => {
    const chamador = await chamadorAutenticado(request, deps);
    const { eventSlug } = (request.params ?? {}) as CaminhoDoEncontro;
    const local = await deps.rede.buscarLocalDoEncontro(eventSlug, chamador);
    if (local === undefined) throw problemas.naoEncontrado();
    return reply.header('Cache-Control', SEM_CACHE).send(projetarLocalizacao(local.ponto, local.endereco));
  });

  registrarRota(
    app,
    rotaDosDetalhesPrivados,
    porConta,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const { eventSlug } = (request.params ?? {}) as CaminhoDoEncontro;
      const encontro = await deps.rede.buscarDetalhesPrivados(eventSlug, chamador);
      if (encontro === undefined) throw problemas.naoEncontrado();
      return reply
        .header('Cache-Control', SEM_CACHE)
        .send(projetarDetalhesPrivados(encontro, deps.clock.now()));
    },
  );

  registrarRota(app, rotaDoPedido, porConta, async (request: FastifyRequest, reply: FastifyReply) => {
    const chamador = await chamadorAutenticado(request, deps);
    const { eventSlug } = (request.params ?? {}) as CaminhoDoEncontro;
    const agora = deps.clock.now();
    const desfecho = await deps.rede.pedirParaParticipar(eventSlug, chamador, agora);
    if (desfecho.tipo === 'nao_encontrado') throw problemas.naoEncontrado();
    if (desfecho.tipo === 'encerrado') throw recusaDoPedido('event_ended');
    return reply.header('Cache-Control', SEM_CACHE).send(projetarPedido(desfecho.pedido, agora));
  });

  registrarRota(app, rotaDoMeuPedido, porConta, async (request: FastifyRequest, reply: FastifyReply) => {
    const chamador = await chamadorAutenticado(request, deps);
    const { eventSlug } = (request.params ?? {}) as CaminhoDoEncontro;
    const pedido = await deps.rede.lerMeuPedido(eventSlug, chamador);
    if (pedido === undefined) throw problemas.naoEncontrado();
    return reply.header('Cache-Control', SEM_CACHE).send(projetarPedido(pedido, deps.clock.now()));
  });

  registrarRota(
    app,
    rotaDaDesistencia,
    porConta,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const { eventSlug } = (request.params ?? {}) as CaminhoDoEncontro;
      const desfecho = await deps.rede.desistirDoPedido(eventSlug, chamador, deps.clock.now());
      if (desfecho.tipo === 'nao_encontrado') throw problemas.naoEncontrado();
      if (desfecho.tipo === 'final') throw recusaDoPedido('join_request_final');
      return reply
        .header('Cache-Control', SEM_CACHE)
        .send({ state: 'withdrawn', requested_at: comoIso(desfecho.pedidoEm) });
    },
  );

  registrarRota(
    app,
    rotaDosMeusEncontros,
    porConta,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const query = (request.query ?? {}) as QueryDaPagina;
      const page = query.page ?? PAGINA_INICIAL;
      const limit = query.limit ?? TAMANHO_PADRAO;
      const agora = deps.clock.now();
      const pagina = await deps.rede.listarMeusEncontros({ chamador, status: query.status, agora, page, limit });
      return reply.header('Cache-Control', SEM_CACHE).send({
        items: pagina.itens.map((item) => projetarMeuEncontro(item.encontro, item.capa, agora)),
        page,
        limit,
        total: pagina.total,
      });
    },
  );

  registrarRota(app, rotaDoMeuEncontro, porConta, async (request: FastifyRequest, reply: FastifyReply) => {
    const chamador = await chamadorAutenticado(request, deps);
    const { eventSlug } = (request.params ?? {}) as CaminhoDoEncontro;
    const meu = await deps.rede.buscarMeuEncontro(eventSlug, chamador);
    if (meu === undefined) throw problemas.naoEncontrado();
    return reply
      .header('ETag', comoEtag(meu.versao))
      .header('Cache-Control', SEM_CACHE)
      .send(projetarMeuEncontro(meu.encontro, meu.capa, deps.clock.now()));
  });

  registrarRota(
    app,
    rotaDosMeusPedidos,
    porConta,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const query = (request.query ?? {}) as QueryDosMeusPedidos;
      const page = query.page ?? PAGINA_INICIAL;
      const limit = query.limit ?? TAMANHO_PADRAO;
      const q = aparado(query.q);
      const agora = deps.clock.now();
      const pagina = await deps.rede.listarMeusPedidos({
        chamador,
        q,
        estado: query.state,
        agora,
        page,
        limit,
      });
      return reply.header('Cache-Control', SEM_CACHE).send({
        items: pagina.itens.map((pedido) => ({
          event: projetarTeaser(pedido.encontro, agora),
          ...projetarPedido(pedido, agora),
        })),
        page,
        limit,
        total: pagina.total,
        effective_sort: 'proximos',
        applied_filters: recortesAplicados({ q, state: query.state }),
      });
    },
  );
}
