/** BICHUS-278 -- quantas entradas entraram no diretorio DEPOIS de um instante. */
import type { Instant } from '../../../shared/types/brands.js';
import type { UserId } from '../../../shared/types/brands.js';

export interface RecorteDeEntradasNovas {
  /**
   * Quem chama. **Nao e filtro:** o construtor da listagem o exige para a ordenacao
   * por distancia, e esta contagem nao ordena.
   */
  readonly chamador: UserId;
  /** O marcador de "ja vi", ou indefinido quando a conta nunca viu a sub-aba. */
  readonly desde?: Instant | undefined;
  readonly agora: Instant;
}

export interface ContagemDeEntradasNovas {
  contar(recorte: RecorteDeEntradasNovas): Promise<number>;
}
