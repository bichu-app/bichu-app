/**
 * A autorizacao de envio de UMA FOTO DO ESTABELECIMENTO na indicacao (pedido do
 * cliente, 30/10/2026: *"na pagina de indicacao de profissional/estabelecimento,
 * so tem o campo para subir a foto do logotipo da empresa, mas nao as fotos do
 * estabelecimento que fica no topo da pagina"*).
 *
 * **Irmao exato de `logotipo-da-indicacao.ts`, e as duas diferencas sao de
 * conteudo e nao de arrumacao:** o proposito e `directory_suggestion_photo` (que
 * e SEPARADO de `directory_photo` -- ver o `COMMENT ON COLUMN` da
 * `20261030000002`) e a dimensao minima e 600 x 600 em vez dos 256 do logotipo,
 * porque a derivada `banner` e 1280 x 720 e `sharp` nao amplia.
 *
 * **Uma chamada por foto, e a tela chama ate QUATRO vezes.** Nao existe
 * autorizacao "de quatro imagens": cada assinatura e uma autorizacao de escrita
 * independente, e o varredor recolhe as que ninguem confirmar.
 */
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
