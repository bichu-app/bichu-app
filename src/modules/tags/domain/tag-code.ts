/**
 * O código da tag: geração, normalização e forma impressa.
 *
 * Este é o único arquivo do projeto cujo formato de saída é **irreversível**.
 * Tudo o mais se corrige com uma migração; o que está prensado na plaquinha da
 * coleira só se corrige reimprimindo a base inteira (ADR-0004). Uma mudança de
 * alfabeto, de tamanho ou de agrupamento aqui, depois da primeira tag impressa,
 * cria duas gerações de plaquinha convivendo para sempre.
 *
 * **128 bits de CSPRNG, sem relação com nada.** Não deriva de `pet_id`, de
 * `user_id`, de data, de sequência nem de lote. É essa aleatoriedade que
 * substitui a autenticação na rota pública: 2^128 torna a varredura inviável, e
 * é por isso que o código curto e o sequencial foram recusados.
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

/** 128 bits em grupos de 5 bits, arredondando para cima: 26 símbolos. */
export const TAMANHO_DO_CODIGO = 26;

/** Bits de entropia do código. Fixado aqui para que o número apareça no teste. */
export const BITS_DE_ENTROPIA = 128;

const BITS_POR_SIMBOLO = 5;
const BYTES_DO_CODIGO = BITS_DE_ENTROPIA / 8;

/** Tamanho do grupo na forma impressa. Dígito agrupado se lê e se confere melhor. */
const TAMANHO_DO_GRUPO = 4;

const VALIDO = /^[0-9A-HJKMNP-TV-Z]{26}$/;

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
 * 4. exatamente 26 caracteres do alfabeto;
 * 5. quem busca é o SHA-256 disso, e não este valor.
 *
 * Maiúsculas **antes** da substituição é o que faz `l` minúsculo virar `1`.
 *
 * A normalização roda também na emissão, então ela é idempotente: o código
 * emitido normaliza para ele mesmo. O teste cobre exatamente essa volta.
 */
export function normalizarCodigoDaTag(bruto: string): TagCodeCanonical | undefined {
  const somenteAlfanumerico = bruto.replace(/[^0-9A-Za-z]/g, '');
  const maiusculo = somenteAlfanumerico.toUpperCase();
  const comSubstituicoesDeCrockford = maiusculo.replace(/[IL]/g, '1').replace(/O/g, '0');
  if (!VALIDO.test(comSubstituicoesDeCrockford)) return undefined;
  return comSubstituicoesDeCrockford as TagCodeCanonical;
}

/**
 * Codifica 128 bits em 26 símbolos.
 *
 * 26 símbolos carregam 130 bits, então os dois bits mais significativos são
 * zero: o primeiro símbolo assume 8 dos 32 valores. Isso não tira entropia de
 * lugar nenhum — os 128 bits continuam todos lá —, e é o preço de um tamanho
 * fixo, que é o que a plaquinha precisa.
 */
function codificarEmCrockford(bytes: Uint8Array): string {
  let acumulador = 0n;
  for (const octeto of bytes) acumulador = (acumulador << 8n) | BigInt(octeto);

  const simbolos: string[] = [];
  for (let posicao = 0; posicao < TAMANHO_DO_CODIGO; posicao += 1) {
    const deslocamento = BigInt((TAMANHO_DO_CODIGO - 1 - posicao) * BITS_POR_SIMBOLO);
    const indice = Number((acumulador >> deslocamento) & 0x1fn);
    simbolos.push(ALFABETO[indice] as string);
  }
  return simbolos.join('');
}

/**
 * Gera o código a partir de 128 bits de aleatoriedade.
 *
 * Os bytes vêm de fora, da porta `IdGenerator`: o domínio não sorteia nada
 * sozinho, e é isso que permite testar a codificação com entrada conhecida sem
 * desligar o CSPRNG de verdade.
 */
export function gerarCodigoDaTag(bytes: Uint8Array): TagCodeCanonical {
  if (bytes.length !== BYTES_DO_CODIGO) {
    // Chamada com menos bytes produziria um código com menos entropia e com a
    // mesma aparência. Falha ruidosa, porque aqui o defeito é permanente.
    throw new Error(
      `O código da tag exige ${String(BITS_DE_ENTROPIA)} bits de aleatoriedade ` +
        `(${String(BYTES_DO_CODIGO)} bytes) e recebeu ${String(bytes.length)}.`,
    );
  }
  const codificado = codificarEmCrockford(bytes);
  const normalizado = normalizarCodigoDaTag(codificado);
  if (normalizado === undefined) {
    // Inalcançável enquanto o alfabeto e o tamanho concordarem. Se um dia
    // deixarem de concordar, a emissão para aqui em vez de imprimir um código
    // que a resolução nunca encontraria.
    throw new Error('O código gerado não normaliza para ele mesmo. Alfabeto e tamanho divergiram.');
  }
  return normalizado;
}

/**
 * A forma impressa: os mesmos 26 caracteres em grupos de quatro, com hífen.
 *
 * `7K2F-9QJB-3XR0-5TWD-8MNC-VH`. Seis grupos de quatro e um de dois. Quem digita
 * confere grupo a grupo; quem lê em voz alta para outra pessoa não se perde. A
 * normalização remove os hífens de volta, então as duas formas resolvem no mesmo
 * lugar.
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
 */
export function sufixoDoCodigo(codigo: TagCodeCanonical): string {
  return codigo.slice(-4);
}
