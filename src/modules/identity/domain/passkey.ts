/**
 * As regras puras da credencial digital (passkey), BICHUS-301.
 *
 * Aqui não entra biblioteca de WebAuthn, nem banco, nem relógio do sistema: o
 * que vive neste arquivo é o que se decide sem olhar para fora, e é o que um
 * teste confere sem subir nada.
 *
 * **A passkey SOMA à senha, nunca a substitui.** Nada neste módulo desliga,
 * esconde ou condiciona o caminho da senha — `login`, `refreshSession` e
 * `reauthenticate` continuam exatamente como eram. Passkey é presa ao aparelho,
 * e quem troca de celular sem outra porta ficaria trancado fora da conta.
 */
import type { Instant } from '../../../shared/types/brands.js';

/**
 * Teto de credenciais ATIVAS por conta.
 *
 * Dez e o mesmo número de `tag_limit` por pet, e a escolha é deliberada: as duas
 * perguntas são a mesma — quantos objetos duráveis uma conta mantém — e dois
 * números para ela obrigariam a defender os dois.
 *
 * Conta `revoked_at IS NULL`, porque revogar MARCA revogada e não apaga
 * (decisão do cliente de 26/10). Sem isso o teto encheria com credenciais
 * mortas e a pessoa não teria como cadastrar a próxima.
 */
export const TETO_DE_PASSKEYS_POR_CONTA = 10;

/**
 * Prazo do desafio, em milissegundos — a unidade que o WebAuthn usa no
 * `timeout`, e a mesma que o servidor aplica na cópia guardada. Prazo que vive
 * só no cliente não é prazo.
 */
export const PRAZO_DO_DESAFIO_MS = 300_000;

/**
 * Algoritmos COSE aceitos, em ordem de preferência: ES256 e RS256.
 *
 * Lista FECHADA, e declarada no contrato com o mesmo conteúdo. São os dois que
 * os autenticadores de plataforma do Android emitem. Herdar o que o aparelho
 * oferecer deixaria a escolha do algoritmo com quem está do outro lado.
 */
export const ALGORITMOS_ACEITOS: readonly number[] = [-7, -257];

/** Teto do rótulo do aparelho. O mesmo da `CHECK` da tabela. */
export const TETO_DO_ROTULO = 60;

export type PropositoDoDesafio = 'registration' | 'authentication';

export type RazaoDaRevogacao = 'user' | 'counter_regression' | 'account_deleted';

/**
 * O contador de assinatura aceita esta asserção?
 *
 * **A defesa contra repetição.** Cada asserção traz um contador; asserção com
 * contador menor ou igual ao guardado é repetição de uma asserção capturada ou
 * autenticador clonado.
 *
 * **A exceção prevista na especificação, e ela não é frouxidão:** boa parte dos
 * autenticadores de PLATAFORMA — que é o caso aqui, `authenticatorAttachment:
 * platform` — devolve SEMPRE ZERO, legitimamente. Então guardado zero e
 * recebido zero PASSA, e **só** nesse caso; em qualquer outro o recebido tem de
 * ser estritamente maior.
 *
 * Sem a exceção, todo aparelho que devolve zero entraria uma vez e nunca mais.
 * Sem a regra, qualquer asserção capturada valeria para sempre.
 *
 * Esta regra mora no código e não numa `CHECK` do banco porque compara o valor
 * NOVO com o ANTIGO, e `CHECK` não vê o antigo.
 */
export function contadorAceito(guardado: bigint, recebido: bigint): boolean {
  if (guardado === 0n && recebido === 0n) return true;
  return recebido > guardado;
}

/**
 * O desafio ainda vale neste instante?
 *
 * Vencido **ou já consumido** é inválido, e os dois casos respondem igual: o
 * desafio é de uso único, e um desafio que sobrevive a uma falha é um desafio
 * que pode ser reusado.
 *
 * `expiraEm` é comparado com `>`, não `>=`: no milissegundo exato do prazo o
 * desafio já não vale. A borda escolhida é a que não estende prazo nenhum.
 */
export function desafioValido(
  desafio: { readonly expiraEm: Instant; readonly consumidoEm: Instant | null },
  agora: Instant,
): boolean {
  if (desafio.consumidoEm !== null) return false;
  return desafio.expiraEm > agora;
}

/**
 * O rótulo do aparelho, normalizado, ou `null`.
 *
 * `null` é válido e é o caso comum: o passo é dispensável e o rótulo também, e a
 * tela mostra a data quando falta. Espaço em volta não é rótulo, e rótulo que
 * virou vazio depois de aparar é ausência — não string vazia, que o banco
 * recusaria pela `CHECK` de faixa.
 *
 * Não há escape aqui de propósito: é texto de usuário, e quem escapa é a tela,
 * como em qualquer outro campo livre do produto. Escapar na gravação guardaria
 * o texto já deformado e o próximo consumidor escaparia de novo.
 */
export function rotuloNormalizado(bruto: string | undefined): string | null {
  if (bruto === undefined) return null;
  const aparado = bruto.trim();
  if (aparado === '') return null;
  return aparado.slice(0, TETO_DO_ROTULO);
}
