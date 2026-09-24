/**
 * Persistencia da vitrine da `Loja`.
 *
 * ## `active` mora na clausula `WHERE`, e em lugar nenhum alem
 *
 * Mesmo desenho de `kysely-directory-repository.ts`, e pelo mesmo motivo: a
 * diferenca entre filtrar na consulta e filtrar depois aparece no dia em que
 * alguem esquece o `if`. Item retirado da vitrine fica na tabela, marcado
 * inativo e nunca apagado (criterio 22 da BICHUS-185, mesma regra da
 * BICHUS-90) -- e a unica coisa que o mantem fora da tela e este predicado.
 *
 * Vale para as DUAS tabelas: um item ativo de um parceiro desativado nao
 * aparece. Desativar um parceiro e como se retira a vitrine dele inteira, e um
 * item orfao na tela levaria a um site que decidimos nao mais apontar.
 *
 * ## A busca e `ILIKE` com escape, e nao busca de texto completo
 *
 * `to_tsvector` acertaria radical e plural, e custaria um indice GIN, uma
 * configuracao de idioma e uma segunda definicao de "o que casa" que diverge da
 * que a pessoa ve. A vitrine curada tem dezenas de itens, nao milhares:
 * `ILIKE` sobre titulo e resumo responde em tempo que ninguem percebe e casa o
 * que a pessoa digitou.
 *
 * **`%`, `_` e `\` sao escapados.** Sem isso, digitar `%` na busca casa tudo e
 * a contagem da barra de listagem passa a dizer o total da vitrine para um
 * termo que a pessoa acha que filtrou.
 */
import { sql } from 'kysely';
import type { Db } from '../../../../shared/db/pool.js';
import {
  ordenarEspecies,
  type CategoriaDaVitrine,
  type ImagemDaVitrine,
  type ItemDaVitrine,
  type TagDaVitrine,
} from '../../domain/item-da-vitrine.js';
import type {
  DetalheDaVitrine,
  PaginaDaVitrine,
  RecorteDaVitrine,
  StoreRepository,
} from '../../ports/store-repository.js';

/** O teto do vocabulario visivel (`StoreTagPage.items.maxItems`). */
const TETO_DE_TAGS_VISIVEIS = 40;

interface LinhaDoItem {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: CategoriaDaVitrine;
  image_url: string | null;
  target_url: string;
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
 *
 * A barra invertida vem primeiro: escapar `%` depois dela duplicaria a barra
 * que acabou de ser inserida.
 */
export function escaparCuringas(termo: string): string {
  return termo.replace(/\\/g, '\\\\').replace(/[%_]/g, (c) => `\\${c}`);
}

/**
 * `price_checked_at` como `AAAA-MM-DD`.
 *
 * O driver devolve `Date` para `date`, e `Date.toISOString()` passa por UTC. Em
 * fuso negativo, uma data pura lida como meia-noite local vira o dia anterior
 * em UTC -- e o preco de um item passaria a ter sido consultado um dia antes,
 * silenciosamente aproximando o vencimento. As tres partes sao lidas em UTC,
 * que e como o driver monta a data pura.
 */
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
 *
 * E o que permite que "o item inativo esta fora" seja verificavel em vez de
 * combinado: o teste compila esta consulta e confere o predicado.
 */
export function construtorDaVitrine(db: Db, recorte: RecorteDaVitrine) {
  let consulta = db
    .selectFrom('store_items as i')
    // A juncao e pela identidade INTERNA (ADR-0024). O `slug` do parceiro
    // continua sendo o que sai na resposta, projetado logo abaixo -- o que
    // mudou foi por onde as duas tabelas se ligam, nao o que a tela recebe.
    .innerJoin('store_partners as p', 'p.id', 'i.partner_id')
    .where('i.active', '=', true)
    .where('p.active', '=', true);

  if (recorte.category !== undefined) {
    consulta = consulta.where('i.category', '=', recorte.category);
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

  // A tag precisa estar ATIVA, e a condicao mora aqui dentro: tag inativa ou
  // inexistente nao casa com item nenhum e a lista volta vazia, sem 400.
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

/** As colunas que a lista e o detalhe projetam. Uma definicao so. */
const COLUNAS_DO_ITEM = [
  'i.id as id',
  'i.slug as slug',
  'i.title as title',
  'i.summary as summary',
  'i.category as category',
  'i.image_url as image_url',
  'i.target_url as target_url',
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
  /** So as PRONTAS, em ordem de `position`. */
  readonly imagens: ReadonlyMap<string, { chave: string; altText: string }[]>;
}

export class KyselyStoreRepository implements StoreRepository {
  constructor(
    private readonly db: Db,
    /** A URL publica da derivada, montada na leitura. O banco guarda so a chave. */
    private readonly urlDeMidia: (chave: string) => string,
  ) {}

  /**
   * Especie, tags ativas e imagens prontas dos itens da pagina, em TRES
   * consultas por pagina, e nao tres por item: a vitrine e a tela mais aberta
   * da `Loja`, e N+1 nela e a primeira lentidao que alguem sente.
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
      // `status = 'ready'` NA CONSULTA: a imagem em processamento carrega o
      // arquivo original sem limpeza, e nao pode chegar nem perto da projecao.
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
      imagens: porItem(imagens, (l: { public_key: string; alt_text: string }) => ({
        chave: l.public_key,
        altText: l.alt_text,
      })),
    };
  }

  private comoItem(linha: LinhaDoItem, extra: Complementos): ItemDaVitrine {
    const principal = extra.imagens.get(linha.id)?.[0];
    return {
      slug: linha.slug,
      title: linha.title,
      summary: linha.summary,
      category: linha.category,
      imageUrl: principal !== undefined ? this.urlDeMidia(principal.chave) : linha.image_url,
      imageAltText:
        principal !== undefined ? principal.altText : linha.image_url === null ? null : linha.title,
      species: ordenarEspecies(extra.especies.get(linha.id) ?? []),
      tags: extra.tags.get(linha.id) ?? [],
      targetUrl: linha.target_url,
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

    // O total do RECORTE. Consulta separada e nao `COUNT(*) OVER ()` porque a
    // janela some quando a pagina nao tem linha nenhuma, e e justamente ai que
    // a tela precisa do total para distinguir "filtrou e nao sobrou" de "a
    // vitrine esta vazia".
    const contagem = await base
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirst();
    const total = Number(contagem?.total ?? 0);

    // O desempate por `slug` nao e enfeite: sem ele, duas linhas com o mesmo
    // `sort_order` (ou o mesmo titulo) podem trocar de lugar entre duas
    // chamadas, e a paginacao passa a repetir e a pular itens sem nada acusar.
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
    // O MESMO construtor da lista, e portanto o mesmo `WHERE`: item ativo de
    // parceiro ativo. Rascunho, retirado e parceiro inativo caem fora pela
    // mesma clausula que os tira da lista, e o 404 nao distingue nenhum deles.
    const linha = (await construtorDaVitrine(this.db, { sort: 'curadoria', page: 1, limit: 1 })
      .where('i.slug', '=', slug)
      .select([...COLUNAS_DO_ITEM])
      .executeTakeFirst()) as unknown as LinhaDoItem | undefined;
    if (linha === undefined) return null;
    const extra = await this.complementos([linha.id]);
    const imagens: ImagemDaVitrine[] = (extra.imagens.get(linha.id) ?? []).map((i) => ({
      url: this.urlDeMidia(i.chave),
      altText: i.altText,
    }));
    return { item: this.comoItem(linha, extra), imagens };
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
