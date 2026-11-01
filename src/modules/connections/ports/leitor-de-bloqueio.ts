import type { UserId } from '../../../shared/types/brands.js';

export interface LeitorDeBloqueio {
  /** Existe bloqueio entre estes dois, **em qualquer direção**? */
  existeBloqueioEntre(um: UserId, outro: UserId): Promise<boolean>;
}

/** A fiação de hoje, enquanto a fatia E não desce: **nenhum bloqueio conhecido**. */
export const semBloqueioConhecido: LeitorDeBloqueio = {
  existeBloqueioEntre: () => Promise.resolve(false),
};
