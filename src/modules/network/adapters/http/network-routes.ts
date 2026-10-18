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
import { corpoSemPadroes } from '../../../../shared/http/sem-padroes.js';
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
import type { EncontroDaComunidade } from '../../application/encontro-da-comunidade.js';
import type {
  CorpoDoCancelamentoDaComunidade,
  CorpoDoEncontroDaComunidade,
  PatchDoEncontroDaComunidade,
} from '../../domain/encontro-da-comunidade.js';
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
 * As tres escritas da comunidade (ADR-0025 emenda 3).
 *
 * `irreversible_write` nas tres: criar PUBLICA na hora (nao ha revisao que
 * desfaca), editar grava versao nova e cancelar e um estado que nao volta. Com
 * efeito nao vazio, `defineRoute` torna a ausencia de `rateLimit` erro de
 * compilacao (ADR-0016).
 *
 * Os tetos sao por `account`, e nao por `ip`: as tres exigem conta, entao
 * `account` existe e e exato, e o CGNAT das operadoras brasileiras faria um
 * teto por IP pegar vizinho inocente. **O teto de criar e o mais apertado**
 * (5/24h) porque, sem revisao humana, ele e o teto de 3 ativos sao a unica
 * contencao de volume; editar e mais folgado porque corrigir um texto e comum e
 * nao publica nada novo.
 *
 * O teto de 3 encontros ativos NAO esta aqui: ele conta LINHAS, e a porta de
 * teto conta requisicoes (a mesma limitacao de D56). Quem o aplica e o caso de
 * uso.
 */
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
  /** As escritas da comunidade: criar, editar o proprio e cancelar o proprio. */
  readonly escritas: EncontroDaComunidade;
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

/** Quem escreve, para o caso de uso e para a trilha. O IP vai EM CLARO: a porta da trilha o transforma em HMAC (SEC-010). */
async function contextoDoAutor(
  request: FastifyRequest,
  deps: DependenciasDasRotasDaRede,
): Promise<{ userId: UserId; correlationId: string; ip: string | undefined }> {
  return { userId: await chamadorAutenticado(request, deps), correlationId: request.id, ip: request.ip };
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
   * Criar. **201 com o proprio encontro**, na mesma forma de `getNetworkEvent`:
   * ele existe e ja esta em publico, e o app desenha a tela com o que recebeu
   * em vez de pedir de novo.
   *
   * ## O guarda de corpo fechado NAO e opcional nestas tres rotas
   *
   * O Fastify monta o Ajv com `removeAdditional: true`: `additionalProperties:
   * false` no contrato **apaga** o campo desconhecido em silencio em vez de
   * recusar (ver `corpo-fechado.ts`, medido em 23/09). Aqui isso seria mentir
   * sobre o que foi gravado em cada campo que estas operacoes NAO aceitam: quem
   * mandasse `visibility: private` receberia 201 e um encontro PUBLICO, e quem
   * mandasse `street_address` acreditaria ter dado o endereco.
   * `registrarRota` instala o guarda sozinho so na superficie administrativa,
   * entao aqui ele entra a mao.
   */
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

  /**
   * Editar o proprio. **O 404 de encontro alheio vem da clausula `WHERE`**
   * (ADR-0021): esta borda nao sabe de quem e o encontro, e nao tem `if` que
   * decida isso.
   */
  const corpoDaEdicao = corpoDe(deps.contrato, rotaDaEdicaoDoEncontro.operationId);
  // Sem os `default` do contrato. `CommunityNetworkEventPatch` herda dois das
  // formas que a CRIACAO reusa -- `accepted_sizes` (`[P, M, G, GG]`) e
  // `dog_age` (`any`) --, e numa criacao eles estao certos: o encontro tem de
  // nascer com porte e idade. Num `PATCH` o `useDefaults` do Ajv os injeta e o
  // resultado e o contrario do que a operacao promete. Medido em 17/10/2026 com
  // `{"title": "...", "notes": "..."}`:
  //
  //   corpo visto pelo manipulador:
  //     { title, notes, accepted_sizes: [P,M,G,GG], dog_age: 'any' }
  //
  // Duas consequencias, as duas silenciosas: quem aceitava so porte P e corrige
  // o titulo sai aceitando os quatro, com `200` e sem aviso; e a trilha mente,
  // porque `fields` sai do `Object.keys` do corpo e passa a nomear campo que o
  // autor nao tocou. O porque geral esta em `sem-padroes.ts`.
  //
  // O guarda de campo desconhecido continua lendo o schema ORIGINAL -- a lista
  // de nomes aceitos nao muda, e e nela que ele se baseia.
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

  /** Cancelar o proprio. Cancelar nao apaga: ver o caso de uso. */
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
