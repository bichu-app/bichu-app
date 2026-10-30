/** O que o cadastro precisa saber sobre foto, e **nada além**. */
import type { PetId } from '../../../shared/types/brands.js';

export type StatusDaFoto = 'processing' | 'ready' | 'rejected';

/** A foto como a ficha do pet a mostra. */
export interface FotoResumida {
  readonly id: string;
  readonly status: StatusDaFoto;
  /** O motivo da recusa, em texto. */
  readonly rejectionReason: string | null;
  readonly isPrimary: boolean;
  /** Nulas enquanto o worker não gerou as derivadas. */
  readonly thumbUrl: string | null;
  readonly cardUrl: string | null;
  readonly createdAt: Date;
}

export interface FotosDoPet {
  /** Mapa de `petId` para as fotos dele. */
  porPets(pets: readonly PetId[]): Promise<ReadonlyMap<string, readonly FotoResumida[]>>;
}
