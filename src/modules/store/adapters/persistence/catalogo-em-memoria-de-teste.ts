/**
 * O repositorio da escrita administrativa da `Loja` em memoria, para os testes
 * do caso de uso e das rotas. Nunca e ligado em `api.ts`.
 *
 * Imita as coisas do banco de que o caso de uso depende: a versao lida no
 * `WHERE` (devolve `null` quando mudou), o `ROLLBACK` (o rascunho da
 * transacao so vira estado se o trabalho inteiro terminar), a unicidade de
 * `slug` e a de imagem por item. A prova contra Postgres de verdade e de
 * `tests/integration/escrita-administrativa-da-loja.test.ts`.
 */
import { comoData } from '../../../../shared/time/clock.js';
import type { Instant } from '../../../../shared/types/brands.js';
import type { AuditEvent } from '../../../audit/ports/audit-log.js';
import type {
  EnvioDeCatalogo,
  EnvioPreparado,
  NovaIntencaoDeCatalogo,
  PreparadorDeEnvioDeCatalogo,
} from '../../../media/ports/imagem-de-catalogo.js';
import type {
  ImagemDoItem,
  ItemAdministrativo,
  ParceiroAdministrativo,
  TagAdministrativa,
} from '../../domain/escrita-da-vitrine.js';
import { ordenarEspecies, type EspecieDoItem } from '../../domain/item-da-vitrine.js';
import {
  SlugOcupado,
  type CatalogoAdministrativoRepository,
  type ImagemNaPosicao,
  type MudancaDeItem,
  type MudancaDeParceiro,
  type MudancaDeTag,
  type NovaTag,
  type NovoItem,
  type NovoParceiro,
  type TransacaoDoCatalogo,
} from '../../ports/catalogo-administrativo.js';

/** O item como o dublê o guarda: as ligacoes ficam fora, como no banco. */
type ItemGuardado = Omit<ItemAdministrativo, 'species' | 'tags' | 'imagens' | 'partner'> & {
  readonly partnerId: string;
};

interface ImagemGuardada {
  readonly id: string;
  readonly uploadId: string;
  readonly status: ImagemDoItem['status'];
}

export interface Estado {
  parceiros: Map<string, ParceiroAdministrativo>;
  itens: Map<string, ItemGuardado>;
  especies: Map<string, EspecieDoItem[]>;
  tags: Map<string, TagAdministrativa>;
  tagsDoItem: Map<string, string[]>;
  imagens: Map<string, ImagemGuardada>;
  galeria: Map<string, ImagemNaPosicao[]>;
  intencoes: NovaIntencaoDeCatalogo[];
  /** Envios confirmados: `upload_id` -> `catalog_images.id`. */
  confirmados: Map<string, string>;
  trabalhos: string[];
  trilha: AuditEvent[];
}

function clonar(e: Estado): Estado {
  return {
    parceiros: new Map(e.parceiros),
    itens: new Map(e.itens),
    especies: new Map(e.especies),
    tags: new Map(e.tags),
    tagsDoItem: new Map(e.tagsDoItem),
    imagens: new Map(e.imagens),
    galeria: new Map(e.galeria),
    intencoes: [...e.intencoes],
    confirmados: new Map(e.confirmados),
    trabalhos: [...e.trabalhos],
    trilha: [...e.trilha],
  };
}

let contador = 0;
export function novoId(): string {
  contador += 1;
  return `0192a3b4-0000-7000-8000-${String(contador).padStart(12, '0')}`;
}

/** Um envio que existe "no banco" do dublê sem ter passado por `registrarIntencao`. */
export interface EnvioSemeado {
  readonly id: string;
  readonly kind: string;
  readonly purpose: 'store_item' | 'network_event' | null;
  readonly expiresAt: Date;
}

function montarItem(e: Estado, id: string): ItemAdministrativo {
  const guardado = e.itens.get(id);
  if (guardado === undefined) throw new Error(`item ${id} inexistente no dublê`);
  const parceiro = e.parceiros.get(guardado.partnerId);
  if (parceiro === undefined) throw new Error('parceiro inexistente no dublê');
  return {
    id: guardado.id,
    slug: guardado.slug,
    title: guardado.title,
    summary: guardado.summary,
    category: guardado.category,
    targetUrl: guardado.targetUrl,
    imageUrl: guardado.imageUrl,
    priceAmount: guardado.priceAmount,
    priceCurrency: guardado.priceCurrency,
    priceCheckedAt: guardado.priceCheckedAt,
    active: guardado.active,
    publishedAt: guardado.publishedAt,
    sortOrder: guardado.sortOrder,
    createdAt: guardado.createdAt,
    updatedAt: guardado.updatedAt,
    version: guardado.version,
    partner: { slug: parceiro.slug, name: parceiro.name, host: parceiro.host },
    species: ordenarEspecies(e.especies.get(id) ?? []),
    tags: (e.tagsDoItem.get(id) ?? [])
      .map((tagId) => e.tags.get(tagId))
      .filter((t): t is TagAdministrativa => t !== undefined)
      .map((t) => ({ slug: t.slug, label: t.label, active: t.active })),
    imagens: (e.galeria.get(id) ?? []).map((g) => {
      const imagem = e.imagens.get(g.imageId);
      return {
        uploadId: imagem?.uploadId ?? '',
        imageId: g.imageId,
        position: g.position,
        altText: g.altText,
        status: imagem?.status ?? 'processing',
        publicKey: null,
        rejectionReason: null,
      };
    }),
  };
}

/** Repositorio em memoria com `ROLLBACK` e versao no `WHERE`. */
export function repositorioEmMemoria(
  opcoes: { trilhaFalha?: () => boolean; envios?: readonly EnvioSemeado[] } = {},
) {
  let estado: Estado = {
    parceiros: new Map(),
    itens: new Map(),
    especies: new Map(),
    tags: new Map(),
    tagsDoItem: new Map(),
    imagens: new Map(),
    galeria: new Map(),
    intencoes: [],
    confirmados: new Map(),
    trabalhos: [],
    trilha: [],
  };
  const semeados = new Map((opcoes.envios ?? []).map((e) => [e.id, e]));

  const porSlug = <T extends { slug: string }>(m: Map<string, T>, slug: string): T | null =>
    [...m.values()].find((v) => v.slug === slug) ?? null;

  function envioNoEstado(e: Estado, id: string): EnvioDeCatalogo | null {
    const intencao = e.intencoes.find((i) => i.id === id);
    const semeado = semeados.get(id);
    if (intencao === undefined && semeado === undefined) return null;
    const imagemId = e.confirmados.get(id) ?? null;
    return {
      id,
      kind: intencao !== undefined ? 'catalog_image' : (semeado?.kind ?? ''),
      purpose: intencao !== undefined ? intencao.purpose : (semeado?.purpose ?? null),
      expiresAt: intencao !== undefined ? intencao.expiresAt : (semeado?.expiresAt ?? comoData(0 as Instant)),
      confirmedAt: imagemId === null ? null : comoData(0 as Instant),
      catalogImageId: imagemId,
    };
  }

  const repo: CatalogoAdministrativoRepository = {
    async emTransacao(trabalho) {
      const r = clonar(estado);
      const tx: TransacaoDoCatalogo = {
        parceiroPorSlug: (slug) => Promise.resolve(porSlug(r.parceiros, slug)),
        async inserirParceiro(novo: NovoParceiro) {
          await Promise.resolve();
          if (porSlug(r.parceiros, novo.slug) !== null) throw new SlugOcupado('store_partner');
          const p: ParceiroAdministrativo = {
            id: novo.id,
            slug: novo.slug,
            name: novo.name,
            host: novo.host,
            active: true,
            sortOrder: novo.sortOrder,
            itemCount: 0,
            createdAt: comoData(novo.agora),
            updatedAt: comoData(novo.agora),
            version: 1,
          };
          r.parceiros.set(p.id, p);
          return p;
        },
        async atualizarParceiro(id, versao, m: MudancaDeParceiro, agora) {
          await Promise.resolve();
          const atual = r.parceiros.get(id);
          if (atual === undefined || atual.version !== versao) return null;
          if (m.slug !== undefined && m.slug !== atual.slug && porSlug(r.parceiros, m.slug) !== null) {
            throw new SlugOcupado('store_partner');
          }
          const novo: ParceiroAdministrativo = {
            ...atual,
            ...(m.slug === undefined ? {} : { slug: m.slug }),
            ...(m.name === undefined ? {} : { name: m.name }),
            ...(m.host === undefined ? {} : { host: m.host }),
            ...(m.sortOrder === undefined ? {} : { sortOrder: m.sortOrder }),
            ...(m.active === undefined ? {} : { active: m.active }),
            updatedAt: comoData(agora),
            version: atual.version + 1,
          };
          r.parceiros.set(id, novo);
          return novo;
        },
        destinosDosItensDoParceiro: (partnerId) =>
          Promise.resolve(
            [...r.itens.values()].filter((i) => i.partnerId === partnerId).map((i) => i.targetUrl),
          ),
        itemPorSlug: (slug) => {
          const achado = porSlug(r.itens, slug);
          return Promise.resolve(achado === null ? null : montarItem(r, achado.id));
        },
        async inserirItem(novo: NovoItem) {
          await Promise.resolve();
          if (porSlug(r.itens, novo.slug) !== null) throw new SlugOcupado('store_item');
          r.itens.set(novo.id, {
            id: novo.id,
            slug: novo.slug,
            partnerId: novo.partnerId,
            title: novo.title,
            summary: novo.summary,
            category: novo.category,
            targetUrl: novo.targetUrl,
            imageUrl: null,
            priceAmount: novo.preco?.amount ?? null,
            priceCurrency: novo.preco?.currency ?? null,
            priceCheckedAt: novo.preco?.checkedAt ?? null,
            active: false,
            publishedAt: null,
            sortOrder: novo.sortOrder,
            createdAt: comoData(novo.agora),
            updatedAt: comoData(novo.agora),
            version: 1,
          });
          return montarItem(r, novo.id);
        },
        async atualizarItem(id, versao, m: MudancaDeItem, agora) {
          await Promise.resolve();
          const atual = r.itens.get(id);
          if (atual === undefined || atual.version !== versao) return null;
          r.itens.set(id, {
            ...atual,
            ...(m.slug === undefined ? {} : { slug: m.slug }),
            ...(m.partnerId === undefined ? {} : { partnerId: m.partnerId }),
            ...(m.title === undefined ? {} : { title: m.title }),
            ...(m.summary === undefined ? {} : { summary: m.summary }),
            ...(m.category === undefined ? {} : { category: m.category }),
            ...(m.targetUrl === undefined ? {} : { targetUrl: m.targetUrl }),
            ...(m.preco === undefined
              ? {}
              : m.preco === null
                ? { priceAmount: null, priceCurrency: null, priceCheckedAt: null }
                : {
                    priceAmount: m.preco.amount,
                    priceCurrency: m.preco.currency,
                    priceCheckedAt: m.preco.checkedAt,
                  }),
            ...(m.sortOrder === undefined ? {} : { sortOrder: m.sortOrder }),
            ...(m.active === undefined ? {} : { active: m.active }),
            ...(m.publishedAt === undefined || atual.publishedAt !== null
              ? {}
              : { publishedAt: comoData(m.publishedAt) }),
            updatedAt: comoData(agora),
            version: atual.version + 1,
          });
          return montarItem(r, id);
        },
        recarregarItem: (id) => Promise.resolve(montarItem(r, id)),
        async substituirEspecies(itemId, especies) {
          await Promise.resolve();
          r.especies.set(itemId, [...especies]);
        },
        tagsPorSlugs: (slugs) =>
          Promise.resolve(
            [...r.tags.values()].filter((t) => slugs.includes(t.slug)).map((t) => ({ id: t.id, slug: t.slug, active: t.active })),
          ),
        async substituirTags(itemId, tagIds) {
          await Promise.resolve();
          r.tagsDoItem.set(itemId, [...tagIds]);
        },
        async substituirImagens(itemId, imagens) {
          await Promise.resolve();
          for (const [outro, galeria] of r.galeria) {
            if (outro !== itemId && galeria.some((g) => imagens.some((i) => i.imageId === g.imageId))) {
              throw new Error('store_item_images.image_id UNIQUE violado no dublê');
            }
          }
          r.galeria.set(itemId, [...imagens]);
        },
        envioDeCatalogo: (uploadId) => Promise.resolve(envioNoEstado(r, uploadId)),
        itemDaImagem: (imageId) =>
          Promise.resolve([...r.galeria].find(([, g]) => g.some((i) => i.imageId === imageId))?.[0] ?? null),
        async confirmarEnvioDeCatalogo(entrada) {
          await Promise.resolve();
          r.confirmados.set(entrada.envioId, entrada.imagemId);
          r.imagens.set(entrada.imagemId, { id: entrada.imagemId, uploadId: entrada.envioId, status: 'processing' });
          r.trabalhos.push(entrada.trabalhoId);
        },
        tagPorSlug: (slug) => Promise.resolve(porSlug(r.tags, slug)),
        contarTagsAtivasComTrava: () => Promise.resolve([...r.tags.values()].filter((t) => t.active).length),
        async inserirTag(nova: NovaTag) {
          await Promise.resolve();
          if (porSlug(r.tags, nova.slug) !== null) throw new SlugOcupado('store_tag');
          const t: TagAdministrativa = {
            id: nova.id,
            slug: nova.slug,
            label: nova.label,
            active: true,
            itemCount: 0,
            createdAt: comoData(nova.agora),
            updatedAt: comoData(nova.agora),
            version: 1,
          };
          r.tags.set(t.id, t);
          return t;
        },
        async atualizarTag(id, versao, m: MudancaDeTag, agora) {
          await Promise.resolve();
          const atual = r.tags.get(id);
          if (atual === undefined || atual.version !== versao) return null;
          if (m.slug !== undefined && m.slug !== atual.slug && porSlug(r.tags, m.slug) !== null) {
            throw new SlugOcupado('store_tag');
          }
          const nova: TagAdministrativa = {
            ...atual,
            ...(m.slug === undefined ? {} : { slug: m.slug }),
            ...(m.label === undefined ? {} : { label: m.label }),
            ...(m.active === undefined ? {} : { active: m.active }),
            updatedAt: comoData(agora),
            version: atual.version + 1,
          };
          r.tags.set(id, nova);
          return nova;
        },
        async registrarIntencaoDeCatalogo(nova) {
          await Promise.resolve();
          r.intencoes.push(nova);
        },
        async registrarNaTrilha(evento) {
          await Promise.resolve();
          if (opcoes.trilhaFalha?.() === true) throw new Error('trilha fora do ar');
          r.trilha.push(evento);
        },
      };
      // O ROLLBACK: o rascunho so vira estado se o trabalho inteiro terminar.
      const resultado = await trabalho(tx);
      estado = r;
      return resultado;
    },
    listarParceiros: () =>
      Promise.resolve({ itens: [...estado.parceiros.values()], total: estado.parceiros.size }),
    parceiroPorSlug: (slug) => Promise.resolve(porSlug(estado.parceiros, slug)),
    listarItens: () =>
      Promise.resolve({
        itens: [...estado.itens.keys()].map((id) => montarItem(estado, id)),
        total: estado.itens.size,
      }),
    itemPorSlug: (slug) => {
      const achado = porSlug(estado.itens, slug);
      return Promise.resolve(achado === null ? null : montarItem(estado, achado.id));
    },
    listarTags: () => Promise.resolve({ itens: [...estado.tags.values()], total: estado.tags.size }),
  };
  return { repo, estado: () => estado };
}

export function preparadorFalso(agora: Instant): PreparadorDeEnvioDeCatalogo {
  return {
    preparar: (contentType) =>
      Promise.resolve<EnvioPreparado>({
        uploadId: novoId(),
        chave: 'catalog/original/KioqKioqKioqKioqKioqKg' as EnvioPreparado['chave'],
        contentType,
        maxBytes: 10 * 1024 * 1024,
        autorizacao: {
          metodo: 'POST',
          url: 'https://upload.exemplo.invalid/' as EnvioPreparado['autorizacao']['url'],
          campos: { key: 'catalog/original/x' },
          expiraEm: comoData((agora + 600_000) as Instant),
          maxBytes: 10 * 1024 * 1024,
        },
      }),
  };
}
