/**
 * Implementação da porta `IdGenerator`.
 *
 * UUIDv7 e não v4 por localidade de índice: a ordenação temporal evita a
 * fragmentação que o v4 produz num B-tree (ADR-0002). A contrapartida é que ele
 * **carrega o instante de criação**, e por isso não sai em superfície pública:
 * dois UUIDv7 publicados entregam a taxa de criação de registros da plataforma
 * (SEC-001, SEC-002). O que é público sai de `opaqueToken`.
 *
 * O Postgres 16 não tem `uuidv7()` nativo, e uma função SQL própria criaria uma
 * segunda fonte de identificador. Por isso a geração é aqui, e as colunas `id`
 * não têm `DEFAULT`.
 */
import { randomBytes } from 'node:crypto';
import type { IdGenerator } from '../ports/id-generator.js';
import type { OpaqueToken } from '../types/brands.js';

const VERSAO_7 = 0x70;
const VARIANTE_RFC4122 = 0x80;

/**
 * Contador monotônico dentro do mesmo milissegundo. Sem ele, dois identificadores
 * gerados no mesmo milissegundo saem em ordem aleatória entre si, e a ordenação
 * que justifica o v7 vale só na granularidade do milissegundo — exatamente onde
 * uma inserção em lote acontece.
 *
 * DEFEITO ABERTO — BICHUS-208. O contador é semeado com 12 bits de aleatório e
 * incrementado com `& 0x0fff`, então quando a semente cai perto de 4095 ele vira
 * para 0 dentro do mesmo milissegundo e o identificador seguinte fica
 * **lexicograficamente menor** que o anterior. Medido: 0,63% das execuções do caso
 * de ordenação da suíte, e 100% quando 4097 identificadores dividem um
 * milissegundo. A RFC 9562 §6.2 exige tratar a virada — emprestando 1 ms do futuro
 * ou esperando o tique seguinte — e semear o contador só nos bits baixos para
 * deixar espaço de crescimento. Não está corrigido aqui de propósito: este é o
 * gerador de toda chave primária do sistema, e a correção espera decisão.
 */
let ultimoMilissegundo = -1;
let sequencia = 0;

function bytesDoUuidV7(agoraEmMilissegundos: number): Buffer {
  if (agoraEmMilissegundos === ultimoMilissegundo) {
    sequencia = (sequencia + 1) & 0x0fff;
  } else {
    ultimoMilissegundo = agoraEmMilissegundos;
    sequencia = randomBytes(2).readUInt16BE(0) & 0x0fff;
  }

  const bytes = Buffer.alloc(16);
  // 48 bits de milissegundos da época, big-endian.
  bytes.writeUIntBE(agoraEmMilissegundos, 0, 6);
  // 4 bits de versão e 12 bits de sequência.
  bytes[6] = VERSAO_7 | ((sequencia >> 8) & 0x0f);
  bytes[7] = sequencia & 0xff;
  randomBytes(8).copy(bytes, 8);
  // 2 bits de variante sobre os 62 bits aleatórios restantes.
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | VARIANTE_RFC4122;
  return bytes;
}

function formatar(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

export function criarIdGenerator(agora: () => number): IdGenerator {
  return {
    uuidv7: () => formatar(bytesDoUuidV7(agora())),
    // 256 bits de CSPRNG. base64url porque o valor viaja em corpo JSON e em
    // cabeçalho, e base64 padrão exigiria escape nos dois.
    opaqueToken: () => randomBytes(32).toString('base64url') as OpaqueToken,
    random128: () => new Uint8Array(randomBytes(16)),
  };
}

/**
 * Canonicaliza um UUID recebido do cliente. Devolve `undefined` quando o valor
 * não é um UUID, e **o que sai é o que o tipo produz**, não o que o cliente
 * enviou: comparar a forma crua permite que dois textos diferentes designem a
 * mesma linha e que um deles escape de uma verificação feita por igualdade de
 * texto.
 */
export function canonicalizarUuid(valor: string): string | undefined {
  const normalizado = valor.trim().toLowerCase();
  const formato = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  return formato.test(normalizado) ? normalizado : undefined;
}
