/** Relógio injetável. */
import type { Instant } from '../types/brands.js';

export interface Clock {
  now(): Instant;
}

/**
 * Implementação real. Vive aqui, e este é o ÚNICO arquivo de `src/` autorizado a
 * chamar `Date.now()`.
 */
export const systemClock: Clock = {
  now: () => Date.now() as Instant,
};

/** Converte um instante para `Date`, e mora aqui pelo mesmo motivo do relógio. */
export function comoData(instante: Instant): Date {
  return new Date(instante);
}

/** O mesmo, para o formato que o contrato usa no fio (`format: date-time`). */
export function comoIso(instante: Instant): string {
  return new Date(instante).toISOString();
}

/**
 * O caminho de VOLTA: um texto ISO-8601 vira `Instant`, ou `undefined` quando não
 * é data.
 */
export function comoInstante(iso: string): Instant | undefined {
  const milissegundos = new Date(iso).getTime();
  return Number.isNaN(milissegundos) ? undefined : (milissegundos as Instant);
}
