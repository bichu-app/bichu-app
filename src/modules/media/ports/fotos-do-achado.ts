/** A foto do achado, como o WORKER a enxerga. */
import type { ObjectKey } from '../../../shared/types/brands.js';

/** O trabalho da fila. Mesmo prefixo de `media.process_upload`. */
export const TRABALHO_DE_HIGIENE_DA_FOTO_DO_ACHADO = 'media.sanitize_found_photo' as const;

/** `pendente` → `pronta` | `recusada` | `ausente`. */
export type StatusDaHigiene = 'pendente' | 'pronta' | 'recusada' | 'ausente';

/** A intenção de foto do achado, como o worker precisa dela. */
export interface FotoDoAchadoParaHigienizar {
  readonly uploadIntentId: string;
  /**
   * O segmento de dono da chave: o `found_report_id`, ou `sem-conta` quando quem
   * enviou não tem conta.
   */
  readonly dono: string;
  readonly originalKey: ObjectKey;
  readonly status: StatusDaHigiene;
}

export interface FotosDoAchadoDoWorker {
  /** `null` quando a intenção não existe mais, ou o id não é UUID. */
  paraHigienizar(uploadIntentId: string): Promise<FotoDoAchadoParaHigienizar | null>;
  /** As intenções que ainda não passaram pela higiene. */
  pendentes(limite: number): Promise<readonly FotoDoAchadoParaHigienizar[]>;
  /** Só a partir de `pendente`: estado final não volta. */
  marcarHigienizada(uploadIntentId: string, chave: ObjectKey, agora: Date): Promise<void>;
  marcarRecusada(uploadIntentId: string, motivo: string, agora: Date): Promise<void>;
  marcarAusente(uploadIntentId: string, agora: Date): Promise<void>;
}

/** AS DUAS ESPÉCIES DO ACHADO, e esta é a ÚNICA definição delas. */
export const ESPECIES_DO_ACHADO = ['found_report_photo', 'finder_photo'] as const;

/** `true` quando a espécie é uma das duas do achado. */
export function eDoAchado(especie: string): boolean {
  return (ESPECIES_DO_ACHADO as readonly string[]).includes(especie);
}
