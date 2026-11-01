import type { FastifyReply, FastifyRequest } from 'fastify';

import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import { defineRoute, type RateLimitEntry } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { atorAdministrativoDe } from '../../../../shared/http/superficie-administrativa.js';
import type {
  CategoriaDaVitrine,
  EspecieDoItem,
  EstadoDoPreco,
  SubcategoriaDaVitrine,
} from '../../domain/item-da-vitrine.js';
import type { EstadoDePublicacao } from '../../domain/escrita-da-vitrine.js';
import type {
  CatalogoAdministrativo,
  CorpoDeIntencao,
  CorpoDeItem,
  CorpoDeParceiro,
  CorpoDeTag,
  PatchDeItem,
  PatchDeParceiro,
  PatchDeTag,
} from '../../application/catalogo-administrativo.js';
import type { OrdemDoPainel } from '../../ports/catalogo-administrativo.js';

const BALDE_DE_ESCRITA = {
  bucket: 'admin_write',
  dimension: ['account'],
  limit: 120,
  window: '10m',
  onExceed: 'deny_429',
} as const satisfies RateLimitEntry;

const BALDE_DE_PUBLICACAO = {
  bucket: 'admin_publication',
  dimension: ['account'],
  limit: 30,
  window: '1h',
  onExceed: 'deny_429',
} as const satisfies RateLimitEntry;

const ADMIN = ['admin'] as const;

export const rotaDeListarParceiros = defineRoute({
  operationId: 'listAdminStorePartners',
  method: 'get',
  path: '/admin/store/partners',
  effects: [],
  adminRoles: ADMIN,
});

export const rotaDeCriarParceiro = defineRoute({
  operationId: 'createAdminStorePartner',
  method: 'post',
  path: '/admin/store/partners',
  effects: [],
  adminRoles: ADMIN,
  audit: { action: 'admin.store_partner.created', resourceKind: 'store_partner' },
  rateLimit: [BALDE_DE_ESCRITA],
});

export const rotaDeLerParceiro = defineRoute({
  operationId: 'getAdminStorePartner',
  method: 'get',
  path: '/admin/store/partners/:partnerSlug',
  effects: [],
  adminRoles: ADMIN,
});

export const rotaDeAlterarParceiro = defineRoute({
  operationId: 'updateAdminStorePartner',
  method: 'patch',
  path: '/admin/store/partners/:partnerSlug',
  effects: [],
  adminRoles: ADMIN,
  audit: { action: 'admin.store_partner.updated', resourceKind: 'store_partner' },
  rateLimit: [BALDE_DE_ESCRITA],
});

export const rotaDeListarTags = defineRoute({
  operationId: 'listAdminStoreTags',
  method: 'get',
  path: '/admin/store/tags',
  effects: [],
  adminRoles: ADMIN,
});

export const rotaDeCriarTag = defineRoute({
  operationId: 'createAdminStoreTag',
  method: 'post',
  path: '/admin/store/tags',
  effects: [],
  adminRoles: ADMIN,
  audit: { action: 'admin.store_tag.created', resourceKind: 'store_tag' },
  rateLimit: [BALDE_DE_ESCRITA],
});

export const rotaDeAlterarTag = defineRoute({
  operationId: 'updateAdminStoreTag',
  method: 'patch',
  path: '/admin/store/tags/:tagSlug',
  effects: [],
  adminRoles: ADMIN,
  audit: { action: 'admin.store_tag.updated', resourceKind: 'store_tag' },
  rateLimit: [BALDE_DE_ESCRITA],
});

export const rotaDeListarItens = defineRoute({
  operationId: 'listAdminStoreItems',
  method: 'get',
  path: '/admin/store/items',
  effects: [],
  adminRoles: ADMIN,
});

export const rotaDeCriarItem = defineRoute({
  operationId: 'createAdminStoreItem',
  method: 'post',
  path: '/admin/store/items',
  effects: [],
  adminRoles: ADMIN,
  audit: { action: 'admin.store_item.created', resourceKind: 'store_item' },
  rateLimit: [BALDE_DE_ESCRITA],
});

export const rotaDeLerItem = defineRoute({
  operationId: 'getAdminStoreItem',
  method: 'get',
  path: '/admin/store/items/:itemSlug',
  effects: [],
  adminRoles: ADMIN,
});

export const rotaDeAlterarItem = defineRoute({
  operationId: 'updateAdminStoreItem',
  method: 'patch',
  path: '/admin/store/items/:itemSlug',
  effects: [],
  adminRoles: ADMIN,
  audit: { action: 'admin.store_item.updated', resourceKind: 'store_item' },
  rateLimit: [BALDE_DE_ESCRITA],
});

export const rotaDePublicarItem = defineRoute({
  operationId: 'publishAdminStoreItem',
  method: 'put',
  path: '/admin/store/items/:itemSlug/publication',
  effects: [],
  adminRoles: ADMIN,
  audit: { action: 'admin.store_item.published', resourceKind: 'store_item' },
  rateLimit: [BALDE_DE_PUBLICACAO, BALDE_DE_ESCRITA],
});

/**
 * Retirar item publicado exige `X-Admin-Reauth-Token` do escopo
 * `store_item_retirement` (D40).
 */
export const rotaDeRetirarItem = defineRoute({
  operationId: 'retireAdminStoreItem',
  method: 'delete',
  path: '/admin/store/items/:itemSlug/publication',
  effects: [],
  adminRoles: ADMIN,
  audit: { action: 'admin.store_item.retired', resourceKind: 'store_item' },
  rateLimit: [BALDE_DE_ESCRITA],
});

/**
 * `irreversible_write` e o efeito que o contrato declara: a politica assinada vale
 * dez minutos e nao se revoga.
 */
export const rotaDeIntencaoDeImagemDeCatalogo = defineRoute({
  operationId: 'createAdminCatalogImageIntent',
  method: 'post',
  path: '/admin/media/catalog-image-intents',
  effects: ['irreversible_write'],
  adminRoles: ADMIN,
  audit: { action: 'admin.catalog_image.intent_created', resourceKind: 'upload_intent' },
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

export interface DependenciasDasRotasDaLojaAdministrativa {
  readonly catalogo: CatalogoAdministrativo;
  readonly contrato: Contrato;
}

const PAGINA_INICIAL = 1;
const TAMANHO_PADRAO = 50;
const ORDEM_PADRAO: OrdemDoPainel = 'curadoria';

const contaDoTeto = (request: FastifyRequest): string | undefined => {
  const conta = request.sessaoAdministrativa?.adminAccountId;
  return conta === undefined ? undefined : `admin:${conta}`;
};

function parametro(request: FastifyRequest, nome: string): string {
  return (request.params as Record<string, string>)[nome] ?? '';
}

function ifMatch(request: FastifyRequest): string | string[] | undefined {
  return request.headers['if-match'];
}

interface QueryDeParceiros {
  readonly q?: string;
  readonly active?: boolean;
  readonly page?: number;
  readonly limit?: number;
}

interface QueryDeItens {
  readonly q?: string;
  readonly category?: CategoriaDaVitrine;
  readonly subcategory?: SubcategoriaDaVitrine;
  readonly partner?: string;
  readonly publication_state?: EstadoDePublicacao;
  readonly species?: EspecieDoItem;
  readonly tag?: string;
  readonly price_status?: EstadoDoPreco;
  readonly sort?: OrdemDoPainel;
  readonly page?: number;
  readonly limit?: number;
}

function filtrosAplicados(query: QueryDeItens): Record<string, string> {
  const aplicados: Record<string, string> = {};
  if (query.q !== undefined && query.q.trim() !== '') aplicados['q'] = query.q.trim();
  if (query.category !== undefined) aplicados['category'] = query.category;
  if (query.subcategory !== undefined) aplicados['subcategory'] = query.subcategory;
  if (query.partner !== undefined) aplicados['partner'] = query.partner;
  if (query.publication_state !== undefined) aplicados['publication_state'] = query.publication_state;
  if (query.species !== undefined) aplicados['species'] = query.species;
  if (query.tag !== undefined) aplicados['tag'] = query.tag;
  if (query.price_status !== undefined) aplicados['price_status'] = query.price_status;
  if (Object.keys(aplicados).length === 0) aplicados['scope'] = 'all';
  return aplicados;
}

export function registrarRotasDaLojaAdministrativa(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDaLojaAdministrativa,
): void {
  const { catalogo, contrato } = deps;
  const resolvedores = { account: contaDoTeto };

  registrarRota(app, rotaDeListarParceiros, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query ?? {}) as QueryDeParceiros;
    const termo = query.q?.trim();
    return reply.send(
      await catalogo.listarParceiros({
        ...(termo === undefined || termo === '' ? {} : { q: termo }),
        ...(query.active === undefined ? {} : { active: query.active }),
        page: query.page ?? PAGINA_INICIAL,
        limit: query.limit ?? TAMANHO_PADRAO,
      }),
    );
  });

  registrarRota(
    app,
    rotaDeCriarParceiro,
    { schema: { body: corpoDe(contrato, rotaDeCriarParceiro.operationId) }, resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const criado = await catalogo.criarParceiro(atorAdministrativoDe(request), request.body as CorpoDeParceiro);
      return reply.status(201).header('ETag', criado.etag).send(criado.recurso);
    },
  );

  registrarRota(app, rotaDeLerParceiro, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const lido = await catalogo.lerParceiro(parametro(request, 'partnerSlug'));
    return reply.header('ETag', lido.etag).send(lido.recurso);
  });

  registrarRota(
    app,
    rotaDeAlterarParceiro,
    { schema: { body: corpoDe(contrato, rotaDeAlterarParceiro.operationId) }, resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const alterado = await catalogo.alterarParceiro(
        atorAdministrativoDe(request),
        parametro(request, 'partnerSlug'),
        ifMatch(request),
        request.body as PatchDeParceiro,
      );
      return reply.header('ETag', alterado.etag).send(alterado.recurso);
    },
  );

  registrarRota(app, rotaDeListarTags, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query ?? {}) as QueryDeParceiros;
    const termo = query.q?.trim();
    return reply.send(
      await catalogo.listarTags({
        ...(termo === undefined || termo === '' ? {} : { q: termo }),
        ...(query.active === undefined ? {} : { active: query.active }),
        page: query.page ?? PAGINA_INICIAL,
        limit: query.limit ?? TAMANHO_PADRAO,
      }),
    );
  });

  registrarRota(
    app,
    rotaDeCriarTag,
    { schema: { body: corpoDe(contrato, rotaDeCriarTag.operationId) }, resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const criada = await catalogo.criarTag(atorAdministrativoDe(request), request.body as CorpoDeTag);
      return reply.status(201).header('ETag', criada.etag).send(criada.recurso);
    },
  );

  registrarRota(
    app,
    rotaDeAlterarTag,
    { schema: { body: corpoDe(contrato, rotaDeAlterarTag.operationId) }, resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const alterada = await catalogo.alterarTag(
        atorAdministrativoDe(request),
        parametro(request, 'tagSlug'),
        ifMatch(request),
        request.body as PatchDeTag,
      );
      return reply.header('ETag', alterada.etag).send(alterada.recurso);
    },
  );

  registrarRota(app, rotaDeListarItens, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query ?? {}) as QueryDeItens;
    const termo = query.q?.trim();
    const pagina = await catalogo.listarItens({
      ...(termo === undefined || termo === '' ? {} : { q: termo }),
      ...(query.category === undefined ? {} : { category: query.category }),
      ...(query.subcategory === undefined ? {} : { subcategory: query.subcategory }),
      ...(query.partner === undefined ? {} : { partnerSlug: query.partner }),
      ...(query.publication_state === undefined ? {} : { publicationState: query.publication_state }),
      ...(query.species === undefined ? {} : { species: query.species }),
      ...(query.tag === undefined ? {} : { tagSlug: query.tag }),
      ...(query.price_status === undefined ? {} : { priceStatus: query.price_status }),
      sort: query.sort ?? ORDEM_PADRAO,
      page: query.page ?? PAGINA_INICIAL,
      limit: query.limit ?? TAMANHO_PADRAO,
    });
    return reply.send({ ...pagina, applied_filters: filtrosAplicados(query) });
  });

  registrarRota(
    app,
    rotaDeCriarItem,
    { schema: { body: corpoDe(contrato, rotaDeCriarItem.operationId) }, resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const criado = await catalogo.criarItem(atorAdministrativoDe(request), request.body as CorpoDeItem);
      return reply.status(201).header('ETag', criado.etag).send(criado.recurso);
    },
  );

  registrarRota(app, rotaDeLerItem, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const lido = await catalogo.lerItem(parametro(request, 'itemSlug'));
    return reply.header('ETag', lido.etag).send(lido.recurso);
  });

  registrarRota(
    app,
    rotaDeAlterarItem,
    { schema: { body: corpoDe(contrato, rotaDeAlterarItem.operationId) }, resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const alterado = await catalogo.alterarItem(
        atorAdministrativoDe(request),
        parametro(request, 'itemSlug'),
        ifMatch(request),
        request.body as PatchDeItem,
      );
      return reply.header('ETag', alterado.etag).send(alterado.recurso);
    },
  );

  registrarRota(app, rotaDePublicarItem, { resolvedores }, async (request: FastifyRequest, reply: FastifyReply) => {
    const publicado = await catalogo.publicarItem(
      atorAdministrativoDe(request),
      parametro(request, 'itemSlug'),
      ifMatch(request),
    );
    return reply.header('ETag', publicado.etag).send(publicado.recurso);
  });

  registrarRota(app, rotaDeRetirarItem, { resolvedores }, async (request: FastifyRequest, reply: FastifyReply) => {
    const retirado = await catalogo.retirarItem(
      atorAdministrativoDe(request),
      parametro(request, 'itemSlug'),
      ifMatch(request),
    );
    return reply.header('ETag', retirado.etag).send(retirado.recurso);
  });

  registrarRota(
    app,
    rotaDeIntencaoDeImagemDeCatalogo,
    { schema: { body: corpoDe(contrato, rotaDeIntencaoDeImagemDeCatalogo.operationId) }, resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { uploadId, autorizacao } = await catalogo.autorizarEnvioDeCatalogo(
        atorAdministrativoDe(request),
        request.body as CorpoDeIntencao,
      );
      return reply.status(201).send({
        upload_id: uploadId,
        method: autorizacao.metodo,
        url: autorizacao.url,
        ...(autorizacao.campos === undefined ? {} : { fields: autorizacao.campos }),
        ...(autorizacao.cabecalhos === undefined ? {} : { headers: autorizacao.cabecalhos }),
        expires_at: autorizacao.expiraEm.toISOString(),
        max_bytes: autorizacao.maxBytes,
      });
    },
  );
}
