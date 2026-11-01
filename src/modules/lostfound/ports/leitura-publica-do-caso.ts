import type { UserId } from '../../../shared/types/brands.js';

export type EspecieDoCaso = 'dog' | 'cat' | 'other';
export type PorteDoCaso = 'P' | 'M' | 'G' | 'GG';

/** O caso como a superfície pública pode vê-lo. */
export interface CasoPublico {
  readonly shareToken: string;
  /**
   * Falso quando o caso foi encerrado, ou quando o pet foi excluído, marcado como
   * falecido ou arquivado.
   */
  readonly aberto: boolean;
  /** O caso terminou **porque o animal voltou**, e o pet continua de pé. */
  readonly reencontrado: boolean;
  readonly petNome: string;
  readonly especie: EspecieDoCaso;
  readonly porte: PorteDoCaso;
  /** Rótulo da lista quando há código; o texto do tutor quando não há. */
  readonly racaRotulo: string | null;
  readonly corRotulo: string | null;
  readonly marcas: string | null;
  readonly cuidados: string | null;
  readonly descricao: string | null;
  /** `lost_cases.last_seen_at`: quando o animal sumiu, e não quando o caso abriu. */
  readonly vistoPorUltimoEm: Date;
  readonly cidade: string | null;
  readonly bairro: string | null;
  /** Chave da derivada `card` da foto principal pronta. */
  readonly chaveDaFoto: string | null;
  /** O chamador autenticado é o tutor do caso. */
  readonly doChamador: boolean;
}

export interface LeituraPublicaDoCaso {
  /** O caso do token, ou `undefined` quando o token não existe. */
  porShareToken(shareToken: string, chamador: UserId | undefined): Promise<CasoPublico | undefined>;
}
