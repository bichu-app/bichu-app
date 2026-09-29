/**
 * O formulario aberto quando a sessao cai (UX 29.2): guardado no navegador e
 * devolvido quando a pessoa volta a mesma rota depois de entrar.
 *
 * Fica em `sessionStorage`, que e da aba e morre com ela. Guarda **so os campos
 * do formulario**: nada de sessao, token anti-CSRF ou senha (a senha do dialogo
 * de reautenticacao nunca entra aqui). `test/iscas.test.ts` confere isso.
 */
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
