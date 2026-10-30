/** Quem verifica o token de acesso, do ponto de vista de `tags`. */
import type { UserId } from '../../../shared/types/brands.js';

export interface Autenticador {
  /** Lança quando o token não vale. */
  autenticar(tokenDeAcesso: string): Promise<{ readonly userId: UserId }>;
}
