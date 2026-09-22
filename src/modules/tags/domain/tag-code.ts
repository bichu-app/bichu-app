/**
 * O código da tag: geração, normalização, símbolo de verificação e forma impressa.
 *
 * Este é o único arquivo do projeto cujo formato de saída é **irreversível**.
 * Tudo o mais se corrige com uma migração; o que está prensado na plaquinha da
 * coleira só se corrige reimprimindo a base inteira (ADR-0004). Uma mudança de
 * alfabeto, de tamanho ou de agrupamento aqui, depois da primeira tag impressa,
 * cria duas gerações de plaquinha convivendo para sempre.
 *
 * **16 caracteres: 15 de aleatoriedade (75 bits exatos) e 1 de verificação.**
 * Eram 26 e 128 bits até a Emenda 1 do ADR-0004. O encurtamento é sobre
 * quantidade de bits e **não introduz estrutura**, que é a única leitura capaz
 * de transformar esta mudança num desastre: continua CSPRNG puro, sem nenhuma
 * relação com `pet_id`, `user_id`, data, sequência ou lote. Não deriva, não é
 * cifrado a partir de outra coisa, não é adivinhável a partir de outro código.
 *
 * **O encurtamento só é seguro porque `code_hash` é HMAC com chave fora do
 * banco.** As duas mudanças são uma decisão só: 75 bits sob SHA-256 sem sal
 * entregam a base inteira a partir de um dump. Ver `shared/crypto/digest.ts`.
 *
 * **O símbolo de verificação não é aleatório e não conta como entropia.** São 75
 * bits em 16 caracteres, não 80. Quem multiplicar 16 por 5 vai encontrar 80 e
 * estará errado por 5 bits.
 *
 * **Crockford Base32, e não Base32 comum.** O alfabeto já exclui `I`, `L`, `O` e
 * `U`, que são os pares que se confundem na leitura de uma etiqueta pequena, ao
 * sol, com uma mão só. A normalização corrige `I`/`L` para `1` e `O` para `0`, e
 * **nada além disso**: corrigir `5`/`S` ou `8`/`B` mapearia dois códigos válidos
 * e distintos um no outro, e o resultado não seria "não encontrado" — seria
 * abrir a página do pet errado a partir de um erro de digitação.
 *
 * Domínio puro: sem banco, sem HTTP, sem relógio.
 */
import type { TagCodeCanonical } from '../../../shared/types/brands.js';

/** Crockford Base32: 32 símbolos, sem `I`, `L`, `O` e `U`. */
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 15 símbolos de aleatoriedade mais 1 de verificação. */
export const TAMANHO_DO_CODIGO = 16;

/** Os símbolos que carregam aleatoriedade. O décimo sexto é calculado. */
export const SIMBOLOS_DE_ALEATORIEDADE = 15;

/**
 * Bits de entropia do código: 15 × 5 = 75, **exatos**. Não há bit desperdiçado,
 * e é por isso que o primeiro caractere assume os 32 valores do alfabeto — com
 * 26 símbolos para 128 bits ele assumia 8, um artefato visível em qualquer
 * amostra de códigos impressos.
 */
export const BITS_DE_ENTROPIA = 75;

const BITS_POR_SIMBOLO = 5;

/**
 * 75 bits **não são um número inteiro de bytes**: são 9,375. A porta
 * `IdGenerator` entrega 10 bytes (80 bits) e a codificação descarta 5.
 */
export const BYTES_DO_GERADOR = 10;

/** Tamanho do grupo na forma impressa. Dígito agrupado se lê e se confere melhor. */
const TAMANHO_DO_GRUPO = 4;

const VALIDO = /^[0-9A-HJKMNP-TV-Z]{16}$/;

/**
 * Polinômio primitivo de `GF(2^5)`: `x^5 + x^2 + 1`, isto é `0x25`.
 *
 * `GF(32)` é um **corpo**: todo elemento não nulo é invertível, e é isso que
 * devolve as garantias que o dígito de verificação do Crockford daria com
 * `mod 37` — **sem sair dos 32 símbolos do alfabeto**. Um `mod 32` ingênuo não
 * serve, e isso foi medido e não opinado (ADR-0004, Emenda 1, §4.1): a soma
 * simples não pega transposição nenhuma, e a ponderada deixa escapar 3,7% dos
 * erros de um símbolo, porque 32 não é primo e `Z/32` tem divisores de zero.
 */
const POLINOMIO_PRIMITIVO = 0x25;

/** Gerador do corpo. A ordem de 2 em `GF(32)*` é 31, logo ele é primitivo. */
const GERADOR = 2;

/**
 * Multiplicação em `GF(2^5)`: produto de polinômios sobre `GF(2)`, reduzido pelo
 * primitivo sempre que o bit 5 aparecer.
 */
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

/**
 * Os pesos `α^1 … α^15`: `2, 4, 8, 16, 5, 10, 20, 13, 26, 17, 7, 14, 28, 29, 31`.
 *
 * Calculados, e não escritos à mão: a lista literal é o tipo de constante que
 * alguém reordena ao formatar. O teste confere os quinze valores contra a tabela
 * do ADR, então a conta e a tabela se vigiam.
 */
const PESOS: readonly number[] = (() => {
  const pesos: number[] = [];
  let atual = 1;
  for (let expoente = 1; expoente <= SIMBOLOS_DE_ALEATORIEDADE; expoente += 1) {
    atual = multiplicarEmGf32(atual, GERADOR);
    pesos.push(atual);
  }
  return pesos;
})();

/**
 * O símbolo de verificação dos quinze primeiros: `c = ⊕ᵢ (α^i ⊗ vᵢ)`.
 *
 * É um Reed-Solomon [16,15,2] encurtado. Pega **todo** erro de um símbolo e
 * **toda** transposição, adjacente ou não — 992.000 e 203.396 casos medidos por
 * exaustão, nenhum escapou. Erro em dois ou mais símbolos escapa com 1/32, e
 * isso precisa estar escrito: um símbolo de verificação dá distância de Hamming
 * 2, o que detecta um erro e não corrige nenhum.
 *
 * **Ele não corrige, e isso é decisão e não limitação.** Corrigir é o mesmo erro
 * que este ADR já recusou ao proibir a substituição de `5`/`S` e `8`/`B`: um
 * código "corrigido" é um código válido e **diferente**, e o resultado não seria
 * "não encontrado", seria abrir a página do pet errado. Detectar e pedir para
 * digitar de novo; nunca adivinhar.
 */
function simboloDeVerificacao(quinzePrimeiros: string): string {
  let acumulado = 0;
  for (let posicao = 0; posicao < SIMBOLOS_DE_ALEATORIEDADE; posicao += 1) {
    const valor = ALFABETO.indexOf(quinzePrimeiros[posicao] as string);
    acumulado ^= multiplicarEmGf32(PESOS[posicao] as number, valor);
  }
  return ALFABETO[acumulado] as string;
}

/**
 * Normaliza o que chegou para a forma canônica, ou devolve `undefined`.
 *
 * A ordem dos passos é contrato, não escolha de quem implementa (parâmetro
 * `TagCode` de `api/openapi.yaml`):
 *
 * 1. remover tudo que não for letra ou dígito — o hífen da forma impressa, mas
 *    também espaço e ponto, **em qualquer posição**;
 * 2. maiúsculas;
 * 3. as substituições do próprio Crockford: `I` e `L` viram `1`, `O` vira `0`;
 * 4. exatamente 16 caracteres do alfabeto;
 * 5. o décimo sexto caractere precisa ser o símbolo de verificação dos quinze
 *    primeiros;
 * 6. quem busca é o HMAC disso, e não este valor.
 *
 * Maiúsculas **antes** da substituição é o que faz `l` minúsculo virar `1`.
 *
 * **O passo 5 roda antes de qualquer acesso ao banco**, e é ele que transforma
 * um dedo no lugar errado em 400 ("confira o código") em vez de 404 ("esse
 * código não é de nenhuma tag do Bichu"), que acusava a plaquinha quando a culpa
 * era da transcrição. Para quem está na rua com um animal no colo, é a diferença
 * entre tentar de novo e desistir.
 *
 * **Não há convivência de dois tamanhos.** 26 caracteres devolvem `undefined`
 * como qualquer outro tamanho errado: um normalizador com dois ramos teria um
 * caminho que detecta erro de digitação e outro que não, e a mensagem do produto
 * dependeria de qual geração de plaquinha a pessoa tem na mão.
 *
 * A normalização roda também na emissão, então ela é idempotente: o código
 * emitido normaliza para ele mesmo. O teste cobre exatamente essa volta.
 */
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

/**
 * Codifica 75 bits em 15 símbolos e anexa o de verificação.
 *
 * **Os 5 bits descartados são os mais significativos**, e a regra exata está na
 * §13.2 da emenda. Máscara e `mod 2^75` são a MESMA operação e as duas são
 * uniformes, porque `2^75` divide `2^80` exatamente: cada saída tem 32
 * pré-imagens, sem exceção. O viés não vem de usar módulo — vem de reduzir por
 * algo que **não** é potência de dois. `mod (2^75 − 1)`, por exemplo, enviesa
 * 3,12%. A máscara está escrita aqui porque é a forma de dizer a regra que não
 * dá margem a erro.
 */
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
 *
 * Os bytes vêm de fora, da porta `IdGenerator`: o domínio não sorteia nada
 * sozinho, e é isso que permite testar a codificação com entrada conhecida sem
 * desligar o CSPRNG de verdade.
 */
export function gerarCodigoDaTag(bytes: Uint8Array): TagCodeCanonical {
  if (bytes.length !== BYTES_DO_GERADOR) {
    // Chamada com menos bytes produziria um código com menos entropia e com a
    // mesma aparência. Falha ruidosa, porque aqui o defeito é permanente. A
    // mensagem diz os DOIS números, porque eles não coincidem e a diferença é
    // exatamente o que confunde quem lê: 10 bytes entram, 75 bits saem.
    throw new Error(
      `O código da tag usa ${String(BITS_DE_ENTROPIA)} bits de aleatoriedade, ` +
        `entregues em ${String(BYTES_DO_GERADOR)} bytes (os 5 bits mais altos ` +
        `são descartados), e recebeu ${String(bytes.length)} bytes.`,
    );
  }
  const codificado = codificarEmCrockford(bytes);
  const normalizado = normalizarCodigoDaTag(codificado);
  if (normalizado === undefined) {
    // Inalcançável enquanto o alfabeto, o tamanho e o símbolo de verificação
    // concordarem. Se um dia deixarem de concordar, a emissão para aqui em vez
    // de imprimir um código que a resolução nunca encontraria.
    throw new Error('O código gerado não normaliza para ele mesmo. Alfabeto e tamanho divergiram.');
  }
  return normalizado;
}

/**
 * A forma impressa: os mesmos 16 caracteres em grupos de quatro, com hífen.
 *
 * `7K2F-9QJB-3XR0-5TWD`. Quatro grupos exatos, contra os seis mais um de dois de
 * 26 caracteres. Quem digita confere grupo a grupo; quem lê em voz alta para
 * outra pessoa não se perde. A normalização remove os hífens de volta, então as
 * duas formas resolvem no mesmo lugar.
 */
export function formaImpressaDoCodigo(codigo: TagCodeCanonical): string {
  const grupos: string[] = [];
  for (let inicio = 0; inicio < codigo.length; inicio += TAMANHO_DO_GRUPO) {
    grupos.push(codigo.slice(inicio, inicio + TAMANHO_DO_GRUPO));
  }
  return grupos.join('-');
}

/**
 * Os quatro últimos caracteres, que é tudo o que o tutor recebe de volta depois
 * da emissão. Servem para ele saber qual plaquinha é qual, e **não endereçam
 * nada**: quatro caracteres colidem, e é por isso que o modo dono precisa de
 * `GET /tags/{code}/owner-context` em vez de comparar sufixo.
 *
 * O quarto deles agora é o símbolo de verificação, então o sufixo carrega 15
 * bits de variação e não 20. Ele distingue no máximo cinco plaquinhas do mesmo
 * pet, e 32.768 valores bastam com folga.
 */
export function sufixoDoCodigo(codigo: TagCodeCanonical): string {
  return codigo.slice(-4);
}
