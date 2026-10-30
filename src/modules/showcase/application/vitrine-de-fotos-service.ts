/** O caso de uso da vitrine de fotos do usuário. */
import type { UserId } from '../../../shared/types/brands.js';
import type { Clock } from '../../../shared/ports/index.js';
import {
  recusarDimensaoDeclaradaPequena,
  type AutorizacaoDeCapa,
  type PreparadorDeEnvioDeCatalogo,
} from '../../media/ports/imagem-de-catalogo.js';
import type { DbExecutor } from '../../../shared/db/pool.js';
import {
  TETO_DE_FOTOS_DA_VITRINE,
  conferirVitrinePedida,
  recusarTetoDaVitrine,
  type FotoPedidaNaVitrine,
} from '../domain/vitrine-de-fotos.js';
import type { FotoDaVitrine, VitrineRepository } from '../ports/vitrine-repository.js';
import { PROPOSITO_DA_VITRINE } from '../adapters/persistence/kysely-vitrine.js';

/** O corpo de `createShowcasePhotoUploadIntent`, como o contrato o declara. */
export interface CorpoDaIntencaoDaVitrine {
  readonly content_type: string;
  readonly byte_size: number;
  readonly width?: number;
  readonly height?: number;
}

/** O corpo de `replaceMyShowcase`. */
export interface CorpoDaVitrine {
  readonly photos: readonly FotoPedidaNaVitrine[];
}

export interface DependenciasDaVitrine {
  readonly envios: PreparadorDeEnvioDeCatalogo;
  readonly vitrine: VitrineRepository;
  /** Grava a intenção com autor de `users`. */
  readonly registrarIntencao: (
    db: DbExecutor,
    nova: {
      readonly id: string;
      readonly userId: string;
      readonly objectKey: string;
      readonly declaredType: string;
      readonly maxBytes: number;
      readonly expiresAt: Date;
      readonly purpose: typeof PROPOSITO_DA_VITRINE;
    },
  ) => Promise<void>;
  readonly db: DbExecutor;
  readonly clock: Clock;
}

export class VitrineDeFotos {
  constructor(private readonly deps: DependenciasDaVitrine) {}

  /** A vitrine do DONO. Lista vazia é resposta normal, e não ausência de recurso. */
  async minhaVitrine(dono: UserId): Promise<readonly FotoDaVitrine[]> {
    return this.deps.vitrine.listar(dono);
  }

  async autorizarEnvio(dono: UserId, corpo: CorpoDaIntencaoDaVitrine): Promise<AutorizacaoDeCapa> {
    recusarDimensaoDeclaradaPequena(PROPOSITO_DA_VITRINE, corpo.width, corpo.height);
    const atuais = await this.deps.vitrine.listar(dono);
    if (atuais.length >= TETO_DE_FOTOS_DA_VITRINE) {
      recusarTetoDaVitrine();
    }

    const envio = await this.deps.envios.preparar(
      corpo.content_type,
      corpo.byte_size,
      PROPOSITO_DA_VITRINE,
    );
    await this.deps.registrarIntencao(this.deps.db, {
      id: envio.uploadId,
      userId: dono,
      objectKey: envio.chave,
      declaredType: envio.contentType,
      maxBytes: envio.maxBytes,
      expiresAt: envio.autorizacao.expiraEm,
      purpose: PROPOSITO_DA_VITRINE,
    });
    return { uploadId: envio.uploadId, autorizacao: envio.autorizacao };
  }

  /** Substitui a vitrine inteira. */
  async substituir(dono: UserId, corpo: CorpoDaVitrine): Promise<readonly FotoDaVitrine[]> {
    const fotos = conferirVitrinePedida(corpo.photos ?? []);
    const agora = this.deps.clock.now();
    return this.deps.vitrine.substituir({ dono, fotos, agora });
  }
}
