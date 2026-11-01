import { sql } from 'kysely';
import type { Db } from '../../../../shared/db/pool.js';
import {
  enderecoNoParceiro,
  hostDoDestinoDoItem,
  ordenarEspecies,
  type CategoriaDaVitrine,
  type ItemDaVitrine,
  type TagDaVitrine,
} from '../../domain/item-da-vitrine.js';
import type {
  DetalheDaVitrine,
  PaginaDaVitrine,
  RecorteDaVitrine,
  StoreRepository,
} from '../../ports/store-repository.js';

const TETO_DE_TAGS_VISIVEIS = 40;

interface LinhaDoItem {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: CategoriaDaVitrine;
  category_label: string;
  subcategory: string | null;
  subcategory_label: string | null;
  image_path: string | null;
  target_path: string;
  target_host: string | null;
  partner_slug: string;
  partner_name: string;
  partner_host: string;
  price_amount: number | null;
  price_currency: string | null;
  price_checked_at: Date | string | null;
}

/**
 * Escapa os curingas do `LIKE` para que o termo da pessoa seja procurado como
 * texto, e nao como padrao.
 */
export function escaparCuringas(termo: string): string {
  return termo.replace(/\\/g, '\\\\').replace(/[%_]/g, (c) => `\\${c}`);
}

/** `price_checked_at` como `AAAA-MM-DD`. */
export function comoDataSimples(valor: Date | string | null): string | null {
  if (valor === null) return null;
  if (typeof valor === 'string') return valor.slice(0, 10);
  const ano = String(valor.getUTCFullYear()).padStart(4, '0');
  const mes = String(valor.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(valor.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/**
 * O construtor da listagem, separado para poder ser **compilado e lido** por um
 * teste sem subir banco, como `construtorDaListagem` faz em `Perto`.
 */
export function construtorDaVitrine(db: Db, recorte: RecorteDaVitrine) {
  let consulta = db
    .selectFrom('store_items as i')
    .innerJoin('store_partners as p', 'p.id', 'i.partner_id')
    .innerJoin('store_categories as c', 'c.code', 'i.category')
    .leftJoin('store_subcategories as sc', (juncao) =>
      juncao
        .onRef('sc.category_code', '=', 'i.category')
        .onRef('sc.code', '=', 'i.subcategory'),
    )
    .where('i.active', '=', true)
    .where('p.active', '=', true);

  if (recorte.category !== undefined) {
    consulta = consulta.where('i.category', '=', recorte.category);
  }

  if (recorte.subcategory !== undefined) {
    consulta = consulta.where('i.subcategory', '=', recorte.subcategory);
  }

  if (recorte.species !== undefined) {
    const especie = recorte.species;
    consulta = consulta.where((eb) =>
      eb.exists(
        eb
          .selectFrom('store_item_species as s')
          .select(sql`1`.as('um'))
          .whereRef('s.item_id', '=', 'i.id')
          .where('s.species', '=', especie),
      ),
    );
  }

  if (recorte.tag !== undefined) {
    const slug = recorte.tag;
    consulta = consulta.where((eb) =>
      eb.exists(
        eb
          .selectFrom('store_item_tags as it')
          .innerJoin('store_tags as t', 't.id', 'it.tag_id')
          .select(sql`1`.as('um'))
          .whereRef('it.item_id', '=', 'i.id')
          .where('t.slug', '=', slug)
          .where('t.active', '=', true),
      ),
    );
  }

  if (recorte.q !== undefined && recorte.q !== '') {
    const padrao = `%${escaparCuringas(recorte.q)}%`;
    consulta = consulta.where((eb) =>
      eb.or([
        eb(sql`i.title`, 'ilike', sql`${padrao}`),
        eb(sql`i.summary`, 'ilike', sql`${padrao}`),
      ]),
    );
  }

  return consulta;
}

const COLUNAS_DO_ITEM = [
  'i.id as id',
  'i.slug as slug',
  'i.title as title',
  'i.summary as summary',
  'i.category as category',
  'c.label as category_label',
  'i.subcategory as subcategory',
  'sc.label as subcategory_label',
  'i.image_path as image_path',
  'i.target_path as target_path',
  'i.target_host as target_host',
  'p.slug as partner_slug',
  'p.name as partner_name',
  'p.host as partner_host',
  'i.price_amount as price_amount',
  'i.price_currency as price_currency',
  'i.price_checked_at as price_checked_at',
] as const;

interface Complementos {
  readonly especies: ReadonlyMap<string, string[]>;
  readonly tags: ReadonlyMap<string, TagDaVitrine[]>;
  readonly imagens: ReadonlyMap<string, { chave: string; altText: string | null }[]>;
}

export class KyselyStoreRepository implements StoreRepository {
  constructor(
    private readonly db: Db,
    /** A URL publica da derivada, montada na leitura. */
    private readonly urlDeMidia: (chave: string) => string,
  ) {}

  /**
   * Especie, tags ativas e imagens prontas dos itens da pagina, em TRES consultas
   * por pagina, e nao tres por item: a vitrine e a tela mais aberta da `Loja`, e N+1
   * nela e a primeira lentidao que alguem sente.
   */
  private async complementos(ids: readonly string[]): Promise<Complementos> {
    if (ids.length === 0) return { especies: new Map(), tags: new Map(), imagens: new Map() };
    const [especies, tags, imagens] = await Promise.all([
      this.db
        .selectFrom('store_item_species')
        .select(['item_id', 'species'])
        .where('item_id', 'in', ids)
        .execute(),
      this.db
        .selectFrom('store_item_tags as it')
        .innerJoin('store_tags as t', 't.id', 'it.tag_id')
        .select(['it.item_id as item_id', 't.slug as slug', 't.label as label'])
        .where('it.item_id', 'in', ids)
        .where('t.active', '=', true)
        .orderBy('t.label', 'asc')
        .execute(),
      this.db
        .selectFrom('store_item_images as ii')
        .innerJoin('catalog_images as c', 'c.id', 'ii.image_id')
        .select(['ii.item_id as item_id', 'c.public_key as public_key', 'ii.alt_text as alt_text'])
        .where('ii.item_id', 'in', ids)
        .where('c.status', '=', 'ready')
        .where('c.public_key', 'is not', null)
        .orderBy('ii.position', 'asc')
        .execute(),
    ]);
    const porItem = <T>(linhas: readonly { item_id: string }[], mapear: (l: never) => T): Map<string, T[]> => {
      const mapa = new Map<string, T[]>();
      for (const linha of linhas) {
        const lista = mapa.get(linha.item_id) ?? [];
        lista.push(mapear(linha as never));
        mapa.set(linha.item_id, lista);
      }
      return mapa;
    };
    return {
      especies: porItem(especies, (l: { species: string }) => l.species),
      tags: porItem(tags, (l: { slug: string; label: string }) => ({ slug: l.slug, label: l.label })),
      imagens: porItem(imagens, (l: { public_key: string; alt_text: string | null }) => ({
        chave: l.public_key,
        altText: l.alt_text,
      })),
    };
  }

  private comoItem(linha: LinhaDoItem, extra: Complementos): ItemDaVitrine {
    const daPagina = extra.imagens.get(linha.id) ?? [];
    const principal = daPagina[0];
    const externa =
      linha.image_path === null ? null : enderecoNoParceiro(linha.partner_host, linha.image_path);
    return {
      slug: linha.slug,
      title: linha.title,
      summary: linha.summary,
      category: linha.category,
      categoryLabel: linha.category_label,
      subcategory: linha.subcategory,
      subcategoryLabel: linha.subcategory === null ? null : linha.subcategory_label,
      imageUrl: principal !== undefined ? this.urlDeMidia(principal.chave) : externa,
      imageAltText:
        principal !== undefined ? principal.altText : externa === null ? null : linha.title,
      imagens: daPagina.map((i) => ({ url: this.urlDeMidia(i.chave), altText: i.altText })),
      species: ordenarEspecies(extra.especies.get(linha.id) ?? []),
      tags: extra.tags.get(linha.id) ?? [],
      targetUrl: enderecoNoParceiro(
        hostDoDestinoDoItem(linha.partner_host, linha.target_host),
        linha.target_path,
      ),
      partnerSlug: linha.partner_slug,
      partnerName: linha.partner_name,
      partnerHost: linha.partner_host,
      priceAmount: linha.price_amount === null ? null : Number(linha.price_amount),
      priceCurrency: linha.price_currency,
      priceCheckedAt: comoDataSimples(linha.price_checked_at),
    };
  }

  async listarVitrine(recorte: RecorteDaVitrine): Promise<PaginaDaVitrine> {
    const base = construtorDaVitrine(this.db, recorte);

    const contagem = await base
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirst();
    const total = Number(contagem?.total ?? 0);

    const consulta =
      recorte.sort === 'nome'
        ? base.orderBy('i.title', 'asc').orderBy('i.slug', 'asc')
        : base.orderBy('i.sort_order', 'asc').orderBy('i.slug', 'asc');

    const linhas = (await consulta
      .select([...COLUNAS_DO_ITEM])
      .limit(recorte.limit)
      .offset((recorte.page - 1) * recorte.limit)
      .execute()) as unknown as LinhaDoItem[];

    const extra = await this.complementos(linhas.map((l) => l.id));
    return { itens: linhas.map((linha) => this.comoItem(linha, extra)), total };
  }

  async detalhe(slug: string): Promise<DetalheDaVitrine | null> {
    const linha = (await construtorDaVitrine(this.db, { sort: 'curadoria', page: 1, limit: 1 })
      .where('i.slug', '=', slug)
      .select([...COLUNAS_DO_ITEM])
      .executeTakeFirst()) as unknown as LinhaDoItem | undefined;
    if (linha === undefined) return null;
    const extra = await this.complementos([linha.id]);
    const item = this.comoItem(linha, extra);
    return { item, imagens: item.imagens };
  }

  async tagsVisiveis(): Promise<readonly TagDaVitrine[]> {
    const linhas = await this.db
      .selectFrom('store_tags as t')
      .select(['t.slug as slug', 't.label as label'])
      .where('t.active', '=', true)
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('store_item_tags as it')
            .innerJoin('store_items as i', 'i.id', 'it.item_id')
            .innerJoin('store_partners as p', 'p.id', 'i.partner_id')
            .select(sql`1`.as('um'))
            .whereRef('it.tag_id', '=', 't.id')
            .where('i.active', '=', true)
            .where('p.active', '=', true),
        ),
      )
      .orderBy('t.label', 'asc')
      .orderBy('t.slug', 'asc')
      .limit(TETO_DE_TAGS_VISIVEIS)
      .execute();
    return linhas.map((l) => ({ slug: l.slug, label: l.label }));
  }
}

export function criarStoreRepository(db: Db, urlDeMidia: (chave: string) => string): StoreRepository {
  return new KyselyStoreRepository(db, urlDeMidia);
}
