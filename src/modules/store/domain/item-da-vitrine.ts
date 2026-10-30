import { comoData } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';

/** O CODIGO da categoria do produto, primeiro dos dois niveis. */
export type CategoriaDaVitrine = string;

/** O CODIGO da subcategoria. */
export type SubcategoriaDaVitrine = string;

/**
 * As SEIS categorias que existiam antes de 17/10/2026, e que **continuam validas
 * com os mesmos codigos**.
 */
export const CATEGORIAS_DA_VITRINE: readonly CategoriaDaVitrine[] = [
  'food',
  'toy',
  'hygiene',
  'accessory',
  'health',
  'bed',
];

/** Quantos dias um preco de referencia vale. */
export const DIAS_DE_VALIDADE_DO_PRECO = 30;

/**
 * As especies que `store_item_species.species` admite, as de `ref_species` e as do
 * cadastro de pet (ADR-0027 item 16).
 */
export type EspecieDoItem = 'dog' | 'cat' | 'other';

export const ESPECIES_DO_ITEM: readonly EspecieDoItem[] = ['dog', 'cat', 'other'];

/**
 * Ordena pela ordem do cadastro, para a resposta nao variar com a ordem de
 * gravacao.
 */
export function ordenarEspecies(especies: readonly string[]): EspecieDoItem[] {
  return ESPECIES_DO_ITEM.filter((e) => especies.includes(e));
}

/** A tag como a leitura publica a mostra: so ativa, pelo `slug`. */
export interface TagDaVitrine {
  readonly slug: string;
  readonly label: string;
}

/** O endereco absoluto de um caminho no site do parceiro. */
export function enderecoNoParceiro(host: string, caminho: string): string {
  return `https://${host}${caminho}`;
}

/**
 * O host a usar na composicao: o do item quando ele mora num SUBDOMINIO do
 * parceiro, e o do parceiro no caso comum.
 */
export function hostDoDestinoDoItem(
  hostDoParceiro: string,
  hostDoItem: string | null,
): string {
  return hostDoItem ?? hostDoParceiro;
}

/** O item como o repositorio o entrega. */
export interface ItemDaVitrine {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly category: CategoriaDaVitrine;
  /**
   * O rotulo da categoria, lido de `store_categories.label` na MESMA consulta que
   * trouxe o item.
   */
  readonly categoryLabel: string;
  /** O segundo nivel. Nulo e estado normal: a subcategoria e opcional. */
  readonly subcategory: SubcategoriaDaVitrine | null;
  /** O rotulo da subcategoria. */
  readonly subcategoryLabel: string | null;
  /**
   * A imagem principal, ja como URL publica: a primeira imagem PRONTA do item
   * (`store_item_images`, menor `position`), ou a URL externa da massa.
   */
  readonly imageUrl: string | null;
  /** O texto alternativo da principal. */
  readonly imageAltText: string | null;
  /**
   * TODAS as imagens prontas do item, na ordem de `position` — e não só a primeira
   * (17/10/2026).
   */
  readonly imagens: readonly ImagemDaVitrine[];
  readonly species: readonly EspecieDoItem[];
  /** So tags ATIVAS. A inativa continua ligada ao item e some do app. */
  readonly tags: readonly TagDaVitrine[];
  readonly targetUrl: string;
  readonly partnerSlug: string;
  readonly partnerName: string;
  readonly partnerHost: string;
  /** Centavos, inteiro. Nulo quando o item nao tem preco, que e estado normal. */
  readonly priceAmount: number | null;
  readonly priceCurrency: string | null;
  /**
   * `AAAA-MM-DD`. Nunca nulo quando ha `priceAmount` -- o banco exige os tres
   * juntos.
   */
  readonly priceCheckedAt: string | null;
}

/** O item como a resposta publica o declara. */
export interface ItemProjetado {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly category: CategoriaDaVitrine;
  readonly category_label: string;
  readonly subcategory: SubcategoriaDaVitrine | null;
  readonly subcategory_label: string | null;
  readonly image_url: string | null;
  readonly image_alt_text: string | null;
  /**
   * `StoreItemSummary.images`, ADITIVO (17/10/2026): a vitrine desenha carrossel
   * quando há mais de uma.
   */
  readonly images: readonly ImagemProjetada[];
  readonly target_url: string;
  readonly partner: { readonly slug: string; readonly name: string; readonly host: string };
  readonly species: readonly EspecieDoItem[];
  readonly tags: readonly TagDaVitrine[];
  /** Centavos. **Ausente quando vencido**, e ausente quando nunca houve preco. */
  readonly price_amount: number | null;
  readonly price_currency: string | null;
  readonly price_checked_at: string | null;
  readonly price_status: EstadoDoPreco;
}

/** Os tres estados de preco, e eles sao tres e nao dois. */
export type EstadoDoPreco = 'vigente' | 'vencido' | 'sem_preco';

/** Quantos dias inteiros separam `desde` de `ate`, pelo calendario UTC. */
export function diasDeCalendario(desde: string, ate: Instant): number {
  const [ano, mes, dia] = desde.split('-').map(Number);
  if (ano === undefined || mes === undefined || dia === undefined) {
    throw new TypeError(`price_checked_at fora do formato AAAA-MM-DD: "${desde}"`);
  }
  const inicio = Date.UTC(ano, mes - 1, dia);
  const instante = comoData(ate);
  const fim = Date.UTC(instante.getUTCFullYear(), instante.getUTCMonth(), instante.getUTCDate());
  return Math.floor((fim - inicio) / 86_400_000);
}

/** O estado do preco de um item, agora. */
export function estadoDoPreco(
  item: Pick<ItemDaVitrine, 'priceAmount' | 'priceCheckedAt'>,
  agora: Instant,
): EstadoDoPreco {
  if (item.priceAmount === null || item.priceCheckedAt === null) return 'sem_preco';
  return diasDeCalendario(item.priceCheckedAt, agora) > DIAS_DE_VALIDADE_DO_PRECO
    ? 'vencido'
    : 'vigente';
}

/** Projeta o item para a resposta publica, **omitindo o valor quando vencido**. */
export function projetarItem(item: ItemDaVitrine, agora: Instant): ItemProjetado {
  const estado = estadoDoPreco(item, agora);
  const vigente = estado === 'vigente';
  return {
    slug: item.slug,
    title: item.title,
    summary: item.summary,
    category: item.category,
    category_label: item.categoryLabel,
    subcategory: item.subcategory,
    subcategory_label: item.subcategoryLabel,
    image_url: item.imageUrl,
    image_alt_text: item.imageAltText,
    images: galeriaDoItem(item, item.imagens),
    target_url: item.targetUrl,
    partner: { slug: item.partnerSlug, name: item.partnerName, host: item.partnerHost },
    species: [...item.species],
    tags: item.tags.map((t) => ({ slug: t.slug, label: t.label })),
    price_amount: vigente ? item.priceAmount : null,
    price_currency: vigente ? item.priceCurrency : null,
    price_checked_at: vigente ? item.priceCheckedAt : null,
    price_status: estado,
  };
}

/** Uma imagem do detalhe publico: so pronta, ja como URL. */
export interface ImagemDaVitrine {
  readonly url: string;
  /** **Nulo é estado normal, e o tipo diz isso desde 17/10/2026.** */
  readonly altText: string | null;
}

/** Uma imagem como a resposta publica a declara (`StoreItemImage`). */
export interface ImagemProjetada {
  readonly url: string;
  readonly alt_text: string | null;
}

export interface DetalheProjetado extends ItemProjetado {
  readonly images: readonly ImagemProjetada[];
}

/** A galeria publica de um item, por UMA regra só. */
export function galeriaDoItem(
  item: ItemDaVitrine,
  imagens: readonly ImagemDaVitrine[],
): readonly ImagemProjetada[] {
  if (imagens.length > 0) {
    return imagens.map((i) => ({ url: i.url, alt_text: i.altText }));
  }
  if (item.imageUrl === null) return [];
  return [{ url: item.imageUrl, alt_text: item.imageAltText ?? item.title }];
}

/**
 * O detalhe publico (`getStoreItem`): o mesmo item da lista, mais todas as imagens
 * PRONTAS em ordem.
 */
export function projetarDetalhe(
  item: ItemDaVitrine,
  imagens: readonly ImagemDaVitrine[],
  agora: Instant,
): DetalheProjetado {
  return { ...projetarItem(item, agora), images: galeriaDoItem(item, imagens) };
}
