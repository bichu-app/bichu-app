import type { VerificadorDeCaptcha } from '../../ports/verificador-de-captcha.js';

export const VALOR_QUE_LIGA_O_CAPTCHA_DE_DESENVOLVIMENTO = 'aprovar-token-de-desenvolvimento';
/** O mesmo de `TOKEN_DE_DESENVOLVIMENTO` em `admin/src/entrar/captcha.ts`. */
export const TOKEN_DE_DESENVOLVIMENTO = 'desenvolvimento-sem-chave-de-captcha';
const NOTA_DE_DESENVOLVIMENTO = 0.9;

export function captchaDeDesenvolvimentoLigado(valor: string | undefined): boolean {
  return valor === VALOR_QUE_LIGA_O_CAPTCHA_DE_DESENVOLVIMENTO;
}

export const captchaDeDesenvolvimentoLocal: VerificadorDeCaptcha = {
  avaliar: (token) => Promise.resolve(token === TOKEN_DE_DESENVOLVIMENTO ? NOTA_DE_DESENVOLVIMENTO : undefined),
};
