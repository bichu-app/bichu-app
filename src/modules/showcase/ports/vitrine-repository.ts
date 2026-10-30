/** A porta da vitrine de fotos do usuário. */
import type { DbExecutor } from '../../../shared/db/pool.js';
import type { Instant, ObjectKey, UserId } from '../../../shared/types/brands.js';
import type { StatusDaFoto } from '../../media/ports/media-repository.js';
import type { FotoDaVitrineParaGravar } from '../domain/vitrine-de-fotos.js';

/** Uma foto da vitrine, como a leitura a devolve. */
export interface FotoDaVitrine {
  /**
   * O `upload_id` — `catalog_upload_intents.id` —, e **nunca** `catalog_images.id`,
   * que é identidade interna e não sai em resposta.
   */
  readonly uploadId: string | null;
  readonly position: number;
  readonly status: StatusDaFoto;
  /** A derivada da GRADE (320 px). */
  readonly gradeKey: ObjectKey | null;
  /** A derivada ABERTA (1024 px). */
  readonly abertaKey: ObjectKey | null;
  readonly rejectionReason: string | null;
  readonly altText: string | null;
}

export interface VitrineRepository {
  /** A vitrine do dono, em ordem de posição. */
  listar(dono: UserId): Promise<readonly FotoDaVitrine[]>;

  /** Substitui a vitrine inteira, numa transação só. */
  substituir(entrada: {
    readonly dono: UserId;
    readonly fotos: readonly FotoDaVitrineParaGravar[];
    readonly agora: Instant;
  }): Promise<readonly FotoDaVitrine[]>;
}

/** O que a escrita precisa saber de um envio antes de confirmá-lo. */
export interface EnvioDaVitrine {
  readonly id: string;
  readonly purpose: string;
  readonly expiresAt: Date;
  readonly confirmedAt: Date | null;
  readonly catalogImageId: string | null;
}

/** As funções soltas sobre um executor, para a escrita compor a transação. */
export interface OperacoesDaVitrine {
  envioDoDono(db: DbExecutor, uploadId: string, dono: UserId): Promise<EnvioDaVitrine | null>;
}
