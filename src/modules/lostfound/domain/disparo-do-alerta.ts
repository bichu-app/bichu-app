import type { AlcanceCalculado } from '../ports/alcance-do-alerta.js';
import type { Instant } from '../../../shared/types/brands.js';

/** Os quatro estados de `AlertDispatch.reach_status`, e os quatro são distintos. */
export type EstadoDoDisparo = 'computed' | 'unavailable' | 'queued' | 'no_location';

/** O teto de destinatários por disparo (critério 9 da BICHUS-18). */
export const TETO_DE_DESTINATARIOS = 500;

/**
 * O teto de fadiga: no máximo 3 alertas por conta em 24 h (critério 6 do ADR-0006,
 * critério 10 da BICHUS-18).
 */
export const TETO_DE_FADIGA = 3;

/** A janela do teto de fadiga e a do critério 7, em milissegundos. */
export const JANELA_DE_24H_EM_MS = 24 * 60 * 60 * 1000;

/** Trinta dias, a validade da localização (critério 2 do ADR-0006). */
export const VALIDADE_DA_LOCALIZACAO_EM_MS = 30 * 24 * 60 * 60 * 1000;

/** Quantos vão receber, a partir de quem vai receber. */
export function contagemDe(alcance: AlcanceCalculado | null): number | null {
  return alcance === null ? null : alcance.destinatarios.length;
}

/** O estado em que o disparo NASCE, no instante em que o caso é aberto. */
export function estadoInicialDoDisparo(temCoordenada: boolean): EstadoDoDisparo {
  return temCoordenada ? 'queued' : 'no_location';
}

/** O critério 7: este caso pode disparar agora? */
export function podeDispararDeNovo(ultimoEnvio: Instant | null, agora: Instant): boolean {
  if (ultimoEnvio === null) return true;
  return Number(agora) - Number(ultimoEnvio) >= JANELA_DE_24H_EM_MS;
}
