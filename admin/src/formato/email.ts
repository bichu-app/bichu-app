/**
 * O **unico** lugar do painel que decide o que e um e-mail plausivel e o que
 * sai do campo de e-mail para o contrato.
 *
 * ## E-mail nao tem mascara, e isso e decisao
 *
 * Nao existe mascara de e-mail e tentar uma faz dano: a parte local do RFC
 * 5321 aceita ponto, `+`, `_`, `-` e muito mais, entao qualquer mascara ou
 * recusa endereco valido ou nao recusa nada. O que vale e o teclado de
 * e-mail (`type="email"` + `inputMode="email"`), a correcao automatica
 * desligada, a maiuscula automatica desligada, o espaco aparado e **uma**
 * conferencia ao sair do campo.
 *
 * ## O que o painel NAO faz: minuscula
 *
 * **O painel nao abaixa a caixa do endereco.** Quem normaliza e o servidor, em
 * `src/modules/identity/domain/email.ts` (`normalizarEmail`: `trim()` +
 * `toLowerCase()`), e ele normaliza ANTES de conferir e antes de gravar. Uma
 * segunda normalizacao no navegador criaria duas definicoes do mesmo endereco,
 * e a primeira divergencia entre elas ficaria invisivel -- o arquivo do
 * servidor documenta que pontos na parte local e o sufixo `+etiqueta`
 * **nao** sao normalizados de proposito, e um atalho no cliente que os
 * removesse mandaria outra conta.
 *
 * O painel apara espaco porque espaco em volta e erro de digitacao e de
 * colagem, nunca intencao. `Entrar.tsx` ja enviava `email.trim()`; agora o
 * `trim` tem nome e um lugar so.
 */

/** O que vai para o contrato: o texto aparado, **na caixa que a pessoa escreveu**. */
export function emailParaEnvio(bruto: string): string {
  return bruto.trim();
}

/**
 * Conferencia tolerante: recusa o obviamente errado, aceita o incomum.
 * Endereco real e mais estranho que a maioria das expressoes regulares, e a
 * prova de que o endereco existe e o e-mail, nao uma regex.
 *
 * Exige um `@` que nao seja o primeiro caractere e um ponto depois dele que
 * nao seja colado nele. Mesma condicao que o app aplica em
 * `app/lib/formato/email.dart`.
 */
export function emailPlausivel(bruto: string): boolean {
  const v = emailParaEnvio(bruto);
  const arroba = v.indexOf('@');
  return arroba > 0 && v.indexOf('.', arroba) > arroba + 1;
}

/**
 * `true` quando o campo tem algo escrito e o que esta escrito nao e plausivel.
 *
 * **Campo vazio nao e erro ao sair do campo:** quem tocou o campo e desistiu
 * nao levou erro, e dizer "informe o e-mail" para quem ainda vai digitar e o
 * texto excessivo que o cliente reprovou. Vazio continua sendo erro **no
 * envio**, e quem decide isso e a tela.
 */
export function erraAoSairDoCampo(bruto: string): boolean {
  const v = emailParaEnvio(bruto);
  return v !== '' && !emailPlausivel(v);
}

/**
 * A mensagem da conferencia ao sair do campo. **Uma linha**, porque o cliente
 * reprovou texto excessivo em tela.
 */
export const ERRO_AO_SAIR_DO_EMAIL = 'Confira o e-mail.';
