import { randomBytes } from 'node:crypto';
import type { IdGenerator } from '../ports/id-generator.js';
import type { OpaqueToken } from '../types/brands.js';

const VERSAO_7 = 0x70;
const VARIANTE_RFC4122 = 0x80;

const LARGURA_DO_CONTADOR = 0x0fff;

const MASCARA_DA_SEMENTE = 0x00ff;

let ultimoMilissegundo = -1;
let sequencia = 0;

function semear(): number {
  return randomBytes(2).readUInt16BE(0) & MASCARA_DA_SEMENTE;
}

function bytesDoUuidV7(agoraEmMilissegundos: number): Buffer {
  const milissegundo = Math.max(agoraEmMilissegundos, ultimoMilissegundo);

  if (milissegundo === ultimoMilissegundo) {
    sequencia += 1;
    if (sequencia > LARGURA_DO_CONTADOR) {
      ultimoMilissegundo = milissegundo + 1;
      sequencia = semear();
    }
  } else {
    ultimoMilissegundo = milissegundo;
    sequencia = semear();
  }

  const bytes = Buffer.alloc(16);
  bytes.writeUIntBE(ultimoMilissegundo, 0, 6);
  bytes[6] = VERSAO_7 | ((sequencia >> 8) & 0x0f);
  bytes[7] = sequencia & 0xff;
  randomBytes(8).copy(bytes, 8);
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
    opaqueToken: () => randomBytes(32).toString('base64url') as OpaqueToken,
    random128: () => new Uint8Array(randomBytes(16)),
    random80: () => new Uint8Array(randomBytes(10)),
  };
}

/** Canonicaliza um UUID recebido do cliente. */
export function canonicalizarUuid(valor: string): string | undefined {
  const normalizado = valor.trim().toLowerCase();
  const formato = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  return formato.test(normalizado) ? normalizado : undefined;
}
