/**
 * BICHUS-278 -- quantos encontros entraram na agenda DEPOIS de um instante.
 *
 * Porta deste modulo e nao do contador, pela mesma razao de
 * `lostfound/ports/contagem-de-perdidos-novos.ts`: a fronteira de modulo
 * reprova quem alcanca o `adapters` alheio, e com a contagem aqui ela mora ao
 * lado da agenda com que tem de concordar.
 */
import type { Instant } from '../../../shared/types/brands.js';

export interface RecorteDeEventosNovos {
  /** O marcador de "ja vi", ou indefinido quando a conta nunca viu a sub-aba. */
  readonly desde?: Instant | undefined;
  readonly agora: Instant;
}

export interface ContagemDeEventosNovos {
  contar(recorte: RecorteDeEventosNovos): Promise<number>;
}
