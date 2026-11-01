import type { Instant } from '../../../shared/types/brands.js';

export interface RecorteDeEventosNovos {
  /** O marcador de "ja vi", ou indefinido quando a conta nunca viu a sub-aba. */
  readonly desde?: Instant | undefined;
  readonly agora: Instant;
}

export interface ContagemDeEventosNovos {
  contar(recorte: RecorteDeEventosNovos): Promise<number>;
}
