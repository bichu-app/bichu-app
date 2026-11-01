import type { AbsoluteUrl } from '../types/brands.js';

export { STATUS_DO_PROBLEMA } from '../types/generated/problem-types.js';
export type { ProblemType } from '../types/generated/problem-types.js';

/** Caminho alternativo, quando existe um. */
export type NextAction =
  | 'register_stray_found_report'
  | 'verify_email'
  | 'upload_pet_photo'
  | 'sign_in'
  /** O 429 de janela que reabre. */
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
