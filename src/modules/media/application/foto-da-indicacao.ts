import type { DbExecutor } from '../../../shared/db/pool.js';
import type { UserId } from '../../../shared/types/brands.js';
import {
  recusarDimensaoDeclaradaPequena,
  PROPOSITO_DA_FOTO_DA_INDICACAO,
  type AutorizacaoDeCapa,
  type PreparadorDeEnvioDeCatalogo,
} from '../ports/imagem-de-catalogo.js';

/**
 * O corpo de `createDirectorySuggestionPhotoUploadIntent`, como o contrato o
 * declara (`DirectorySuggestionPhotoIntentInput`).
 */
export interface CorpoDaIntencaoDaFoto {
  readonly content_type: string;
  readonly byte_size: number;
  readonly width?: number;
  readonly height?: number;
}

export interface DependenciasDaFotoDaIndicacao {
  readonly envios: PreparadorDeEnvioDeCatalogo;
  /** Grava a intencao com autor de `users` e proposito FECHADO no literal. */
  readonly registrarIntencao: (
    db: DbExecutor,
    nova: {
      readonly id: string;
      readonly userId: string;
      readonly objectKey: string;
      readonly declaredType: string;
      readonly maxBytes: number;
      readonly expiresAt: Date;
      readonly purpose: typeof PROPOSITO_DA_FOTO_DA_INDICACAO;
    },
  ) => Promise<void>;
  readonly db: DbExecutor;
}

export class FotoDaIndicacao {
  constructor(private readonly deps: DependenciasDaFotoDaIndicacao) {}

  async autorizar(
    autor: UserId,
    corpo: CorpoDaIntencaoDaFoto,
  ): Promise<AutorizacaoDeCapa> {
    recusarDimensaoDeclaradaPequena(
      PROPOSITO_DA_FOTO_DA_INDICACAO,
      corpo.width,
      corpo.height,
    );
    const envio = await this.deps.envios.preparar(
      corpo.content_type,
      corpo.byte_size,
      PROPOSITO_DA_FOTO_DA_INDICACAO,
    );
    await this.deps.registrarIntencao(this.deps.db, {
      id: envio.uploadId,
      userId: autor,
      objectKey: envio.chave,
      declaredType: envio.contentType,
      maxBytes: envio.maxBytes,
      expiresAt: envio.autorizacao.expiraEm,
      purpose: PROPOSITO_DA_FOTO_DA_INDICACAO,
    });
    return { uploadId: envio.uploadId, autorizacao: envio.autorizacao };
  }
}
