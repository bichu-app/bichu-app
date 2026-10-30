import { comoData } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';

/** Dez falhas em vinte e quatro horas: o numero do contrato (`x-rate-limit`). */
export const FALHAS_QUE_BLOQUEIAM = 10;
export const JANELA_DAS_FALHAS_EM_MS = 24 * 60 * 60 * 1000;

/** O motivo gravado em `audit.events.metadata.reason` que a contagem soma. */
export const MOTIVO_DA_FALHA_QUE_CONTA = 'bad_password';

/** A tentativa atual bloqueia a conta? */
export function atingiuOBloqueio(anteriores: number): boolean {
  if (!Number.isInteger(anteriores) || anteriores < 0) {
    throw new RangeError(`contagem de falhas invalida: ${String(anteriores)}`);
  }
  return anteriores + 1 >= FALHAS_QUE_BLOQUEIAM;
}

/** O inicio da janela para a tentativa feita em `agora`. */
export function inicioDaJanela(agora: Instant): Date {
  return comoData((agora - JANELA_DAS_FALHAS_EM_MS) as Instant);
}
