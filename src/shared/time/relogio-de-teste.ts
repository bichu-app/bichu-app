/**
 * Relógio parado, para teste.
 *
 * Existe porque a regra de lint proíbe `Date.now()` e `new Date()` em
 * `domain/**` e `application/**` — inclusive nos testes dessas camadas, e isso
 * é proposital: teste que lê o relógio da máquina é teste que falha às 23h59 do
 * último dia do mês, numa execução que ninguém consegue reproduzir. O projeto já
 * gastou uma investigação inteira atrás de uma falha intermitente.
 *
 * A saída daqui é sempre a mesma em toda execução, em qualquer fuso.
 */
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
