import type { components } from './generated/api.ts';

export type Problema = components['schemas']['Problem'];

/**
 * O `slug` do tipo do problema (RFC 9457). O painel decide por ele, nunca pelo
 * texto (`x-problem-types` do contrato): `.../problems/invalid-credentials`
 * vira `invalid-credentials`.
 */
export function tipoDoProblema(problema: unknown): string | undefined {
  if (typeof problema !== 'object' || problema === null) return undefined;
  const tipo = (problema as { type?: unknown }).type;
  if (typeof tipo !== 'string') return undefined;
  const barra = tipo.lastIndexOf('/');
  return barra === -1 ? tipo : tipo.slice(barra + 1);
}

/** Os erros por campo de `validation-failed`, na forma `errors[]` do contrato. */
export function errosDoProblema(problema: unknown): { field: string; code: string; message?: string }[] {
  if (typeof problema !== 'object' || problema === null) return [];
  const erros = (problema as { errors?: unknown }).errors;
  if (!Array.isArray(erros)) return [];
  return erros.filter(
    (e): e is { field: string; code: string; message?: string } =>
      typeof e === 'object' && e !== null && typeof (e as { field?: unknown }).field === 'string',
  );
}

/**
 * `Retry-After` em segundos, escrito por extenso como a UX pede (29.1):
 * "1 minuto", "15 minutos", "1 hora". Arredonda para cima: dizer menos tempo
 * do que falta faria a pessoa tentar cedo e bater de novo no limite.
 */
export function esperaPorExtenso(retryAfter: string | null | undefined): string {
  const segundos = Number.parseInt(retryAfter ?? '', 10);
  if (!Number.isFinite(segundos) || segundos <= 0) return '1 minuto';
  if (segundos < 3600) {
    const minutos = Math.max(1, Math.ceil(segundos / 60));
    return minutos === 1 ? '1 minuto' : `${minutos} minutos`;
  }
  const horas = Math.ceil(segundos / 3600);
  return horas === 1 ? '1 hora' : `${horas} horas`;
}

/** Segundos de `Retry-After`, para reabilitar o botao quando o prazo passar. */
export function segundosDeEspera(retryAfter: string | null | undefined): number {
  const segundos = Number.parseInt(retryAfter ?? '', 10);
  return Number.isFinite(segundos) && segundos > 0 ? segundos : 60;
}

/** O `If-Match` de um recurso: o `ETag` e a `version` entre aspas (contrato, `headers.ETag`). */
export function versaoComoEtag(version: number): string {
  return `"${version}"`;
}
