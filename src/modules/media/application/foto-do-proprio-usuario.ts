/**
 * A autorizacao de envio da FOTO DO PROPRIO USUARIO (cliente, 18/10/2026, nas
 * palavras dele: *"coloque um campo para o usuario cadastrar sua propria foto e um
 * selo na foto dele, se ele estiver validado"*).
 */
import type { DbExecutor } from '../../../shared/db/pool.js';
import type { IdGenerator } from '../../../shared/ports/index.js';
import type { UserId } from '../../../shared/types/brands.js';
import {
  recusarDimensaoDeclaradaPequena,
  type AutorizacaoDeCapa,
  type PreparadorDeEnvioDeCatalogo,
} from '../ports/imagem-de-catalogo.js';

/** O corpo de `createMyPhotoUploadIntent`, como o contrato o declara. */
export interface CorpoDaIntencaoDeFoto {
  readonly content_type: string;
  readonly byte_size: number;
  readonly width?: number;
  readonly height?: number;
}

export interface DependenciasDaFotoDoUsuario {
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
      readonly purpose: 'user_photo';
    },
  ) => Promise<void>;
  readonly db: DbExecutor;
  readonly ids: IdGenerator;
}

export class FotoDoProprioUsuario {
  constructor(private readonly deps: DependenciasDaFotoDoUsuario) {}

  async autorizar(autor: UserId, corpo: CorpoDaIntencaoDeFoto): Promise<AutorizacaoDeCapa> {
    recusarDimensaoDeclaradaPequena('user_photo', corpo.width, corpo.height);
    const envio = await this.deps.envios.preparar(corpo.content_type, corpo.byte_size, 'user_photo');
    await this.deps.registrarIntencao(this.deps.db, {
      id: envio.uploadId,
      userId: autor,
      objectKey: envio.chave,
      declaredType: envio.contentType,
      maxBytes: envio.maxBytes,
      expiresAt: envio.autorizacao.expiraEm,
      purpose: 'user_photo',
    });
    return { uploadId: envio.uploadId, autorizacao: envio.autorizacao };
  }
}
