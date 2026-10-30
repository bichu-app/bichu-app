/** A autorizacao de envio da CAPA do encontro da comunidade (ADR-0025 emenda 3). */
import type { DbExecutor } from '../../../shared/db/pool.js';
import type { IdGenerator } from '../../../shared/ports/index.js';
import type { UserId } from '../../../shared/types/brands.js';
import {
  recusarDimensaoDeclaradaPequena,
  type AutorizacaoDeCapa,
  type PreparadorDeEnvioDeCatalogo,
} from '../ports/imagem-de-catalogo.js';

/** O corpo de `createNetworkEventCoverUploadIntent`, como o contrato o declara. */
export interface CorpoDaIntencaoDeCapa {
  readonly content_type: string;
  readonly byte_size: number;
  readonly width?: number;
  readonly height?: number;
}

export interface DependenciasDaCapaDeEncontro {
  readonly envios: PreparadorDeEnvioDeCatalogo;
  /** Grava a intencao com autor de `users`. */
  readonly registrarIntencao: (
    db: DbExecutor,
    nova: {
      readonly id: string;
      readonly userId: string;
      readonly objectKey: string;
      readonly declaredType: string;
      readonly maxBytes: number;
      readonly expiresAt: Date;
    },
  ) => Promise<void>;
  readonly db: DbExecutor;
  readonly ids: IdGenerator;
}

export class CapaDeEncontroDaComunidade {
  constructor(private readonly deps: DependenciasDaCapaDeEncontro) {}

  async autorizar(autor: UserId, corpo: CorpoDaIntencaoDeCapa): Promise<AutorizacaoDeCapa> {
    recusarDimensaoDeclaradaPequena('network_event', corpo.width, corpo.height);
    const envio = await this.deps.envios.preparar(corpo.content_type, corpo.byte_size, 'network_event');
    await this.deps.registrarIntencao(this.deps.db, {
      id: envio.uploadId,
      userId: autor,
      objectKey: envio.chave,
      declaredType: envio.contentType,
      maxBytes: envio.maxBytes,
      expiresAt: envio.autorizacao.expiraEm,
    });
    return { uploadId: envio.uploadId, autorizacao: envio.autorizacao };
  }
}
