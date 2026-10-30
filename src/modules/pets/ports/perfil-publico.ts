/** Porta da leitura do perfil público do pet, pelo endereço (`/@{slug}`). */
export type EspecieDoPerfil = 'dog' | 'cat' | 'other';
export type PorteDoPerfil = 'P' | 'M' | 'G' | 'GG';

export interface PerfilPublicoDoPet {
  readonly slug: string;
  readonly nome: string;
  readonly especie: EspecieDoPerfil;
  readonly porte: PorteDoPerfil;
  /** Rótulo da lista quando há código; o texto do tutor quando não há. */
  readonly racaRotulo: string | null;
  readonly corRotulo: string | null;
  readonly marcas: string | null;
  /** Chave da derivada `card` da foto principal pronta. */
  readonly chaveDaFoto: string | null;
  /** Há caso de perdido ABERTO para este pet. */
  readonly estaPerdido: boolean;
}

export interface LeituraDoPerfilPublico {
  porSlug(slug: string): Promise<PerfilPublicoDoPet | undefined>;
}
