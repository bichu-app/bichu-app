/**
 * Resposta de erro no formato Problem Details (RFC 9457).
 *
 * Regra de contrato: **o cliente decide por `type`, nunca pelo texto de `title`
 * ou `detail`.** Por isso `type` é uma união fechada e não uma string livre:
 * inventar um tipo novo no meio do código não compila, e todo tipo novo passa
 * pela especificação primeiro.
 */
import type { AbsoluteUrl } from '../types/brands.js';

export type ProblemType =
  | 'validation-failed'
  | 'email-already-registered'
  | 'weak-password'
  | 'token-expired'
  | 'reauthentication-required'
  | 'contact-channel-unverified'
  | 'pet-photo-missing'
  | 'pet-already-lost'
  | 'pet-limit-reached'
  | 'tag-revoked'
  | 'tag-code-malformed'
  | 'tag-code-not-found'
  | 'slug-taken'
  | 'conversation-closed'
  | 'transfer-not-for-this-account'
  | 'rate-limited'
  | 'forbidden'
  | 'not-found'
  | 'internal';

/** Caminho alternativo, quando existe um. Nunca deixa ninguém sem saída. */
export type NextAction =
  | 'register_stray_found_report'
  | 'verify_email'
  | 'upload_pet_photo'
  | 'sign_in';

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
