/**
 * Quem verifica o token de acesso, do ponto de vista de `tags`.
 *
 * A porta é declarada aqui, pelo módulo que **precisa** dela, e não pelo módulo
 * que a implementa (§6 e §11.3 de docs/03-arquitetura.md). O que `tags` precisa
 * saber de uma sessão é uma coisa só: **de quem ela é**. Nome, e-mail, papéis e
 * validade da família de tokens não entram aqui, e o resultado é que nenhuma
 * rota deste módulo tem como devolver dado de conta por engano — o dado não
 * chega até ela.
 *
 * Quem liga esta porta ao serviço de identidade é a composição em
 * `src/bin/api.ts`, que é o único lugar do sistema que conhece os dois lados.
 */
import type { UserId } from '../../../shared/types/brands.js';

export interface Autenticador {
  /** Lança quando o token não vale. Nunca devolve um chamador não verificado. */
  autenticar(tokenDeAcesso: string): Promise<{ readonly userId: UserId }>;
}
