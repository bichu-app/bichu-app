/** Dados de referência de espécie, raça, porte e cor. */
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
  /**
   * Só o que está ativo. Código retirado continua no banco por causa dos pets já
   * cadastrados.
   */
  carregar(): Promise<DadosDeReferencia>;
}
