/**
 * A porta do VOCABULARIO dos dois niveis da categoria do produto.
 *
 * ## Por que existe uma porta so para isto
 *
 * Em 17/10/2026 o cliente decidiu "dois niveis, com subcategorias como a
 * petlove": 14 categorias e 83 subcategorias. A lista continua fechada, e o que
 * mudou e quem a fecha -- deixou de ser o `CHECK` da `20260922000023`
 * espelhado no `enum` do contrato, e passou a ser a chave estrangeira de
 * `store_items.category` contra `store_categories` (migracao
 * `20261017000003`).
 *
 * Fechada numa TABELA, a lista precisa de um caminho de leitura para a tela
 * oferecer o segundo nivel e para o painel filtrar um pelo outro. E esse
 * caminho e esta porta.
 *
 * ## Por que nao entrou em `reference-data`
 *
 * `GET /v1/public/reference-data` e do modulo de PETS
 * (`modules/pets/ports/reference-data-repository.ts`), e ja carrega especie,
 * raca, porte e cor. Servir lista fechada da Loja por ela faria o modulo de
 * pets ler `store_*`, que e a fronteira que `src/architecture.rules.mjs`
 * cobra: "modulo so conversa com modulo por porta".
 *
 * A forma seguida e a de `listStoreTags`, que ja e exatamente isto -- a Loja
 * servindo o proprio vocabulario fechado para o filtro do app, publica, com
 * teto por `ip`.
 */
import type { CategoriaDaVitrine, EspecieDoItem, SubcategoriaDaVitrine } from '../domain/item-da-vitrine.js';

/** Uma subcategoria do vocabulario, com as especies para as quais ela foi levantada. */
export interface SubcategoriaDoVocabulario {
  readonly code: SubcategoriaDaVitrine;
  readonly label: string;
  /**
   * As especies para as quais esta subcategoria foi LEVANTADA.
   *
   * **Vazia quer dizer "vale para todas", e nao "para nenhuma".** A arvore de
   * 17/10 e a de CACHORRO da petlove, entao hoje toda subcategoria traz `dog`;
   * gato, passaro, peixe e outros ficaram de fora e precisam ser levantados.
   *
   * Nenhuma tela filtra por isto ainda: o recorte pedido e "subcategoria
   * filtrada pela CATEGORIA escolhida". O campo existe para a arvore de gato
   * ter onde chegar sem mudanca de contrato.
   */
  readonly species: readonly EspecieDoItem[];
}

/** Uma categoria do vocabulario, com as subcategorias ATIVAS dela. */
export interface CategoriaDoVocabulario {
  readonly code: CategoriaDaVitrine;
  readonly label: string;
  /**
   * **Vazia e estado normal e esperado**: categoria cuja arvore de segundo
   * nivel ainda nao foi levantada simplesmente nao oferece subcategoria.
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
