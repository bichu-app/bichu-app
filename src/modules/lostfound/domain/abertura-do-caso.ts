/** Os dois que o contrato declara em `LostCaseReachPreview.blockers`. */
export type Bloqueio = 'contact_channel_unverified' | 'pet_already_lost';

/**
 * Os que o contrato declara em `LostCaseReachPreview.warnings`: o tutor precisa
 * saber, e **nada** aqui impede abrir o caso.
 */
export type Aviso = 'pet_photo_missing';

export interface EstadoParaAbertura {
  /** E-mail **ou** telefone verificado. */
  readonly temCanalVerificado: boolean;
  /**
   * Foto em `ready`. `processing` não vale: ela ainda não serve a rota pública.
   *
   * **Até 03/11/2026 isto era BLOQUEIO.** O cliente tirou a trava com as três
   * saídas na mesa (manter com caminho para a foto, tirar, ou abrir e cobrar
   * depois): pet perdido é questão de horas, e mandar o tutor resolver foto
   * antes de avisar a vizinhança custa as horas que importam. O fato **não
   * saiu do domínio** -- ele virou [Aviso], porque a tela precisa dizer que o
   * cartaz vai nascer sem a imagem que faz um vizinho reconhecer o animal.
   */
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
  if (estado.petJaTemCasoAberto) bloqueios.push('pet_already_lost');
  return bloqueios;
}

/**
 * Os avisos. **Nenhum deles impede abrir**, e por isso eles saem numa lista
 * própria em vez de ficarem em [bloqueiosParaAbrirCaso]: todo consumidor que
 * decide por `blockers.length > 0` continuaria travando em silêncio.
 */
export function avisosParaAbrirCaso(estado: EstadoParaAbertura): Aviso[] {
  const avisos: Aviso[] = [];
  if (!estado.temFotoPronta) avisos.push('pet_photo_missing');
  return avisos;
}

export function atingiuTetoDaConta(estado: EstadoParaAbertura): boolean {
  return estado.casosAbertosDaConta >= TETO_DE_CASOS_ABERTOS_POR_CONTA;
}

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
