/** Relógio parado, para teste. */
import type { Clock } from './clock.js';
import type { Instant } from '../types/brands.js';

/** 2026-09-18T12:00:00Z. Uma data fixa qualquer, e o "qualquer" é o ponto. */
export const INSTANTE_FIXO = 1_789_128_000_000 as Instant;

export function relogioParado(instante: Instant = INSTANTE_FIXO): Clock {
  return { now: () => instante };
}

/** `Date` determinístico para montar linha de banco em teste. */
export function dataFixa(ms = 0): Date {
  return new Date(ms);
}
