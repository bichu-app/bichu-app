import type { UserId } from '../../../shared/types/brands.js';

/**
 * Uma pessoa como a LISTAGEM DA REGIÃO a entrega: **quatro campos, e nada
 * mais** — `RegionPerson` sem `connection_state`, que a aplicação acrescenta.
 *
 * **NÃO HÁ `photoKey` AQUI, e a ausência é estrutural e não um `if`**: a porta
 * não tem onde carregar a foto, então nenhuma camada acima dela pode decidir
 * mostrá-la. O motivo está em `RegionPerson`: os três freios que tornaram a
 * foto defensável na busca (exige conta, piso de três caracteres, campo vazio
 * não lista ninguém) garantem que *"quem vê a foto é alguém que já sabe
 * aproximadamente quem procura, e não alguém folheando"* — e esta lista é, por
 * construção, alguém folheando.
 */
export interface PessoaDaRegiao {
  /** O apelido. Referência pública, e o endereço do perfil. */
  readonly handle: string;
  /**
   * O nome de exibição, **anulável**: a coluna é anulável em `users`, e omitir
   * a pessoa por falta de nome a faria desaparecer da lista por um campo que
   * ela não preencheu.
   */
  readonly displayName: string | null;
  /** Quantos pets, **e nada além do número** (emenda 2 do ADR-0010). */
  readonly petsCount: number;
  /** Quantas conexões aceitas. */
  readonly connectionsCount: number;
}

/** Uma página da listagem. */
export interface PaginaDaListaDaRegiao {
  readonly itens: readonly PessoaDaRegiao[];
  readonly total: number;
}

export interface ListaDaRegiaoRepository {
  /**
   * As pessoas da MESMA região de `quemVe` que **aderiram** a aparecer na
   * lista, vistas por `quemVe`.
   *
   * **A assinatura não recebe região nenhuma, e isso é a fronteira inteira
   * desta porta**: a região sai da própria conta de `quemVe`, dentro da
   * consulta. Uma assinatura que aceitasse `cidade` deixaria quem chama
   * escolher a região que quer olhar — e aí a listagem seria uma busca
   * geográfica, sem nenhum dos freios de uma busca.
   */
  listar(quemVe: UserId, pagina: number, limite: number): Promise<PaginaDaListaDaRegiao>;
}
