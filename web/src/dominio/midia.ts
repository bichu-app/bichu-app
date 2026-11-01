export function origemDaMidia(valor: string | undefined): string | null {
  if (!valor) return null;
  try {
    const url = new URL(valor);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * A foto so aparece se vier da origem da midia: a CSP bloquearia qualquer
 * outra, e uma imagem quebrada e pior que a tela de "sem foto".
 */
export function fotoPermitida(fotoUrl: string | null | undefined, origem: string | null): string | null {
  if (!fotoUrl || !origem) return null;
  try {
    return new URL(fotoUrl).origin === origem ? fotoUrl : null;
  } catch {
    return null;
  }
}
