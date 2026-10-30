/** `GET /v1/store/items` — a secao `Loja`. */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import {
  projetarDetalhe,
  projetarItem,
  type CategoriaDaVitrine,
  type EspecieDoItem,
  type SubcategoriaDaVitrine,
} from '../../domain/item-da-vitrine.js';
import { problemas } from '../../../../shared/http/errors.js';
import type { OrdemDaVitrine, StoreRepository } from '../../ports/store-repository.js';
import type { TaxonomiaDaVitrineRepository } from '../../ports/taxonomia-da-vitrine.js';
import { casaIfNoneMatch } from '../../../../shared/http/if-match.js';
import type { Clock } from '../../../../shared/ports/index.js';

/** O teto e o do contrato, copiado dele e nao escolhido aqui. */
export const rotaDaVitrine = defineRoute({
  operationId: 'listStoreItems',
  method: 'get',
  path: '/store/items',
  effects: ['expensive_query'],
  rateLimit: [{ dimension: ['ip'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

/**
 * O detalhe do item (ADR-0027 item 16), publico pelas mesmas razoes da lista e com
 * o mesmo teto, porque quem abre o detalhe veio dela.
 */
export const rotaDoDetalheDaVitrine = defineRoute({
  operationId: 'getStoreItem',
  method: 'get',
  path: '/store/items/:itemSlug',
  effects: [],
  rateLimit: [{ dimension: ['ip'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

/** As tags do grupo de filtro do app: lista fechada, sem campo digitavel. */
export const rotaDasTagsDaVitrine = defineRoute({
  operationId: 'listStoreTags',
  method: 'get',
  path: '/store/tags',
  effects: [],
  rateLimit: [{ dimension: ['ip'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

/** O vocabulario dos DOIS niveis da categoria (decisao do cliente de 17/10). */
export const rotaDaTaxonomiaDaVitrine = defineRoute({
  operationId: 'getStoreTaxonomy',
  method: 'get',
  path: '/store/taxonomy',
  effects: [],
  rateLimit: [{ dimension: ['ip'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

/** Os mesmos defaults que o contrato declara. */
const PAGINA_INICIAL = 1;
const TAMANHO_PADRAO = 20;
const ORDEM_PADRAO: OrdemDaVitrine = 'curadoria';

/** O mesmo teto de `reference-data`: a lista so muda por migracao. */
const CACHE_DA_TAXONOMIA_EM_SEGUNDOS = 86_400;

export interface DependenciasDasRotasDaVitrine {
  readonly vitrine: StoreRepository;
  readonly taxonomia: TaxonomiaDaVitrineRepository;
  readonly clock: Clock;
}

interface QueryDaVitrine {
  readonly q?: string;
  readonly category?: CategoriaDaVitrine;
  readonly subcategory?: SubcategoriaDaVitrine;
  readonly species?: EspecieDoItem;
  readonly tag?: string;
  readonly sort?: OrdemDaVitrine;
  readonly page?: number;
  readonly limit?: number;
}

/** O recorte que de fato valeu, para a tela poder escreve-lo. */
function recortesAplicados(query: QueryDaVitrine): Record<string, string> {
  const aplicados: Record<string, string> = {};
  if (query.q !== undefined && query.q.trim() !== '') aplicados['q'] = query.q.trim();
  if (query.category !== undefined) aplicados['category'] = query.category;
  if (query.subcategory !== undefined) aplicados['subcategory'] = query.subcategory;
  if (query.species !== undefined) aplicados['species'] = query.species;
  if (query.tag !== undefined) aplicados['tag'] = query.tag;
  if (Object.keys(aplicados).length === 0) aplicados['scope'] = 'all';
  return aplicados;
}

export function registrarRotasDaVitrine(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDaVitrine,
): void {
  registrarRota(
    app,
    rotaDaVitrine,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = (request.query ?? {}) as QueryDaVitrine;
      const page = query.page ?? PAGINA_INICIAL;
      const limit = query.limit ?? TAMANHO_PADRAO;
      const sort = query.sort ?? ORDEM_PADRAO;
      const termo = query.q?.trim();

      const pagina = await deps.vitrine.listarVitrine({
        ...(termo === undefined || termo === '' ? {} : { q: termo }),
        ...(query.category === undefined ? {} : { category: query.category }),
        ...(query.subcategory === undefined ? {} : { subcategory: query.subcategory }),
        ...(query.species === undefined ? {} : { species: query.species }),
        ...(query.tag === undefined ? {} : { tag: query.tag }),
        sort,
        page,
        limit,
      });

      const agora = deps.clock.now();

      return reply.send({
        items: pagina.itens.map((item) => projetarItem(item, agora)),
        page,
        limit,
        total: pagina.total,
        effective_sort: sort,
        applied_filters: recortesAplicados(query),
      });
    },
  );

  registrarRota(app, rotaDoDetalheDaVitrine, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const slug = (request.params as { itemSlug?: string }).itemSlug ?? '';
    const detalhe = await deps.vitrine.detalhe(slug);
    if (detalhe === null) throw problemas.naoEncontrado();
    return reply.send(projetarDetalhe(detalhe.item, detalhe.imagens, deps.clock.now()));
  });

  registrarRota(app, rotaDasTagsDaVitrine, {}, async (_request: FastifyRequest, reply: FastifyReply) =>
    reply.send({ items: await deps.vitrine.tagsVisiveis() }),
  );

  registrarRota(
    app,
    rotaDaTaxonomiaDaVitrine,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      const taxonomia = await deps.taxonomia.carregar();

      const assinatura = taxonomia.categories
        .map((c) => `${c.code}:${c.subcategories.length}`)
        .join(',');
      const etag = `"loja-taxonomia-${String(taxonomia.categories.length)}-${String(assinatura.length)}"`;

      void reply.header('Cache-Control', `public, max-age=${CACHE_DA_TAXONOMIA_EM_SEGUNDOS}`);
      void reply.header('ETag', etag);

      if (casaIfNoneMatch(request.headers['if-none-match'], etag)) {
        return reply.status(304).send();
      }

      return reply.send({
        categories: taxonomia.categories.map((categoria) => ({
          code: categoria.code,
          label: categoria.label,
          subcategories: categoria.subcategories.map((sub) => ({
            code: sub.code,
            label: sub.label,
            species: [...sub.species],
          })),
        })),
      });
    },
  );
}
