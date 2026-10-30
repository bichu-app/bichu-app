/** O que vai para o contrato: o texto aparado, **na caixa que a pessoa escreveu**. */
export function emailParaEnvio(bruto: string): string {
  return bruto.trim();
}

/** Conferencia tolerante: recusa o obviamente errado, aceita o incomum. */
export function emailPlausivel(bruto: string): boolean {
  const v = emailParaEnvio(bruto);
  const arroba = v.indexOf('@');
  return arroba > 0 && v.indexOf('.', arroba) > arroba + 1;
}

/** `true` quando o campo tem algo escrito e o que esta escrito nao e plausivel. */
export function erraAoSairDoCampo(bruto: string): boolean {
  const v = emailParaEnvio(bruto);
  return v !== '' && !emailPlausivel(v);
}

/** A mensagem da conferencia ao sair do campo. */
export const ERRO_AO_SAIR_DO_EMAIL = 'Confira o e-mail.';
