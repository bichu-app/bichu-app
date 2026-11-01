import type { OpaqueToken } from '../types/brands.js';

export interface IdGenerator {
  /** Chave primária interna. Nunca vai para resposta anônima. */
  uuidv7(): string;
  /** 256 bits de CSPRNG, para token ao portador. */
  opaqueToken(): OpaqueToken;
  /** 128 bits de CSPRNG. Usado pela parte aleatória da chave de mídia. */
  random128(): Uint8Array;
  /**
   * 80 bits de CSPRNG, dos quais o código da tag usa **75** (ADR-0004, Emenda 1,
   * §13.2).
   */
  random80(): Uint8Array;
}
