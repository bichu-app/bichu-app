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
import { motivoDaRecusaDeEndereco } from './gramatica-de-endereco.js';

export const TAMANHO_MAXIMO_DE_EMAIL = 254;

export function normalizarEmail(bruto: string): string {
  return bruto.trim().toLowerCase();
}

/**
 * Validação de forma, deliberadamente frouxa **na estrutura** e exata **na
 * gramática do transporte**.
 *
 * Frouxa na estrutura porque a prova de que o endereço existe é o e-mail de
 * verificação, não uma expressão regular: regex estrita rejeita endereço válido
 * e não impede endereço inexistente. Por isso as regras de forma aqui são as
 * mínimas -- um `@`, domínio com ponto, o tamanho do RFC 5321.
 *
 * Exata na gramática porque o que a borda recusa tem de ser **a mesma classe**
 * que o envio recusa, e não uma aproximação dela. Até a BICHUS-198 esta função
 * terminava em `!/\s/.test(email)`, que deixava passar `<`, `>`, `,`, `;`, `:`,
 * `"`, `\`, NUL, os controles C1 e o NEL (`U+0085`, que o `\s` do JavaScript
 * não cobre). O efeito não era endereço entregue errado -- o `smtp-mailer` já
 * recusava --, era a **ordem** dos acontecimentos: `a@b.test;x` passava aqui, a
 * conta era criada, e só então o envio da verificação estourava. A pessoa
 * recebia 500 com a conta já existindo, em vez de 400 sem conta nenhuma.
 *
 * `motivoDaRecusaDeEndereco` é a definição única, importada também pelo
 * adaptador de envio. Não existe segunda lista para divergir desta, e
 * `borda-e-fio-recusam-a-mesma-classe.test.ts` compara as duas **em runtime**,
 * ponto de código a ponto de código, em vez de repetir a lista dentro do teste.
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

/** `ma****@exemplo.com.br`. Usado onde a tela precisa confirmar sem revelar. */
export function mascararEmail(email: string): string {
  const [local, dominio] = email.split('@');
  if (local === undefined || dominio === undefined) return '';
  const visivel = local.slice(0, Math.min(2, local.length));
  return `${visivel}${'*'.repeat(Math.max(4, local.length - visivel.length))}@${dominio}`;
}
