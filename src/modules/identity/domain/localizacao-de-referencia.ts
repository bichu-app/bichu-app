import type { Instant } from '../../../shared/types/brands.js';

/** O lado da célula como ele SAI na resposta (`UserLocation.precision_m`). */
export const PRECISAO_EM_METROS = 100;

/** Passo da grade, em graus. */
export const PASSO_DA_GRADE_EM_GRAUS = 0.001;

const FATOR_DA_GRADE = Math.round(1 / PASSO_DA_GRADE_EM_GRAUS);

/** 30 dias (ADR-0010, tabela de retenção). */
export const VALIDADE_EM_DIAS = 30;

const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

export type OrigemDaLocalizacao = 'device_gps' | 'map_pin';

export interface Coordenada {
  readonly lat: number;
  readonly lon: number;
}

/** Snap para o vértice de grade mais próximo. */
export function quantizar(coordenada: Coordenada): Coordenada {
  return {
    lat: Math.round(coordenada.lat * FATOR_DA_GRADE) / FATOR_DA_GRADE + 0,
    lon: Math.round(coordenada.lon * FATOR_DA_GRADE) / FATOR_DA_GRADE + 0,
  };
}

/** Quando a localização capturada neste instante deixa de valer. */
export function validadeDe(capturadaEm: Instant): Instant {
  return (capturadaEm + VALIDADE_EM_DIAS * MILISSEGUNDOS_POR_DIA) as Instant;
}

/** A localização como ela existe depois de gravada. */
export interface LocalizacaoDeReferencia {
  readonly lat: number;
  readonly lon: number;
  readonly precisaoEmMetros: number;
  readonly origem: OrigemDaLocalizacao;
  readonly capturadaEm: Instant;
  readonly expiraEm: Instant;
}

/** Monta a localização a gravar a partir do que chegou do cliente. */
export function localizacaoAGravar(
  bruta: Coordenada,
  origem: OrigemDaLocalizacao,
  agora: Instant,
): LocalizacaoDeReferencia {
  const { lat, lon } = quantizar(bruta);
  return {
    lat,
    lon,
    precisaoEmMetros: PRECISAO_EM_METROS,
    origem,
    capturadaEm: agora,
    expiraEm: validadeDe(agora),
  };
}

/** Vencida, a conta sai da base de alerta. */
export function estaValida(localizacao: LocalizacaoDeReferencia, agora: Instant): boolean {
  return localizacao.expiraEm > agora;
}
