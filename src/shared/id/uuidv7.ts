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
 * Contador dedicado de 12 bits, o método 1 da RFC 9562 §6.2. Sem ele, dois
 * identificadores gerados no mesmo milissegundo saem em ordem aleatória entre si,
 * e a ordenação que justifica o v7 vale só na granularidade do milissegundo —
 * exatamente onde uma inserção em lote acontece.
 */
const LARGURA_DO_CONTADOR = 0x0fff;

/**
 * A semente ocupa só os 8 bits baixos: os 4 mais significativos nascem zerados.
 *
 * RFC 9562 §6.2, "Fixed Bit-Length Dedicated Counter Seeding": os bits mais
 * significativos do contador são inicializados em zero **com a única finalidade de
 * proteger contra a virada**. Semeando em [0, 255] sobram no mínimo 3840
 * incrementos dentro do mesmo milissegundo antes de a virada ser possível, contra
 * os 0 que a semente uniforme em [0, 4095] deixava quando caía no topo (BICHUS-208).
 *
 * Isto não reduz a aleatoriedade que importa: a unicidade vem dos 62 bits de
 * CSPRNG da cauda, e o UUIDv7 é identificador interno — o que vai a superfície
 * pública sai de `opaqueToken` (SEC-001, SEC-002).
 */
const MASCARA_DA_SEMENTE = 0x00ff;

let ultimoMilissegundo = -1;
let sequencia = 0;

function semear(): number {
  return randomBytes(2).readUInt16BE(0) & MASCARA_DA_SEMENTE;
}

function bytesDoUuidV7(agoraEmMilissegundos: number): Buffer {
  // O carimbo emitido nunca anda para trás, nem quando o relógio anda: o NTP
  // ajustando o relógio da máquina para trás quebraria a ordenação do mesmo jeito
  // que a virada do contador quebrava.
  const milissegundo = Math.max(agoraEmMilissegundos, ultimoMilissegundo);

  if (milissegundo === ultimoMilissegundo) {
    sequencia += 1;
    if (sequencia > LARGURA_DO_CONTADOR) {
      // RFC 9562 §6.2, "Counter Rollover Handling": a virada **precisa** ser
      // tratada, e são duas saídas. Congelar o contador e esperar o relógio andar
      // não serve aqui, porque esta função é síncrona e a espera travaria o laço de
      // eventos do Fastify. Fica a alternativa que a RFC autoriza: adiantar o
      // carimbo de tempo e resemear o contador. O empréstimo é de 1 ms, e ele se
      // devolve sozinho — assim que o relógio real alcança o carimbo adiantado, o
      // `Math.max` acima volta a seguir o relógio.
      ultimoMilissegundo = milissegundo + 1;
      sequencia = semear();
    }
  } else {
    ultimoMilissegundo = milissegundo;
    sequencia = semear();
  }

  const bytes = Buffer.alloc(16);
  // 48 bits de milissegundos da época, big-endian.
  bytes.writeUIntBE(ultimoMilissegundo, 0, 6);
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
