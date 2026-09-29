/**
 * A porta PUBLICA de senha e de e-mail de `identity` (ADR-0027 item 20.1).
 *
 * O painel tem cadastro proprio (`admin_accounts`), mas o hash tem de ser o
 * MESMO do app: PBKDF2-SHA512 em PHC, com os mesmos parametros, o mesmo rehash
 * transparente (D19) e o mesmo hash de descarte (7.1 de `04-seguranca.md`).
 * Duas implementacoes do mesmo algoritmo seriam a segunda chance de errar a
 * comparacao em tempo constante ou o custo do descarte.
 *
 * Por isso `admin-access` importa daqui, e so daqui (e de
 * `lista-de-senhas-vazadas.ts`). A fronteira de modulo do ESLint impede que ele
 * alcance `identity/domain/` direto, e esta porta nao expoe nada que leia
 * `users`: sao funcoes puras.
 */
export {
  consumirTempoDeVerificacao,
  gerarHashDeSenha,
  precisaDeRehash,
  verificarSenha,
} from '../domain/password.js';
export { TAMANHO_MAXIMO_DE_EMAIL, emailTemFormaValida, normalizarEmail } from '../domain/email.js';
export { TAMANHO_MAXIMO as TAMANHO_MAXIMO_DE_SENHA, validarSenha } from '../domain/password-policy.js';
