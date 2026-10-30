/** O VEREDITO: a unica funcao que decide se o aplicativo fecha. */
import { compararVersoes } from '../domain/versao.js';
import type { PoliticaDeVersao } from '../ports/politica-de-versao.js';

/** Os tres vereditos do contrato (`AppVersionStatus.verdict`). */
export type VereditoDeVersao = 'supported' | 'update_recommended' | 'update_required';

export interface Veredito {
  readonly verdict: VereditoDeVersao;
  readonly storeUrl: string | null;
}

/** O veredito liberado, sem loja. */
export const LIBERADO: Veredito = { verdict: 'supported', storeUrl: null };

/** `true` somente quando [versao] e PROVADAMENTE menor que [piso]. */
export function provadamenteAbaixo(
  versao: string | null | undefined,
  piso: string | null | undefined,
): boolean {
  if (piso === null || piso === undefined || piso === '') return false;
  const ordem = compararVersoes(versao, piso);
  if (ordem === undefined) return false;
  return ordem < 0;
}

/** O veredito para [versaoDoApp] sob [politica]. */
export function vereditoPara(
  versaoDoApp: string | null | undefined,
  politica: PoliticaDeVersao | undefined,
): Veredito {
  if (politica === undefined) return LIBERADO;

  const loja = politica.storeUrl === '' ? null : politica.storeUrl;

  if (provadamenteAbaixo(versaoDoApp, politica.minimumVersion)) {
    return { verdict: 'update_required', storeUrl: loja };
  }
  if (provadamenteAbaixo(versaoDoApp, politica.recommendedVersion)) {
    return { verdict: 'update_recommended', storeUrl: loja };
  }
  return LIBERADO;
}
