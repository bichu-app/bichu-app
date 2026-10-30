/** O raio do alerta. Fixo em 5 km no MVP — raio configurável está fora de escopo. */
export const RAIO_DO_ALERTA_EM_METROS = 5000;

/** Os três que o `enum` de `LostCaseReachPreview.reach_status` declara. */
export type EstadoDoAlcance = 'computed' | 'unavailable' | 'no_location';

/** Onde o raio é centrado. Uma coordenada, ou nenhuma. */
export interface CentroDoAlcance {
  readonly lat: number;
  readonly lon: number;
}

export interface Alcance {
  readonly estado: EstadoDoAlcance;
  readonly tutoresAlcancaveis: number | null;
}

/** Traduz "havia centro?" mais "a contagem respondeu?" nas três respostas. */
export function alcanceDe(
  centro: CentroDoAlcance | undefined,
  contagem: number | null,
): Alcance {
  if (centro === undefined) return { estado: 'no_location', tutoresAlcancaveis: null };
  if (contagem === null) return { estado: 'unavailable', tutoresAlcancaveis: null };
  return { estado: 'computed', tutoresAlcancaveis: contagem };
}

/** O centro, a partir do que chegou na consulta. */
export function centroDe(
  lat: number | undefined,
  lon: number | undefined,
): CentroDoAlcance | undefined {
  if (typeof lat !== 'number' || typeof lon !== 'number') return undefined;
  return { lat, lon };
}
