import type { UserId } from '../../../shared/types/brands.js';

/** Uma pessoa como a busca a entrega: **quatro campos, e nada mais**. */
export interface PessoaEncontrada {
  /**
   * A chave de objeto da derivada **`thumb`** da foto, ou `null` quando não há foto
   * pronta.
   */
  readonly photoKey: string | null;
  /** O apelido. Referência pública, e o endereço do perfil. */
  readonly handle: string;
  /**
   * O nome de exibição, **anulável**: a coluna é anulável em `users`, e omitir a
   * pessoa por falta de nome a faria desaparecer da busca por um campo que ela não
   * preencheu.
   */
  readonly displayName: string | null;
  /** Quantos pets, **e nada além do número** (emenda 2 do ADR-0010). */
  readonly petsCount: number;
  /** Quantas conexões aceitas. */
  readonly connectionsCount: number;
}

/** Uma página de resultados. */
export interface PaginaDeBuscaDePessoas {
  readonly itens: readonly PessoaEncontrada[];
  readonly total: number;
}

export interface BuscaDePessoasRepository {
  /** As pessoas cujo **nome ou apelido** casam `termo`, vistas por `quemBusca`. */
  buscar(
    termo: string,
    quemBusca: UserId,
    pagina: number,
    limite: number,
  ): Promise<PaginaDeBuscaDePessoas>;
}
