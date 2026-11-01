import type { Instant, ObjectKey, PetId, UserId } from '../../../shared/types/brands.js';
import type { Classe } from './object-storage.js';

export type StatusDaFoto = 'processing' | 'ready' | 'rejected';

export interface IntencaoDeEnvio {
  readonly id: string;
  readonly userId: UserId;
  readonly petId: PetId | null;
  readonly objectKey: ObjectKey;
  readonly declaredType: string;
  readonly maxBytes: number;
  readonly expiresAt: Date;
  readonly confirmedAt: Date | null;
}

export interface FotoDoPet {
  readonly id: string;
  readonly status: StatusDaFoto;
  /** O MOTIVO DA RECUSA, em texto, para a tela dizer por quê. */
  readonly rejectionReason: string | null;
  readonly isPrimary: boolean;
  readonly originalKey: ObjectKey;
  readonly thumbKey: ObjectKey | null;
  readonly cardKey: ObjectKey | null;
  readonly createdAt: Date;
}

export interface NovaIntencao {
  readonly id: string;
  readonly userId: UserId;
  readonly petId: PetId;
  readonly objectKey: ObjectKey;
  readonly declaredType: string;
  readonly maxBytes: number;
  readonly expiresAt: Date;
}

export interface MediaRepository {
  /** Confere que o pet é do chamador. */
  petEhDoTutor(pet: PetId, dono: UserId): Promise<boolean>;

  registrarIntencao(nova: NovaIntencao): Promise<void>;

  /** `null` quando não existe, não é do chamador, venceu ou já foi confirmada. */
  buscarIntencaoAberta(id: string, dono: UserId, agora: Instant): Promise<IntencaoDeEnvio | null>;

  /**
   * Cria a foto e marca a intenção como confirmada **na mesma transação**, e
   * enfileira o processamento junto.
   */
  confirmarEnvio(entrada: {
    readonly fotoId: string;
    readonly trabalhoId: string;
    readonly intencaoId: string;
    readonly petId: PetId;
    readonly objectKey: ObjectKey;
    readonly definirComoPrincipal: boolean;
    readonly agora: Instant;
  }): Promise<FotoDoPet>;

  listarDoPet(pet: PetId, dono: UserId): Promise<readonly FotoDoPet[]>;

  /** As fotos de VÁRIOS pets numa consulta só. */
  porPets(pets: readonly PetId[]): Promise<ReadonlyMap<string, readonly FotoDoPet[]>>;

  /** `null` quando não existe ou não é do chamador. */
  buscarFoto(pet: PetId, foto: string, dono: UserId): Promise<FotoDoPet | null>;

  excluirFoto(pet: PetId, foto: string, dono: UserId, agora: Instant): Promise<boolean>;

  /**
   * A foto como o WORKER precisa dela: sem dono, porque quem chama é o processo de
   * trabalho e não uma requisição de usuário.
   */
  buscarParaProcessar(foto: string): Promise<FotoParaProcessar | null>;

  marcarPronta(entrada: {
    readonly fotoId: string;
    readonly thumbKey: ObjectKey;
    readonly cardKey: ObjectKey;
    readonly agora: Instant;
  }): Promise<void>;

  /** Estado FINAL (critério 19): não volta para a fila. */
  marcarRecusada(foto: string, motivo: string, agora: Instant): Promise<void>;

  /** As intenções vencidas que ninguém confirmou (critério 13). */
  listarIntencoesVencidas(agora: Instant, limite: number): Promise<readonly IntencaoVencida[]>;

  /** Some com a linha depois que o objeto saiu. */
  descartarIntencao(id: string): Promise<void>;

  /** TODAS as chaves de objeto de uma conta, para o expurgo definitivo (SEC-020). */
  chavesDaConta(dono: UserId): Promise<readonly ObjetoDaConta[]>;
}

/** Um objeto de uma conta, com o balde em que ele está. */
export interface ObjetoDaConta {
  readonly classe: Classe;
  readonly chave: ObjectKey;
}

/** A espécie de uma intenção vencida. */
export type EspecieVencida =
  | 'pet_photo'
  | 'found_report_photo'
  | 'finder_photo'
  | 'catalog_image';

export interface IntencaoVencida {
  readonly id: string;
  readonly objectKey: ObjectKey;
  readonly kind: EspecieVencida;
}

export interface FotoParaProcessar {
  readonly id: string;
  readonly petId: PetId;
  readonly status: StatusDaFoto;
  readonly originalKey: ObjectKey;
}
