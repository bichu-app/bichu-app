/**
 * A porta de leitura PUBLICA da vitrine: a lista, o detalhe e as tags do filtro
 * (ADR-0027 item 16).
 */
import type {
  CategoriaDaVitrine,
  EspecieDoItem,
  ImagemDaVitrine,
  ItemDaVitrine,
  SubcategoriaDaVitrine,
  TagDaVitrine,
} from '../domain/item-da-vitrine.js';

/** As ordens que a rota aceita. */
export type OrdemDaVitrine = 'curadoria' | 'nome';

export interface RecorteDaVitrine {
  /**
   * O termo de busca. Procura em titulo e resumo, **no servidor**, e por isso a tela
   * declara [AlcanceDaBusca.servidor].
   */
  readonly q?: string | undefined;
  readonly category?: CategoriaDaVitrine | undefined;
  /**
   * O segundo nivel. **Independe de `category`**: o par do item ja e coerente por
   * chave estrangeira, entao filtrar so pela subcategoria e correto.
   */
  readonly subcategory?: SubcategoriaDaVitrine | undefined;
  /** Itens que servem a esta especie, entre outras. */
  readonly species?: EspecieDoItem | undefined;
  /** `slug` de uma tag ATIVA. */
  readonly tag?: string | undefined;
  readonly sort: OrdemDaVitrine;
  /** 1-based, como o contrato a declara. */
  readonly page: number;
  readonly limit: number;
}

export interface PaginaDaVitrine {
  readonly itens: readonly ItemDaVitrine[];
  /** O total do RECORTE, nao o da tabela. */
  readonly total: number;
}

export interface DetalheDaVitrine {
  readonly item: ItemDaVitrine;
  /** So as PRONTAS, em ordem. */
  readonly imagens: readonly ImagemDaVitrine[];
}

export interface StoreRepository {
  listarVitrine(recorte: RecorteDaVitrine): Promise<PaginaDaVitrine>;
  /** O item publicado, de parceiro ativo. */
  detalhe(slug: string): Promise<DetalheDaVitrine | null>;
  /**
   * Tags ativas com pelo menos um item publicado de parceiro ativo, em ordem
   * alfabetica, ate 40.
   */
  tagsVisiveis(): Promise<readonly TagDaVitrine[]>;
}
