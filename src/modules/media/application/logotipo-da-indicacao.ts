/**
 * A autorizacao de envio do LOGOTIPO DA INDICACAO (pedido do cliente, 29/10/2026:
 * *"nao tem o campo do logotipo para o usuario subir e indicar o
 * estabelecimento"*).
 */
import type { DbExecutor } from '../../../shared/db/pool.js';
import type { UserId } from '../../../shared/types/brands.js';
import {
  recusarDimensaoDeclaradaPequena,
  PROPOSITO_DO_LOGOTIPO_DA_INDICACAO,
  type AutorizacaoDeCapa,
  type PreparadorDeEnvioDeCatalogo,
} from '../ports/imagem-de-catalogo.js';

/**
 * O corpo de `createDirectorySuggestionLogoUploadIntent`, como o contrato o
 * declara.
 */
export interface CorpoDaIntencaoDoLogotipo {
  readonly content_type: string;
  readonly byte_size: number;
  readonly width?: number;
  readonly height?: number;
}

export interface DependenciasDoLogotipoDaIndicacao {
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
      readonly purpose: typeof PROPOSITO_DO_LOGOTIPO_DA_INDICACAO;
    },
  ) => Promise<void>;
  readonly db: DbExecutor;
}

export class LogotipoDaIndicacao {
  constructor(private readonly deps: DependenciasDoLogotipoDaIndicacao) {}

  async autorizar(
    autor: UserId,
    corpo: CorpoDaIntencaoDoLogotipo,
  ): Promise<AutorizacaoDeCapa> {
    recusarDimensaoDeclaradaPequena(
      PROPOSITO_DO_LOGOTIPO_DA_INDICACAO,
      corpo.width,
      corpo.height,
    );
    const envio = await this.deps.envios.preparar(
      corpo.content_type,
      corpo.byte_size,
      PROPOSITO_DO_LOGOTIPO_DA_INDICACAO,
    );
    await this.deps.registrarIntencao(this.deps.db, {
      id: envio.uploadId,
      userId: autor,
      objectKey: envio.chave,
      declaredType: envio.contentType,
      maxBytes: envio.maxBytes,
      expiresAt: envio.autorizacao.expiraEm,
      purpose: PROPOSITO_DO_LOGOTIPO_DA_INDICACAO,
    });
    return { uploadId: envio.uploadId, autorizacao: envio.autorizacao };
  }
}
