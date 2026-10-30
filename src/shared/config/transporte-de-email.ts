/** Os transportes que `MAIL_TRANSPORT` aceita. */
export type TransporteDeEmail = 'smtp' | 'postmark' | 'log';

/** O padrão de `MAIL_TRANSPORT`, e o que `dev` usa: o receptor local. */
export const TRANSPORTE_DE_EMAIL_PADRAO: TransporteDeEmail = 'smtp';

/** Qual transporte de e-mail exige o token do provedor. */
export function exigeTokenDoProvedor(transporte: string): boolean {
  return transporte === 'postmark';
}

/** O transporte que ESTE processo vai usar, lido do ambiente. */
export function transporteDeEmailDoAmbiente(
  ambiente: Record<string, string | undefined> = process.env,
): string {
  const bruto = ambiente['MAIL_TRANSPORT'];
  return bruto === undefined || bruto.trim() === '' ? TRANSPORTE_DE_EMAIL_PADRAO : bruto;
}
