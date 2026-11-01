import type { Instant } from '../../../shared/types/brands.js';

export interface RecorteDePerdidosNovos {
  /**
   * O instante do marcador de "ja vi", ou **indefinido quando a conta nunca viu a
   * area**.
   */
  readonly desde?: Instant | undefined;
  /** A cidade DIGITADA, nunca coordenada (ADR-0006). */
  readonly cidade?: string | undefined;
  readonly agora: Instant;
}

export interface ContagemDePerdidosNovos {
  contar(recorte: RecorteDePerdidosNovos): Promise<number>;
}
