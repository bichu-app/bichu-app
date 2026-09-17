/**
 * Geração de identificador.
 *
 * `uuidv7()` para chave primária: ordenável no tempo, o que dá localidade de
 * índice. **Por ser ordenável, ele não sai em superfície pública** — dois
 * UUIDv7 publicados entregam a taxa de criação de registros da plataforma
 * (SEC-001 e SEC-002). Para o que é público existe `opaqueToken`.
 *
 * Injetável pelo mesmo motivo do relógio: teste determinístico.
 */
import type { OpaqueToken } from '../types/brands.js';

export interface IdGenerator {
  /** Chave primária interna. Nunca vai para resposta anônima. */
  uuidv7(): string;
  /** 256 bits de CSPRNG, para token ao portador. */
  opaqueToken(): OpaqueToken;
  /** 128 bits de CSPRNG. Usado pelo código da tag e pela parte aleatória da chave de mídia. */
  random128(): Uint8Array;
}
