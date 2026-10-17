/**
 * As rotas da secao `Rede` no app (ADR-0025, ADR-0027 secao 12).
 *
 * ## Duas leituras alcancaveis sem conta, e o resto so com conta
 *
 * `listNetworkEvents` e publica e `getNetworkEvent` tem autenticacao opcional:
 * a `Rede` e navegavel deslogado. Nenhuma das duas carrega coordenada, e o
 * encontro privado sai nelas como teaser (so titulo, data local e estado) para
 * qualquer chamador, inclusive o aprovado. A forma vem do EVENTO, e nao de quem
 * pergunta (ADR-0021).
 *
 * As outras sete exigem conta (`bearerAuth` sem alternativa vazia): o ponto, a
 * agenda por distancia, o conteudo do privado, o pedido para participar (criar,
 * ler, desistir) e "meus pedidos". **O 401 vem antes de qualquer consulta**:
 * sem conta nao se descobre nem se o `slug` existe.
 *
 * ## O que este arquivo nao decide
 *
 * Quem pode ver o conteudo do privado e decidido na clausula `WHERE` do
 * repositorio (um `EXISTS` sobre o pedido aprovado), e nao aqui. O estado que o
 * app ve e derivado no dominio, e o recusado e o pendente caem no mesmo ramo
 * la. A validacao de query e de caminho vem do contrato, pelo `operationId`.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import { recusarCampoDesconhecido } from '../../../../shared/http/corpo-fechado.js';
import { comoIso } from '../../../../shared/time/clock.js';
import {
  distanciaArredondada,
  estadoDoPedidoNoApp,
  projetarDetalhesPrivados,
  projetarEncontro,
  projetarLocalizacao,
  projetarTeaser,
  type EncontroPublicoProjetado,
} from '../../domain/encontro-da-rede.js';
import type {
  NetworkRepository,
  OrdemDaAgenda,
  PedidoDaConta,
  RecorteNoTempo,
} from '../../ports/network-repository.js';
import type { Contrato } from '../../../../shared/http/contract.js';
import type { Clock } from '../../../../shared/ports/index.js';
import type { CriacaoDeEncontroPelaComunidade } from '../../application/criar-encontro-da-comunidade.js';
import type { CorpoDoEncontroDaComunidade } from '../../domain/encontro-da-comunidade.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';

/** Os tetos sao os do contrato, COPIADOS de la. Um teto e uma dimensao por rota. */
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

/**
 * `account`, e nao `ip` (ADR-0027 12.5). O mesmo teto do detalhe: a tela do
 * encontro chama as operacoes a cada abertura.
 */
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

export const rotaDosMeusPedidos = defineRoute({
  operationId: 'listMyNetworkEventJoinRequests',
  method: 'get',
  path: '/network/join-requests',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

/**
 * A proposta de encontro pela comunidade (ADR-0025 emenda 3).
 *
 * `human_work` e verdade e precisa estar declarado: a proposta nasce
 * `pending_review` e **cria trabalho de revisao humana no painel**. Com efeito
 * nao vazio, `defineRoute` torna a ausencia de `rateLimit` erro de compilacao
 * (ADR-0016).
 *
 * Cinco por dia por conta, e nao por `ip`: a rota exige conta, entao `account`
 * existe e e exato, e o CGNAT das operadoras brasileiras faria um teto por IP
 * pegar vizinho inocente. **Este teto nao e o teto de 3 em revisao**: ele conta
 * CHAMADAS e a porta de teto nao sabe contar linhas (a mesma limitacao de D56).
 * Quem conta encontros em revisao e o caso de uso.
 */
export const rotaDaPropostaDeEncontro = defineRoute({
  operationId: 'createNetworkEvent',
  method: 'post',
  path: '/network/events',
  effects: ['human_work'],
  rateLimit: [{ dimension: ['account'], limit: 5, window: '24h', onExceed: 'deny_429' }],
});

const PAGINA_INICIAL = 1;
const TAMANHO_PADRAO = 20;
const RECORTE_PADRAO: RecorteNoTempo = 'upcoming';
const SEM_CACHE = 'private, no-store';

/**
 * O default de `sort` **depende de `when`**: com `past` e `recentes`, com os
 * outros e `proximos`. E por isso que `effective_sort` existe na resposta.
 */
export function ordemPadraoDe(quando: RecorteNoTempo): OrdemDaAgenda {
  return quando === 'past' ? 'recentes' : 'proximos';
}

export interface Autenticador {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDaRede {
  readonly rede: NetworkRepository;
  readonly autenticador: Autenticador;
  readonly clock: Clock;
  /** O caso de uso da proposta de encontro (ADR-0025 emenda 3). */
  readonly propostas: CriacaoDeEncontroPelaComunidade;
  /** De onde sai o esquema do corpo: a declaracao e a do contrato. */
  readonly contrato: Contrato;
}

function corpoDe(contrato: Contrato, operationId: string): Record<string, unknown> {
  const schema = contrato.requestBodySchema(operationId);
  if (schema === undefined) {
    throw new Error(
      `Operação ${operationId} não declara corpo de requisição em application/json ` +
        'no contrato, mas a rota espera um. Corrija a especificação, não o código.',
    );
  }
  return schema;
}

interface QueryDaAgenda {
  readonly q?: string;
  readonly city?: string;
  readonly when?: RecorteNoTempo;
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

interface CaminhoDoEncontro {
  readonly eventSlug: string;
}

function aparado(valor: string | undefined): string | undefined {
  const t = valor?.trim();
  return t === undefined || t === '' ? undefined : t;
}

/**
 * O recorte que de fato valeu, para a tela escrever. `scope: all` quando nada
 * foi recortado. `when` e `sort` tem campo proprio.
 */
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

/** O token do cabecalho, sem decidir nada sobre ele. */
function tokenDaRequisicao(request: FastifyRequest): string | undefined {
  const cabecalho = request.headers.authorization;
  if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) return undefined;
  const token = cabecalho.slice('Bearer '.length).trim();
  return token === '' ? undefined : token;
}

/** MEMOIZADO: o teto por `account` e o manipulador precisam do mesmo dono. */
function chamadorAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDaRede,
): Promise<UserId> {
  return memoDaRequisicao(request, 'rede:chamador', async () => {
    const token = tokenDaRequisicao(request);
    if (token === undefined) throw problemas.naoAutenticado();
    // O 401 de token vencido ou forjado e do servico de identidade. Nao ha
    // `catch`: engolir o erro transformaria falha de banco em 401.
    return (await deps.autenticador.autenticar(token)).userId;
  });
}

/** `account` para o teto. Sem credencial valida nao ha balde de conta. */
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

/** O pedido no vocabulario do app. Os mesmos campos para pendente e recusado. */
function projetarPedido(pedido: PedidoDaConta, agora: Instant) {
  return {
    state: estadoDoPedidoNoApp(pedido.decisao, pedido.encontro, agora),
    requested_at: comoIso(pedido.pedidoEm),
  };
}

/**
 * O 400 das regras de estado do pedido. `code` e fixo por regra e nao depende
 * da decisao guardada: o pendente e o recusado recebem o mesmo corpo.
 */
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

  /**
   * A proposta. **201 e nao 200**, e o corpo e o recibo: o encontro existe, e
   * nenhuma leitura publica o enxerga ainda. O `Cache-Control` e o mesmo
   * `no-store` das outras respostas de conta.
   *
   * ## O guarda de corpo fechado NAO e opcional aqui
   *
   * O Fastify monta o Ajv com `removeAdditional: true`: `additionalProperties:
   * false` no contrato **apaga** o campo desconhecido em silencio em vez de
   * recusar (ver `corpo-fechado.ts`, medido em 23/09). Nesta operacao isso
   * seria mentir sobre o que foi gravado em cada um dos campos que ela NAO
   * aceita: quem mandasse `visibility: private` receberia 201 e um encontro
   * PUBLICO, e quem mandasse `street_address` acreditaria ter dado o endereco.
   * `registrarRota` instala o guarda sozinho so na superficie administrativa,
   * entao aqui ele entra a mao.
   */
  const corpoDaProposta = corpoDe(deps.contrato, rotaDaPropostaDeEncontro.operationId);
  registrarRota(
    app,
    rotaDaPropostaDeEncontro,
    {
      schema: { body: corpoDaProposta },
      resolvedores: porConta.resolvedores,
      preValidation: [
        recusarCampoDesconhecido(corpoDaProposta, rotaDaPropostaDeEncontro.operationId),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const envio = await deps.propostas.propor(
        { userId: chamador, correlationId: request.id, ip: request.ip },
        request.body as CorpoDoEncontroDaComunidade,
      );
      return reply.status(201).header('Cache-Control', SEM_CACHE).send(envio);
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
      applied_filters: recortesAplicados({ ...filtros, visibility: query.visibility }),
    });
  });

  registrarRota(app, rotaDoEncontro, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const { eventSlug } = (request.params ?? {}) as CaminhoDoEncontro;
    const encontro = await deps.rede.buscarEncontro(eventSlug);
    if (encontro === undefined) throw problemas.naoEncontrado();
    return reply.send(projetarEncontro(encontro, deps.clock.now()));
  });

  registrarRota(
    app,
    rotaDaAgendaPorDistancia,
    porConta,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const query = (request.query ?? {}) as QueryDaAgenda;
      const page = query.page ?? PAGINA_INICIAL;
      const limit = query.limit ?? TAMANHO_PADRAO;
      const when = query.when ?? RECORTE_PADRAO;
      const pedida = query.sort === 'proximos' ? 'proximos' : 'distancia';
      const filtros = filtrosDaAgenda(query);
      const agora = deps.clock.now();

      const pagina = await deps.rede.listarPorDistancia({
        ...filtros,
        chamador,
        when,
        sort: pedida,
        maxKm: query.max_km,
        agora,
        page,
        limit,
      });

      // Sem regiao nao ha distancia: a ordem efetiva e a de data, e a resposta
      // diz isso em vez de fingir que ordenou.
      const efetiva = pagina.temRegiao ? pedida : 'proximos';
      return reply.send({
        items: pagina.itens.map(({ encontro, distanciaM }) => ({
          // A consulta so devolve publico; o `as` registra isso para o tipo.
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
    // Invisivel, inexistente e privado sem aprovacao: o mesmo 404.
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
      // Nao e privado, nao existe, ou a conta nao foi aprovada: um 404 so.
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
