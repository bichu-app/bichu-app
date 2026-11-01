import type { CategoriaDaVitrine, EspecieDoItem, SubcategoriaDaVitrine } from '../domain/item-da-vitrine.js';

/**
 * Uma subcategoria do vocabulario, com as especies para as quais ela foi
 * levantada.
 */
export interface SubcategoriaDoVocabulario {
  readonly code: SubcategoriaDaVitrine;
  readonly label: string;
  /** As especies para as quais esta subcategoria foi LEVANTADA. */
  readonly species: readonly EspecieDoItem[];
}

/** Uma categoria do vocabulario, com as subcategorias ATIVAS dela. */
export interface CategoriaDoVocabulario {
  readonly code: CategoriaDaVitrine;
  readonly label: string;
  /**
   * **Vazia e estado normal e esperado**: categoria cuja arvore de segundo nivel
   * ainda nao foi levantada simplesmente nao oferece subcategoria.
   */
  readonly subcategories: readonly SubcategoriaDoVocabulario[];
}

export interface TaxonomiaDaVitrine {
  readonly categories: readonly CategoriaDoVocabulario[];
}

export interface TaxonomiaDaVitrineRepository {
  /** So o que esta ATIVO, em ordem de exibicao. */
  carregar(): Promise<TaxonomiaDaVitrine>;
}
