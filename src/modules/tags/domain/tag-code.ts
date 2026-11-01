import type { TagCodeCanonical } from '../../../shared/types/brands.js';

const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 15 símbolos de aleatoriedade mais 1 de verificação. */
export const TAMANHO_DO_CODIGO = 16;

/** Os símbolos que carregam aleatoriedade. */
export const SIMBOLOS_DE_ALEATORIEDADE = 15;

/** Bits de entropia do código: 15 × 5 = 75, **exatos**. */
export const BITS_DE_ENTROPIA = 75;

const BITS_POR_SIMBOLO = 5;

/** 75 bits **não são um número inteiro de bytes**: são 9,375. */
export const BYTES_DO_GERADOR = 10;

const TAMANHO_DO_GRUPO = 4;

const VALIDO = /^[0-9A-HJKMNP-TV-Z]{16}$/;

const POLINOMIO_PRIMITIVO = 0x25;

const GERADOR = 2;

function multiplicarEmGf32(a: number, b: number): number {
  let resultado = 0;
  let esquerdo = a;
  let direito = b;
  while (direito !== 0) {
    if ((direito & 1) !== 0) resultado ^= esquerdo;
    direito >>= 1;
    esquerdo <<= 1;
    if ((esquerdo & 0x20) !== 0) esquerdo ^= POLINOMIO_PRIMITIVO;
  }
  return resultado;
}

const PESOS: readonly number[] = (() => {
  const pesos: number[] = [];
  let atual = 1;
  for (let expoente = 1; expoente <= SIMBOLOS_DE_ALEATORIEDADE; expoente += 1) {
    atual = multiplicarEmGf32(atual, GERADOR);
    pesos.push(atual);
  }
  return pesos;
})();

function simboloDeVerificacao(quinzePrimeiros: string): string {
  let acumulado = 0;
  for (let posicao = 0; posicao < SIMBOLOS_DE_ALEATORIEDADE; posicao += 1) {
    const valor = ALFABETO.indexOf(quinzePrimeiros[posicao] as string);
    acumulado ^= multiplicarEmGf32(PESOS[posicao] as number, valor);
  }
  return ALFABETO[acumulado] as string;
}

/** Normaliza o que chegou para a forma canônica, ou devolve `undefined`. */
export function normalizarCodigoDaTag(bruto: string): TagCodeCanonical | undefined {
  const somenteAlfanumerico = bruto.replace(/[^0-9A-Za-z]/g, '');
  const maiusculo = somenteAlfanumerico.toUpperCase();
  const comSubstituicoesDeCrockford = maiusculo.replace(/[IL]/g, '1').replace(/O/g, '0');
  if (!VALIDO.test(comSubstituicoesDeCrockford)) return undefined;

  const esperado = simboloDeVerificacao(
    comSubstituicoesDeCrockford.slice(0, SIMBOLOS_DE_ALEATORIEDADE),
  );
  if (comSubstituicoesDeCrockford[SIMBOLOS_DE_ALEATORIEDADE] !== esperado) return undefined;

  return comSubstituicoesDeCrockford as TagCodeCanonical;
}

function codificarEmCrockford(bytes: Uint8Array): string {
  let acumulador = 0n;
  for (const octeto of bytes) acumulador = (acumulador << 8n) | BigInt(octeto);
  acumulador &= (1n << BigInt(BITS_DE_ENTROPIA)) - 1n;

  const simbolos: string[] = [];
  for (let posicao = 0; posicao < SIMBOLOS_DE_ALEATORIEDADE; posicao += 1) {
    const deslocamento = BigInt((SIMBOLOS_DE_ALEATORIEDADE - 1 - posicao) * BITS_POR_SIMBOLO);
    const indice = Number((acumulador >> deslocamento) & 0x1fn);
    simbolos.push(ALFABETO[indice] as string);
  }
  const aleatorio = simbolos.join('');
  return aleatorio + simboloDeVerificacao(aleatorio);
}

/**
 * Gera o código a partir de 10 bytes de aleatoriedade, dos quais 75 bits são
 * usados.
 */
export function gerarCodigoDaTag(bytes: Uint8Array): TagCodeCanonical {
  if (bytes.length !== BYTES_DO_GERADOR) {
    throw new Error(
      `O código da tag usa ${String(BITS_DE_ENTROPIA)} bits de aleatoriedade, ` +
        `entregues em ${String(BYTES_DO_GERADOR)} bytes (os 5 bits mais altos ` +
        `são descartados), e recebeu ${String(bytes.length)} bytes.`,
    );
  }
  const codificado = codificarEmCrockford(bytes);
  const normalizado = normalizarCodigoDaTag(codificado);
  if (normalizado === undefined) {
    throw new Error('O código gerado não normaliza para ele mesmo. Alfabeto e tamanho divergiram.');
  }
  return normalizado;
}

/** A forma impressa: os mesmos 16 caracteres em grupos de quatro, com hífen. */
export function formaImpressaDoCodigo(codigo: TagCodeCanonical): string {
  const grupos: string[] = [];
  for (let inicio = 0; inicio < codigo.length; inicio += TAMANHO_DO_GRUPO) {
    grupos.push(codigo.slice(inicio, inicio + TAMANHO_DO_GRUPO));
  }
  return grupos.join('-');
}

/**
 * Os quatro últimos caracteres, que é tudo o que o tutor recebe de volta depois da
 * emissão.
 */
export function sufixoDoCodigo(codigo: TagCodeCanonical): string {
  return codigo.slice(-4);
}
