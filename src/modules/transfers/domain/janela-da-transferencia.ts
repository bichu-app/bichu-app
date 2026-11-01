import type { Instant } from '../../../shared/types/brands.js';

const HORA_EM_MS = 60 * 60 * 1000;

/** Prazo para o destinatario aceitar o convite. */
export const JANELA_PARA_ACEITAR_EM_MS = 72 * HORA_EM_MS;

/** Janela cancelavel entre o aceite e a consumacao. */
export const JANELA_CANCELAVEL_EM_MS = 24 * HORA_EM_MS;

export type StatusDaTransferencia =
  | 'pending_acceptance'
  | 'accepted'
  | 'effective'
  | 'cancelled'
  | 'expired';

export type MotivoDoCancelamento =
  | 'current_owner'
  | 'cancel_token'
  | 'lost_case_opened'
  | 'recipient_gone';

/** O que as decisoes deste arquivo precisam saber, e nada alem. */
export interface EstadoDaTransferencia {
  readonly status: StatusDaTransferencia;
  readonly inviteExpiresAt: Instant;
  readonly effectiveAt: Instant | null;
}

export function instanteDoVencimentoDoConvite(criadaEm: Instant): Instant {
  return (criadaEm + JANELA_PARA_ACEITAR_EM_MS) as Instant;
}

export function instanteDaConsumacao(aceitaEm: Instant): Instant {
  return (aceitaEm + JANELA_CANCELAVEL_EM_MS) as Instant;
}

/** O convite ainda vale? */
export function conviteAindaVale(estado: EstadoDaTransferencia, agora: Instant): boolean {
  return estado.status === 'pending_acceptance' && agora < estado.inviteExpiresAt;
}

/** O tutor atual pode cancelar? */
export function podeCancelar(estado: EstadoDaTransferencia, agora: Instant): boolean {
  if (estado.status === 'pending_acceptance') return true;
  if (estado.status !== 'accepted') return false;
  if (estado.effectiveAt === null) return false;
  return agora < estado.effectiveAt;
}

/** A janela de 24 h fechou e a posse pode mudar? */
export function podeConsumar(estado: EstadoDaTransferencia, agora: Instant): boolean {
  if (estado.status !== 'accepted') return false;
  if (estado.effectiveAt === null) return false;
  return agora >= estado.effectiveAt;
}

/** Mascara o endereco para `recipient_email_masked`. */
export function mascararEmail(email: string): string {
  const arroba = email.lastIndexOf('@');
  if (arroba <= 0) return '****';
  const local = email.slice(0, arroba);
  const dominio = email.slice(arroba);
  const prefixo = local.length >= 2 ? local.slice(0, 2) : '**';
  return `${prefixo}****${dominio}`;
}
