/**
 * Normalização de e-mail.
 *
 * O que é normalizado: espaços em volta e a caixa do domínio inteiro mais a da
 * parte local. A coluna é `citext` e a comparação já ignora caixa, mas o valor
 * gravado precisa ser o que o tipo produz e não o que o cliente enviou — o mesmo
 * princípio de canonicalizar identificador antes de confiar nele.
 *
 * O que **não** é normalizado, e isso é decisão e não omissão: pontos na parte
 * local e o sufixo `+etiqueta`. Removê-los é hábito comum e está errado, porque
 * a equivalência entre `a.b@` e `ab@` é regra de um provedor específico, não do
 * SMTP. Aplicá-la a todo mundo faria duas pessoas de um domínio corporativo
 * disputarem a mesma conta.
 */
export const TAMANHO_MAXIMO_DE_EMAIL = 254;

export function normalizarEmail(bruto: string): string {
  return bruto.trim().toLowerCase();
}

/**
 * Validação de forma, deliberadamente frouxa. A prova de que o endereço existe é
 * o e-mail de verificação, não uma expressão regular: regex estrita rejeita
 * endereço válido e não impede endereço inexistente.
 */
export function emailTemFormaValida(email: string): boolean {
  if (email.length === 0 || email.length > TAMANHO_MAXIMO_DE_EMAIL) return false;
  const partes = email.split('@');
  if (partes.length !== 2) return false;
  const [local, dominio] = partes;
  if (local === undefined || dominio === undefined) return false;
  if (local.length === 0 || dominio.length < 3) return false;
  if (!dominio.includes('.') || dominio.startsWith('.') || dominio.endsWith('.')) return false;
  return !/\s/.test(email);
}

/** `ma****@exemplo.com.br`. Usado onde a tela precisa confirmar sem revelar. */
export function mascararEmail(email: string): string {
  const [local, dominio] = email.split('@');
  if (local === undefined || dominio === undefined) return '';
  const visivel = local.slice(0, Math.min(2, local.length));
  return `${visivel}${'*'.repeat(Math.max(4, local.length - visivel.length))}@${dominio}`;
}
