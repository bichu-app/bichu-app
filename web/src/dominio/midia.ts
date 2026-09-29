// A origem da midia publica (img.bichu.app), lida de MEDIA_PUBLIC_BASE_URL.
// Ela e a unica origem de imagem de fora que a CSP aceita (ADR-0028, item 7).

/** Origem normalizada (o esquema mais o host de MEDIA_PUBLIC_BASE_URL), ou null se a variavel faltar ou nao for URL http(s). */
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
