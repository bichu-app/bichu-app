import { problemas } from '../../../shared/http/errors.js';
import type { IdGenerator } from '../../../shared/ports/index.js';
import { chaveDoOriginalDeCatalogo } from '../domain/chave-de-objeto.js';
import {
  CATEGORIA_DO_PROPOSITO,
  TETO_DE_BYTES_DO_CATALOGO,
  TIPOS_POR_PROPOSITO,
  VALIDADE_DA_INTENCAO_DE_CATALOGO_EM_SEGUNDOS,
  type PreparadorDeEnvioDeCatalogo,
} from '../ports/imagem-de-catalogo.js';
import type { ObjectStorage } from '../ports/object-storage.js';

export function criarPreparadorDeEnvioDeCatalogo(deps: {
  readonly armazenamento: ObjectStorage;
  readonly ids: IdGenerator;
}): PreparadorDeEnvioDeCatalogo {
  return {
    async preparar(contentType, byteSize, proposito) {
      if (!TIPOS_POR_PROPOSITO[proposito].includes(contentType)) {
        throw problemas.tipoDeMidiaNaoAceito();
      }
      if (!Number.isInteger(byteSize) || byteSize <= 0 || byteSize > TETO_DE_BYTES_DO_CATALOGO) {
        throw problemas.validacao([{ field: 'byte_size', code: 'maximum' }]);
      }
      const uploadId = deps.ids.uuidv7();
      const chave = chaveDoOriginalDeCatalogo(deps.ids.random128(), CATEGORIA_DO_PROPOSITO[proposito]);
      const autorizacao = await deps.armazenamento.createUploadIntent({
        classe: 'privado',
        chave,
        contentType,
        maxBytes: TETO_DE_BYTES_DO_CATALOGO,
        validadeEmSegundos: VALIDADE_DA_INTENCAO_DE_CATALOGO_EM_SEGUNDOS,
      });
      return { uploadId, chave, contentType, maxBytes: TETO_DE_BYTES_DO_CATALOGO, autorizacao };
    },
  };
}
