/**
 * O desafio do login administrativo NA PILHA LOCAL (QA, 28/09).
 *
 * Sem ele a pilha local nao tem como entrar no painel: o reCAPTCHA Enterprise
 * so avalia do servidor de metadados do GCP, e o verificador sem configuracao
 * recusa sempre (D41). O painel em desenvolvimento, sem chave de site, manda
 * `desenvolvimento-sem-chave-de-captcha` (`admin/src/entrar/captcha.ts`).
 *
 * Tres travas, e nenhuma e opcional:
 *
 * 1. liga so com `CAPTCHA_DESENVOLVIMENTO_LOCAL` igual a
 *    {@link VALOR_QUE_LIGA_O_CAPTCHA_DE_DESENVOLVIMENTO}, por extenso; qualquer
 *    outro valor e ignorado e o verificador e o de producao;
 * 2. a API RECUSA A SUBIDA se essa variavel aparecer com
 *    `NODE_ENV=production`, fora de `ENVIRONMENT=dev`, ou com `PUBLIC_BASE_URL`
 *    ou `ADMIN_ORIGIN` num host que nao seja local
 *    (`shared/config/env.ts`, `recusaDoCaptchaDeDesenvolvimento`);
 * 3. ele aprova so o token de desenvolvimento, e nada mais: um token qualquer
 *    continua recusado, e o caminho `403 captcha-rejected` segue exercitado.
 *
 * O caminho de producao (`recaptcha-enterprise.ts`) nao muda.
 */
import type { VerificadorDeCaptcha } from '../../ports/verificador-de-captcha.js';

export const VALOR_QUE_LIGA_O_CAPTCHA_DE_DESENVOLVIMENTO = 'aprovar-token-de-desenvolvimento';
/** O mesmo de `TOKEN_DE_DESENVOLVIMENTO` em `admin/src/entrar/captcha.ts`. */
export const TOKEN_DE_DESENVOLVIMENTO = 'desenvolvimento-sem-chave-de-captcha';
/** Acima do limiar de D41 (0,5), e longe do teto: e uma nota de teste, nao de confianca. */
const NOTA_DE_DESENVOLVIMENTO = 0.9;

export function captchaDeDesenvolvimentoLigado(valor: string | undefined): boolean {
  return valor === VALOR_QUE_LIGA_O_CAPTCHA_DE_DESENVOLVIMENTO;
}

export const captchaDeDesenvolvimentoLocal: VerificadorDeCaptcha = {
  avaliar: (token) => Promise.resolve(token === TOKEN_DE_DESENVOLVIMENTO ? NOTA_DE_DESENVOLVIMENTO : undefined),
};
