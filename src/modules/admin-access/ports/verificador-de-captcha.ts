/** O desafio antiautomacao do login administrativo (D41, ADR-0027 item 5). */
export interface VerificadorDeCaptcha {
  avaliar(token: string | undefined, acaoEsperada: string): Promise<number | undefined>;
}

/** O limiar de D41. Abaixo dele, `403 captcha-rejected`. */
export const NOTA_MINIMA_DO_CAPTCHA_ADMINISTRATIVO = 0.5;

/** O verificador de quando nenhum provedor foi configurado: **recusa sempre**. */
export const captchaNaoConfigurado: VerificadorDeCaptcha = {
  avaliar: () => Promise.resolve(undefined),
};
