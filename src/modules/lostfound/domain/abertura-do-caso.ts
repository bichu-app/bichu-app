/** Os três que o contrato declara em `LostCaseReachPreview.blockers`. */
export type Bloqueio = 'contact_channel_unverified' | 'pet_photo_missing' | 'pet_already_lost';

export interface EstadoParaAbertura {
  /** E-mail **ou** telefone verificado. */
  readonly temCanalVerificado: boolean;
  /** Foto em `ready`. `processing` não vale: ela ainda não serve a rota pública. */
  readonly temFotoPronta: boolean;
  readonly petJaTemCasoAberto: boolean;
  readonly casosAbertosDaConta: number;
}

/** Teto de casos abertos simultâneos por conta (critério 8). */
export const TETO_DE_CASOS_ABERTOS_POR_CONTA = 3;

/** Os bloqueios, na ordem em que a tela deve resolvê-los. */
export function bloqueiosParaAbrirCaso(estado: EstadoParaAbertura): Bloqueio[] {
  const bloqueios: Bloqueio[] = [];
  if (!estado.temCanalVerificado) bloqueios.push('contact_channel_unverified');
  if (!estado.temFotoPronta) bloqueios.push('pet_photo_missing');
  if (estado.petJaTemCasoAberto) bloqueios.push('pet_already_lost');
  return bloqueios;
}

export function atingiuTetoDaConta(estado: EstadoParaAbertura): boolean {
  return estado.casosAbertosDaConta >= TETO_DE_CASOS_ABERTOS_POR_CONTA;
}

/** Onde o pet foi visto. Uma das duas, nunca nenhuma. */
import { rotuloDaArea as rotuloDeAreaCompartilhado } from '../../../shared/lugar/rotulo-de-area.js';

export interface OndeFoiVisto {
  readonly lat?: number | undefined;
  readonly lon?: number | undefined;
  readonly city?: string | undefined;
  readonly neighborhood?: string | undefined;
  readonly state?: string | undefined;
}

/** Verdadeiro quando o caso tem **centro**, e portanto pode ter raio. */
export function temCoordenada(onde: OndeFoiVisto): boolean {
  return typeof onde.lat === 'number' && typeof onde.lon === 'number';
}

/** Tem o mínimo para abrir: coordenada **ou** cidade (critério 5). */
export function temOndeSuficiente(onde: OndeFoiVisto): boolean {
  return temCoordenada(onde) || (onde.city !== undefined && onde.city.trim() !== '');
}

/** O rótulo de área que sai em **superfície pública**: "Bairro, Cidade". */
export function rotuloDaArea(onde: OndeFoiVisto): string | null {
  return rotuloDeAreaCompartilhado(onde);
}
