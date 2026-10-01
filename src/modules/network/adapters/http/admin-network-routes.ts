/**
 * `/v1/admin/network/...`: a escrita administrativa da `Rede` e a fila de
 * pedidos (BICHUS-273 e BICHUS-292; ADR-0027 itens 7, 8, 11, 12 e 17).
 *
 * ## O que NAO esta aqui, porque ja aconteceu antes
 *
 * Estas rotas so sobem dentro de `escoparRotasAdministrativas`: a guarda do
 * escopo confere superficie, cookie de sessao, `Origin`, `X-CSRF-Token` e o
 * papel de `adminRoles` antes de qualquer gancho daqui. `registrarRota`
 * instala o portao de `X-Admin-Reauth-Token` a partir de `adminReauthScope`
 * (mover, mudar acesso, cancelar, remover) e consome a janela antes do caso de
 * uso. **Nenhuma verificacao de papel mora aqui nem no caso de uso.**
 *
 * ## A declaracao e a do contrato
 *
 * Papel, trilha, escopo de reautenticacao e teto sao copiados do contrato, e
 * `rotas-registradas-contra-o-contrato` os compara. O teto por linhas da fila
 * (`counts: rows_returned`, D56) nao e exprimivel pela porta de teto de
 * requisicoes: ele e declarado aqui como o contrato o escreve, a subida o lista
 * como nao aplicado pela porta, e quem o aplica e o caso de uso, somando da
 * trilha.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import type { Contrato } from '../../../../shared/http/contract.js';
import { defineRoute, type RateLimitEntry } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { atorAdministrativoDe } from '../../../../shared/http/superficie-administrativa.js';
import type {
  CorpoDeCancelamento,
  CorpoDeEncontro,
  CorpoDeMudancaDeAcesso,
  CorpoDeMudancaDeLugar,
  PatchDeEncontro,
  RedeAdministrativa,
} from '../../application/rede-administrativa.js';
import type {
  DecisaoDoPedido,
  PublicacaoAdministrativa,
  TempoDoEncontro,
  Visibilidade,
} from '../../domain/escrita-do-encontro.js';

/** D52: 120 escritas em 10 minutos por conta, somadas todas as escritas administrativas. */
const BALDE_DE_ESCRITA = {
  bucket: 'admin_write',
  dimension: ['account'],
  limit: 120,
  window: '10m',
  onExceed: 'deny_429',
} as const satisfies RateLimitEntry;

/** D52: 30 publicacoes por hora por conta, somadas publicacao de item e criacao de evento. */
const BALDE_DE_PUBLICACAO = {
  bucket: 'admin_publication',
  dimension: ['account'],
  limit: 30,
  window: '1h',
  onExceed: 'deny_429',
} as const satisfies RateLimitEntry;

const ADMIN = ['admin'] as const;

export const rotaDeListarEncontros = defineRoute({
  operationId: 'listAdminNetworkEvents',
  method: 'get',
  path: '/admin/network/events',
  effects: [],
  adminRoles: ADMIN,
});

export const rotaDeCriarEncontro = defineRoute({
  operationId: 'createAdminNetworkEvent',
  method: 'post',
  path: '/admin/network/events',
  effects: ['notifies'],
  adminRoles: ADMIN,
  audit: { action: 'admin.network_event.created', resourceKind: 'network_event' },
  rateLimit: [BALDE_DE_PUBLICACAO, BALDE_DE_ESCRITA],
});

export const rotaDeLerEncontro = defineRoute({
  operationId: 'getAdminNetworkEvent',
  method: 'get',
  path: '/admin/network/events/:eventSlug',
  effects: [],
  adminRoles: ADMIN,
});

export const rotaDeAlterarEncontro = defineRoute({
  operationId: 'updateAdminNetworkEvent',
  method: 'patch',
  path: '/admin/network/events/:eventSlug',
  effects: ['notifies'],
  adminRoles: ADMIN,
  audit: { action: 'admin.network_event.updated', resourceKind: 'network_event' },
  rateLimit: [BALDE_DE_ESCRITA],
});

export const rotaDeRemoverEncontro = defineRoute({
  operationId: 'removeAdminNetworkEvent',
  method: 'delete',
  path: '/admin/network/events/:eventSlug',
  effects: ['irreversible_write'],
  adminRoles: ADMIN,
  audit: { action: 'admin.network_event.removed', resourceKind: 'network_event' },
  adminReauthScope: 'network_event_removal',
  rateLimit: [BALDE_DE_ESCRITA],
});

/**
 * Mover (T11). **Compatibilidade desde 01/10/2026:** o painel deixou de usar o
 * mapa, e o `place.point` desta rota fica so para quem ainda o manda. A rota
 * continua sendo o unico caminho para mudar o lugar de um encontro existente,
 * inclusive o `street_address`, com reautenticacao, motivo e aviso.
 */
export const rotaDeMoverEncontro = defineRoute({
  operationId: 'relocateAdminNetworkEvent',
  method: 'post',
  path: '/admin/network/events/:eventSlug/relocation',
  effects: ['notifies'],
  adminRoles: ADMIN,
  audit: { action: 'admin.network_event.relocated', resourceKind: 'network_event' },
  adminReauthScope: 'network_event_relocation',
  rateLimit: [BALDE_DE_ESCRITA],
});

export const rotaDeCancelarEncontro = defineRoute({
  operationId: 'cancelAdminNetworkEvent',
  method: 'post',
  path: '/admin/network/events/:eventSlug/cancellation',
  effects: ['notifies'],
  adminRoles: ADMIN,
  audit: { action: 'admin.network_event.cancelled', resourceKind: 'network_event' },
  adminReauthScope: 'network_event_cancellation',
  rateLimit: [BALDE_DE_ESCRITA],
});

export const rotaDeMudarAcesso = defineRoute({
  operationId: 'changeAdminNetworkEventAccess',
  method: 'post',
  path: '/admin/network/events/:eventSlug/access',
  effects: ['notifies'],
  adminRoles: ADMIN,
  audit: { action: 'admin.network_event.access_changed', resourceKind: 'network_event' },
  adminReauthScope: 'network_event_access_change',
  rateLimit: [BALDE_DE_ESCRITA],
});

/**
 * A unica leitura administrativa com trilha (D55). O teto por linhas (D56) e
 * aplicado no caso de uso, porque a porta de teto conta requisicoes e nao linhas.
 */
export const rotaDeListarPedidos = defineRoute({
  operationId: 'listAdminNetworkJoinRequests',
  method: 'get',
  path: '/admin/network/join-requests',
  effects: [],
  adminRoles: ADMIN,
  audit: { action: 'admin.network_join_request.listed', resourceKind: 'network_join_request' },
  rateLimit: [
    { dimension: ['account'], counts: 'rows_returned', limit: 300, window: '1h', onExceed: 'deny_429' },
  ],
});

export const rotaDeAprovarPedido = defineRoute({
  operationId: 'approveAdminNetworkJoinRequest',
  method: 'post',
  path: '/admin/network/join-requests/:requestRef/approval',
  effects: ['notifies'],
  adminRoles: ADMIN,
  audit: { action: 'admin.network_join_request.approved', resourceKind: 'network_join_request' },
  rateLimit: [BALDE_DE_ESCRITA],
});

export const rotaDeRecusarPedido = defineRoute({
  operationId: 'declineAdminNetworkJoinRequest',
  method: 'post',
  path: '/admin/network/join-requests/:requestRef/decline',
  effects: [],
  adminRoles: ADMIN,
  audit: { action: 'admin.network_join_request.declined', resourceKind: 'network_join_request' },
  rateLimit: [BALDE_DE_ESCRITA],
});

export interface DependenciasDasRotasDaRedeAdministrativa {
  readonly rede: RedeAdministrativa;
  readonly contrato: Contrato;
}

const PAGINA_INICIAL = 1;
const TAMANHO_PADRAO = 50;

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

const contaDoTeto = (request: FastifyRequest): string | undefined => {
  const conta = request.sessaoAdministrativa?.adminAccountId;
  // `admin:`, e nao `account:`: um balde do painel e um do app nunca dividem
  // chave (ADR-0027 item 20.2).
  return conta === undefined ? undefined : `admin:${conta}`;
};

function parametro(request: FastifyRequest, nome: string): string {
  return (request.params as Record<string, string>)[nome] ?? '';
}

function ifMatch(request: FastifyRequest): string | string[] | undefined {
  return request.headers['if-match'];
}

interface QueryDeEncontros {
  readonly q?: string;
  readonly publication_status?: PublicacaoAdministrativa;
  readonly timing?: TempoDoEncontro;
  readonly visibility?: Visibilidade;
  readonly city?: string;
  readonly sort?: 'agenda' | 'atualizado';
  readonly page?: number;
  readonly limit?: number;
}

interface QueryDaFila {
  readonly status?: DecisaoDoPedido;
  readonly event?: string;
  readonly page?: number;
  readonly limit?: number;
}

function filtrosAplicados(query: QueryDeEncontros): Record<string, string> {
  const aplicados: Record<string, string> = {};
  if (query.q !== undefined && query.q.trim() !== '') aplicados['q'] = query.q.trim();
  if (query.publication_status !== undefined) aplicados['publication_status'] = query.publication_status;
  if (query.timing !== undefined) aplicados['timing'] = query.timing;
  if (query.visibility !== undefined) aplicados['visibility'] = query.visibility;
  if (query.city !== undefined && query.city.trim() !== '') aplicados['city'] = query.city.trim();
  if (Object.keys(aplicados).length === 0) aplicados['scope'] = 'all';
  return aplicados;
}

export function registrarRotasDaRedeAdministrativa(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDaRedeAdministrativa,
): void {
  const { rede, contrato } = deps;
  const resolvedores = { account: contaDoTeto };

  registrarRota(app, rotaDeListarEncontros, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query ?? {}) as QueryDeEncontros;
    const pagina = await rede.listarEncontros({
      q: query.q,
      publicacao: query.publication_status,
      tempo: query.timing,
      visibilidade: query.visibility,
      city: query.city,
      sort: query.sort ?? 'agenda',
      page: query.page ?? PAGINA_INICIAL,
      limit: query.limit ?? TAMANHO_PADRAO,
    });
    return reply.send({ ...pagina, applied_filters: filtrosAplicados(query) });
  });

  registrarRota(
    app,
    rotaDeCriarEncontro,
    { schema: { body: corpoDe(contrato, rotaDeCriarEncontro.operationId) }, resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const criado = await rede.criarEncontro(atorAdministrativoDe(request), request.body as CorpoDeEncontro);
      return reply.status(201).header('ETag', criado.etag).send(criado.recurso);
    },
  );

  registrarRota(app, rotaDeLerEncontro, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const lido = await rede.lerEncontro(parametro(request, 'eventSlug'));
    return reply.header('ETag', lido.etag).send(lido.recurso);
  });

  registrarRota(
    app,
    rotaDeAlterarEncontro,
    { schema: { body: corpoDe(contrato, rotaDeAlterarEncontro.operationId) }, resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const alterado = await rede.alterarEncontro(
        atorAdministrativoDe(request),
        parametro(request, 'eventSlug'),
        ifMatch(request),
        request.body as PatchDeEncontro,
      );
      return reply.header('ETag', alterado.etag).send(alterado.recurso);
    },
  );

  registrarRota(app, rotaDeRemoverEncontro, { resolvedores }, async (request: FastifyRequest, reply: FastifyReply) => {
    await rede.removerEncontro(atorAdministrativoDe(request), parametro(request, 'eventSlug'), ifMatch(request));
    return reply.status(204).send();
  });

  registrarRota(
    app,
    rotaDeMoverEncontro,
    { schema: { body: corpoDe(contrato, rotaDeMoverEncontro.operationId) }, resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const movido = await rede.moverEncontro(
        atorAdministrativoDe(request),
        parametro(request, 'eventSlug'),
        ifMatch(request),
        request.body as CorpoDeMudancaDeLugar,
      );
      return reply.header('ETag', movido.etag).send(movido.recurso);
    },
  );

  registrarRota(
    app,
    rotaDeCancelarEncontro,
    { schema: { body: corpoDe(contrato, rotaDeCancelarEncontro.operationId) }, resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const cancelado = await rede.cancelarEncontro(
        atorAdministrativoDe(request),
        parametro(request, 'eventSlug'),
        ifMatch(request),
        request.body as CorpoDeCancelamento,
      );
      return reply.header('ETag', cancelado.etag).send(cancelado.recurso);
    },
  );

  registrarRota(
    app,
    rotaDeMudarAcesso,
    { schema: { body: corpoDe(contrato, rotaDeMudarAcesso.operationId) }, resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const mudado = await rede.mudarAcesso(
        atorAdministrativoDe(request),
        parametro(request, 'eventSlug'),
        ifMatch(request),
        request.body as CorpoDeMudancaDeAcesso,
      );
      return reply.header('ETag', mudado.etag).send(mudado.recurso);
    },
  );

  registrarRota(app, rotaDeListarPedidos, { resolvedores }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query ?? {}) as QueryDaFila;
    const pagina = await rede.listarFila(atorAdministrativoDe(request), {
      decisao: query.status,
      eventoSlug: query.event,
      page: query.page ?? PAGINA_INICIAL,
      limit: query.limit ?? TAMANHO_PADRAO,
    });
    // Dado de pessoa: a superficie administrativa ja responde `no-store`.
    return reply.send(pagina);
  });

  registrarRota(app, rotaDeAprovarPedido, { resolvedores }, async (request: FastifyRequest, reply: FastifyReply) => {
    const aprovado = await rede.aprovarPedido(atorAdministrativoDe(request), parametro(request, 'requestRef'));
    return reply.send(aprovado);
  });

  registrarRota(app, rotaDeRecusarPedido, { resolvedores }, async (request: FastifyRequest, reply: FastifyReply) => {
    const recusado = await rede.recusarPedido(atorAdministrativoDe(request), parametro(request, 'requestRef'));
    return reply.send(recusado);
  });
}
