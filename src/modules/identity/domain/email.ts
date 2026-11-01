import { motivoDaRecusaDeEndereco } from './gramatica-de-endereco.js';

export const TAMANHO_MAXIMO_DE_EMAIL = 254;

export function normalizarEmail(bruto: string): string {
  return bruto.trim().toLowerCase();
}

/**
 * Validação de forma, deliberadamente frouxa **na estrutura** e exata **na
 * gramática do transporte**.
 */
export function emailTemFormaValida(email: string): boolean {
  if (email.length === 0 || email.length > TAMANHO_MAXIMO_DE_EMAIL) return false;
  const partes = email.split('@');
  if (partes.length !== 2) return false;
  const [local, dominio] = partes;
  if (local === undefined || dominio === undefined) return false;
  if (local.length === 0 || dominio.length < 3) return false;
  if (!dominio.includes('.') || dominio.startsWith('.') || dominio.endsWith('.')) return false;
  return motivoDaRecusaDeEndereco(email) === null;
}

/** `ma****@exemplo.com.br`. */
export function mascararEmail(email: string): string {
  const [local, dominio] = email.split('@');
  if (local === undefined || dominio === undefined) return '';
  const visivel = local.slice(0, Math.min(2, local.length));
  return `${visivel}${'*'.repeat(Math.max(4, local.length - visivel.length))}@${dominio}`;
}
