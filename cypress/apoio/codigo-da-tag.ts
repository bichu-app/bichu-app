/**
 * O código da tag, do lado do teste.
 *
 * Existe por um motivo só: **um código bem formado e inexistente precisa ter
 * símbolo de verificação válido**, senão o cenário que o usa recebe 400 e deixa
 * de exercitar o 404 ou o 429 que ele existe para exercitar — continuando
 * verde. É o caso mais fácil de quebrar em silêncio de toda a BICHUS-154, e a
 * resposta para ele não é lembrar: é não haver lugar onde inventar um código à
 * mão.
 *
 * É uma segunda implementação da regra do servidor, e isso é deliberado: um
 * teste que importasse o `tag-code.ts` do domínio provaria que a função
 * concorda com ela mesma. Os quatro vetores de conferência do ADR-0004, Emenda
 * 1, §13.3 estão em `src/modules/tags/domain/tag-code.test.ts` e são o que
 * amarra as duas.
 */

const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** `GF(2^5)` com o primitivo `x^5 + x^2 + 1` (`0x25`). */
function multiplicarEmGf32(a: number, b: number): number {
  let resultado = 0;
  let esquerdo = a;
  let direito = b;
  while (direito !== 0) {
    if ((direito & 1) !== 0) resultado ^= esquerdo;
    direito >>= 1;
    esquerdo <<= 1;
    if ((esquerdo & 0x20) !== 0) esquerdo ^= 0x25;
  }
  return resultado;
}

/** Os pesos `α^1 … α^15`: 2, 4, 8, 16, 5, 10, 20, 13, 26, 17, 7, 14, 28, 29, 31. */
const PESOS: number[] = (() => {
  const pesos: number[] = [];
  let atual = 1;
  for (let expoente = 1; expoente <= 15; expoente += 1) {
    atual = multiplicarEmGf32(atual, 2);
    pesos.push(atual);
  }
  return pesos;
})();

/** O décimo sexto símbolo, calculado sobre os quinze primeiros. */
export function simboloDeVerificacao(quinzePrimeiros: string): string {
  let acumulado = 0;
  for (let posicao = 0; posicao < 15; posicao += 1) {
    acumulado ^= multiplicarEmGf32(
      PESOS[posicao] as number,
      ALFABETO.indexOf(quinzePrimeiros[posicao] as string),
    );
  }
  return ALFABETO[acumulado] as string;
}

/**
 * Um código de 16 caracteres bem formado e **inexistente**: 15 símbolos
 * sorteados e o de verificação calculado. A chance de colidir com uma tag
 * emitida é 1 em 2^75.
 */
export function codigoBemFormadoInexistente(): string {
  let aleatorio = '';
  for (let posicao = 0; posicao < 15; posicao += 1) {
    aleatorio += ALFABETO[Math.floor(Math.random() * ALFABETO.length)] as string;
  }
  return aleatorio + simboloDeVerificacao(aleatorio);
}
