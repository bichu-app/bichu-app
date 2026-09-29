/**
 * O desafio antiautomacao do login administrativo (D41, ADR-0027 item 5).
 *
 * Devolve a nota do reCAPTCHA v3, ou `undefined` quando o token nao pode ser
 * avaliado (ausente, forjado, expirado, provedor fora do ar). Quem decide o que
 * a nota significa e o servico, com o limiar de 0,5: a porta so mede.
 */
export interface VerificadorDeCaptcha {
  avaliar(token: string | undefined, acaoEsperada: string): Promise<number | undefined>;
}

/** O limiar de D41. Abaixo dele, `403 captcha-rejected`. */
export const NOTA_MINIMA_DO_CAPTCHA_ADMINISTRATIVO = 0.5;

/**
 * O verificador de quando nenhum provedor foi configurado: **recusa sempre**.
 *
 * Verificacao que nao consegue verificar precisa reprovar. Um verificador que
 * aprovasse na falta de configuracao seria o login do painel sem desafio,
 * servido em silencio no dia em que a variavel faltasse.
 */
export const captchaNaoConfigurado: VerificadorDeCaptcha = {
  avaliar: () => Promise.resolve(undefined),
};
