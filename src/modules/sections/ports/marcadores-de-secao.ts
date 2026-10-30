/** BICHUS-278 -- o marcador de "ja vi" de cada area com contador. */
import type { Instant, UserId } from '../../../shared/types/brands.js';
import type { SecaoComContador } from '../../../shared/db/schema.js';

export type { SecaoComContador };

export interface MarcadoresDeSecao {
  /** Os instantes de "ja vi" desta conta, por area. */
  ler(chamador: UserId): Promise<Partial<Record<SecaoComContador, Instant>>>;

  /** Idempotente: chamar duas vezes deixa o mesmo estado, com o instante novo. */
  marcarVista(chamador: UserId, secao: SecaoComContador, agora: Instant): Promise<void>;
}
