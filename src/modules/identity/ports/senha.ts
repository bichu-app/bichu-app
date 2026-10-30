/** A porta PUBLICA de senha e de e-mail de `identity` (ADR-0027 item 20.1). */
export {
  consumirTempoDeVerificacao,
  gerarHashDeSenha,
  precisaDeRehash,
  verificarSenha,
} from '../domain/password.js';
export { TAMANHO_MAXIMO_DE_EMAIL, emailTemFormaValida, normalizarEmail } from '../domain/email.js';
export { TAMANHO_MAXIMO as TAMANHO_MAXIMO_DE_SENHA, validarSenha } from '../domain/password-policy.js';
