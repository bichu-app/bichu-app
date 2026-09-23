/**
 * A porta de leitura da vitrine.
 *
 * Uma operacao so, e de proposito, pela mesma razao de `DirectoryRepository`: a
 * secao `Loja` le uma pagina e nada mais. Nao ha detalhe, nao ha contagem por
 * categoria, e **nao ha escrita** -- a ultima nao e omissao de conveniencia, e
 * o criterio 20 da BICHUS-185: enquanto a decisao 9.6 do contrato de escrita
 * nao voltar do cliente, nao existe operacao de escrita de catalogo. Porta que
 * declara o que ainda nao existe vira metodo vazio em todo dobre de teste.
 */
import type { CategoriaDaVitrine, ItemDaVitrine } from '../domain/item-da-vitrine.js';

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

export interface StoreRepository {
  listarVitrine(recorte: RecorteDaVitrine): Promise<PaginaDaVitrine>;
}
