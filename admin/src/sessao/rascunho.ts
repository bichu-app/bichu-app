const PREFIXO = 'bichu-adm-rascunho:';

function armazenamento(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}

export function guardarRascunho(rota: string, valores: unknown): void {
  try {
    armazenamento()?.setItem(PREFIXO + rota, JSON.stringify(valores));
  } catch {
    // Sem armazenamento (aba privada, cota): perder o rascunho e o comportamento antigo.
  }
}

/** Le e apaga: o rascunho vale uma volta so. */
export function retomarRascunho<T>(rota: string): T | undefined {
  const guarda = armazenamento();
  try {
    const texto = guarda?.getItem(PREFIXO + rota);
    if (texto === null || texto === undefined) return undefined;
    guarda?.removeItem(PREFIXO + rota);
    return JSON.parse(texto) as T;
  } catch {
    return undefined;
  }
}
