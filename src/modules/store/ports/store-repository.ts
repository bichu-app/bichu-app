/**
 * A porta de leitura PUBLICA da vitrine: a lista, o detalhe e as tags do
 * filtro (ADR-0027 item 16).
 *
 * **Nao ha escrita aqui.** A escrita do catalogo e do painel, pela porta
 * `CatalogoAdministrativoRepository`, atras da guarda de `/v1/admin`. Esta porta
 * so enxerga o que esta publicado, de parceiro ativo, e a regra mora na
 * clausula `WHERE` de cada consulta (ADR-0021).
 */
import type {
  CategoriaDaVitrine,
  EspecieDoItem,
  ImagemDaVitrine,
  ItemDaVitrine,
  TagDaVitrine,
} from '../domain/item-da-vitrine.js';

/**
 * As ordens que a rota aceita.
 *
 * `curadoria` e a ordem da vitrine (`sort_order`), e e o default: a Loja e uma
 * lista escolhida a mao, e a primeira coisa que ela comunica e a escolha.
 *
 * **Nao ha ordem por preco, e a ausencia e decisao.** Preco e opcional e vence;
 * ordenar por um campo que falta em parte dos itens e que some quando envelhece
 * produziria uma lista que se reordena sozinha sem ninguem ter mexido em nada.
 * Pior: "do mais barato" e uma afirmacao comparativa sobre a vitrine, e o
 * criterio 19 proibe comparacao de preco.
 */
export type OrdemDaVitrine = 'curadoria' | 'nome';

export interface RecorteDaVitrine {
  /**
   * O termo de busca. Procura em titulo e resumo, **no servidor**, e por isso a
   * tela declara [AlcanceDaBusca.servidor]. Filtrar em memoria os 20 itens da
   * pagina seria uma busca que funciona com 10 registros e mente com 200.
   */
  readonly q?: string | undefined;
  readonly category?: CategoriaDaVitrine | undefined;
  /** Itens que servem a esta especie, entre outras. */
  readonly species?: EspecieDoItem | undefined;
  /**
   * `slug` de uma tag ATIVA. Tag inexistente ou inativa devolve a lista vazia,
   * e nao erro: o link antigo continua abrindo.
   */
  readonly tag?: string | undefined;
  readonly sort: OrdemDaVitrine;
  /** 1-based, como o contrato a declara. */
  readonly page: number;
  readonly limit: number;
}

export interface PaginaDaVitrine {
  readonly itens: readonly ItemDaVitrine[];
  /**
   * O total do RECORTE, nao o da tabela. E ele que alimenta "1 a 10 de 10" e a
   * linha de resumo da barra de listagem; o total da tabela faria a tela
   * prometer paginas que o filtro nao tem.
   */
  readonly total: number;
}

export interface DetalheDaVitrine {
  readonly item: ItemDaVitrine;
  /** So as PRONTAS, em ordem. */
  readonly imagens: readonly ImagemDaVitrine[];
}

export interface StoreRepository {
  listarVitrine(recorte: RecorteDaVitrine): Promise<PaginaDaVitrine>;
  /**
   * O item publicado, de parceiro ativo. Rascunho, retirado, inexistente e de
   * parceiro inativo sao o MESMO `null` (ADR-0021): o 404 nao conta qual.
   */
  detalhe(slug: string): Promise<DetalheDaVitrine | null>;
  /** Tags ativas com pelo menos um item publicado de parceiro ativo, em ordem alfabetica, ate 40. */
  tagsVisiveis(): Promise<readonly TagDaVitrine[]>;
}
