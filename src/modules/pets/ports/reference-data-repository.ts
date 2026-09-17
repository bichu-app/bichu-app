/**
 * Dados de referência de espécie, raça, porte e cor.
 *
 * A porta pertence a `pets` porque é o cadastro do pet e o registro de achado
 * que dependem dela. Ela existe porque o cruzamento por atributos não pode
 * depender de texto livre: raça digitada à mão produz falso negativo justamente
 * no caso que importa, que é o cruzamento entre um caso de perdido e um achado
 * avulso descritos por duas pessoas diferentes.
 */
export type CodigoDeEspecie = 'dog' | 'cat' | 'other';
export type CodigoDePorte = 'P' | 'M' | 'G' | 'GG';

export interface ItemDeReferencia {
  readonly code: string;
  readonly label: string;
}

export interface Raca extends ItemDeReferencia {
  readonly species: CodigoDeEspecie;
}

export interface Porte {
  readonly code: CodigoDePorte;
  readonly label: string;
  readonly weightHint: string;
}

export interface DadosDeReferencia {
  /** Versão do conjunto. Vai na resposta e serve de `ETag`. */
  readonly version: string;
  readonly species: readonly { code: CodigoDeEspecie; label: string }[];
  readonly breeds: readonly Raca[];
  readonly colors: readonly ItemDeReferencia[];
  readonly sizes: readonly Porte[];
}

export interface ReferenceDataRepository {
  /** Só o que está ativo. Código retirado continua no banco por causa dos pets já cadastrados. */
  carregar(): Promise<DadosDeReferencia>;
}
