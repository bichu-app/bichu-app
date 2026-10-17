/**
 * O **unico** lugar do painel que faz a conta de centavos para texto, e a
 * mascara do campo de valor em reais.
 *
 * ## A regra que governa este arquivo
 *
 * **A unidade do contrato e centavos inteiros, e a mascara nao toca nisso.**
 * `AdminPriceInput.amount` e `AdminEventPrice.amount` sao `integer`. A mascara
 * daqui recebe texto e devolve texto: ela nunca produz, converte nem arredonda
 * numero. Quem transforma texto em centavos continua sendo
 * `precoEmCentavos` (`loja/dominio.ts`) e `centavosDoTexto`
 * (`rede/dominio/valor.ts`), cada um com a sua gramatica, e os dois ja
 * devolvem `number` inteiro -- agora pela mesma aritmetica, [centavosDosDigitos].
 *
 * Preco errado em produto e o pior tipo de defeito, porque parece certo. Por
 * isso [mascaraDeReais] foi desenhada para ser **idempotente** e para
 * **preservar o que os dois leitores ja aceitavam**: o texto que ela devolve
 * casa com as duas gramaticas, e o texto que ja estava no campo volta igual.
 *
 * ## Por que este arquivo existe
 *
 * Havia duas aritmeticas de centavos no painel, cada uma com o seu proprio
 * laco de ponto de milhar: `loja/dominio.ts` (`centavosParaCampo`,
 * `centavosParaTexto`) e `rede/dominio/valor.ts` (`textoDosCentavos`). Duas
 * copias da mesma conta divergem na primeira correcao.
 */

/** Centavos, inteiro. O teto e o mesmo nas duas secoes: `R$ 1.000.000,00`. */
export const CENTAVOS_MINIMO = 1;
export const CENTAVOS_MAXIMO = 100_000_000;

/**
 * `("1234", "5")` -> `123450`. A **unica** aritmetica de centavos do painel.
 *
 * Nunca passa por ponto flutuante: a conta e feita nos digitos, com
 * `parseInt`. `0.1 + 0.2` em dinheiro erra na soma e o erro aparece meses
 * depois, num total que ninguem confere.
 *
 * `decimais` entra com 0, 1 ou 2 digitos e e completado a direita: `"5"` e
 * cinquenta centavos, nao cinco.
 *
 * Devolve `null` fora da faixa do contrato ou quando nao e inteiro seguro.
 */
export function centavosDosDigitos(inteiros: string, decimais: string): number | null {
  const parteInteira = inteiros === '' ? 0 : Number.parseInt(inteiros, 10);
  const parteDecimal = decimais === '' ? 0 : Number.parseInt(decimais.padEnd(2, '0'), 10);
  if (Number.isNaN(parteInteira) || Number.isNaN(parteDecimal)) return null;
  const centavos = parteInteira * 100 + parteDecimal;
  if (!Number.isSafeInteger(centavos) || centavos < CENTAVOS_MINIMO || centavos > CENTAVOS_MAXIMO) return null;
  return centavos;
}

/**
 * `"1234"` -> `"1.234"`. Ponto de milhar contado **da direita**.
 *
 * Recebe **texto**, e nao numero, de proposito: a mascara roda sobre o que a
 * pessoa digitou, e vinte digitos num `number` perderiam precisao antes de
 * chegar aqui.
 */
function comMilhar(digitos: string): string {
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Centavos para o texto brasileiro, **sem** `R$`.
 *
 * `centavosRedondos` decide o que acontece com `,00`, e os dois lados sao
 * decisao de produto:
 *
 * - `true` (Loja, e o valor que volta para o campo): `"189,90"`, `"0,05"`,
 *   `"1.000.000,00"`. Sempre dois digitos de centavo -- um valor redondo sem os
 *   dois zeros parece truncado numa linha de preco;
 * - `false` (Rede): `"15"`, `"1.250"`, `"15,50"`. O selo do encontro e uma
 *   frase curta e `R$ 15,00 por pet` acrescenta dois zeros que ninguem le.
 */
export function reaisDeCentavos(centavos: number, { centavosRedondos = true }: { centavosRedondos?: boolean } = {}): string {
  const negativo = centavos < 0;
  const absoluto = Math.abs(centavos);
  const inteiros = comMilhar(Math.trunc(absoluto / 100).toString());
  const resto = absoluto % 100;
  const sinal = negativo ? '-' : '';
  if (resto === 0 && !centavosRedondos) return `${sinal}${inteiros}`;
  return `${sinal}${inteiros},${String(resto).padStart(2, '0')}`;
}

/**
 * A mascara do campo de valor em reais: **so o que a pessoa ve**.
 *
 * O que ela faz, e nada alem disso:
 *
 * - joga fora tudo que nao e digito, `,` ou `.`, entao colar `R$ 1.234,56`,
 *   `R$&nbsp;1 234,56` ou `1.234,56 (promo)` da o mesmo campo;
 * - a **ultima** virgula e o separador decimal, e o decimal e cortado em dois
 *   digitos;
 * - sem virgula nenhuma, um ponto seguido de 1 ou 2 digitos **no fim** e lido
 *   como decimal (`189.90` -> `189,90`) e qualquer outro ponto e milhar
 *   (`1.000` -> `1.000`). E a mesma leitura que `precoEmCentavos` ja
 *   documentava;
 * - escreve o ponto de milhar na parte inteira.
 *
 * O que ela **nao** faz: nao completa centavos (`"30"` continua `"30"`, e e
 * isto que mantem de pe o valor que `textoDosCentavos` devolve para o campo do
 * encontro), nao bota `R$` dentro do valor (o `R$` esta no rotulo e na linha
 * de previa; dentro do valor ele quebraria `centavosDoTexto`, que recusa
 * `R$ 15` de proposito) e nao recusa nada -- quem recusa e a validacao, na
 * hora de enviar.
 *
 * Virgula no fim (`"12,"`) sobrevive porque e estado de quem esta digitando.
 */
export function mascaraDeReais(bruto: string): string {
  const limpo = bruto.replace(/[^\d.,]/g, '');
  if (limpo === '') return '';

  let inteiros: string;
  let decimais: string | null;

  const ultimaVirgula = limpo.lastIndexOf(',');
  if (ultimaVirgula >= 0) {
    inteiros = limpo.slice(0, ultimaVirgula).replace(/\D/g, '');
    decimais = limpo.slice(ultimaVirgula + 1).replace(/\D/g, '').slice(0, 2);
  } else if (/\.\d{1,2}$/.test(limpo) && limpo.indexOf('.') === limpo.lastIndexOf('.')) {
    const ponto = limpo.lastIndexOf('.');
    inteiros = limpo.slice(0, ponto).replace(/\D/g, '');
    decimais = limpo.slice(ponto + 1);
  } else {
    inteiros = limpo.replace(/\D/g, '');
    decimais = null;
  }

  // Zero a esquerda sai (`007` -> `7`), menos o zero que a parte decimal
  // precisa para `0,05` existir.
  const semZeroAEsquerda = inteiros.replace(/^0+(?=\d)/, '');
  const parteInteira = semZeroAEsquerda === '' ? (decimais === null ? '' : '0') : comMilhar(semZeroAEsquerda);

  return decimais === null ? parteInteira : `${parteInteira},${decimais}`;
}
