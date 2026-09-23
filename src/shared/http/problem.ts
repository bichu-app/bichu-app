/**
 * Resposta de erro no formato Problem Details (RFC 9457).
 *
 * Regra de contrato: **o cliente decide por `type`, nunca pelo texto de `title`
 * ou `detail`.** Por isso `type` é uma união fechada e não uma string livre.
 *
 * A união **não é escrita aqui**. Ela é gerada de `x-problem-types` de
 * `api/openapi.yaml` (`src/tools/gerar-tipos-de-problema.mjs`) e chega junto do
 * status de cada tipo. Escrever a lista à mão ao lado do contrato era duas
 * fontes para a mesma coisa, e foi assim que `forbidden` acabou saindo com 401.
 */
import type { AbsoluteUrl } from '../types/brands.js';

export { STATUS_DO_PROBLEMA } from '../types/generated/problem-types.js';
export type { ProblemType } from '../types/generated/problem-types.js';

/** Caminho alternativo, quando existe um. Nunca deixa ninguém sem saída. */
export type NextAction =
  | 'register_stray_found_report'
  | 'verify_email'
  | 'upload_pet_photo'
  | 'sign_in'
  /**
   * O 429 de janela que reabre. A saída é esperar, e ela só vira caminho quando
   * o cliente sabe que pode esperar: sem `next_action` a tela do teto era a
   * única do vocabulário que terminava sem nada para fazer, embora a resposta
   * já carregasse o `Retry-After` que a destrava. Com este valor, o app arma o
   * reenvio (ou a contagem regressiva) em cima do cabeçalho em vez de oferecer
   * um botão que recusa de novo.
   *
   * **Não** acompanha o teto que não reabre (`problemas.limiteSemReabertura`):
   * ali esperar não resolve, e mandar esperar seria a mesma mentira que este
   * trabalho veio tirar do corpo.
   */
  | 'retry_later';

export interface ProblemFieldError {
  readonly field: string;
  readonly code: string;
  readonly message?: string;
}

export interface Problem {
  readonly type: AbsoluteUrl;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance?: string;
  /** Mesmo identificador propagado no log e no trace. */
  readonly correlationId: string;
  readonly nextAction?: NextAction;
  readonly errors?: readonly ProblemFieldError[];
}
