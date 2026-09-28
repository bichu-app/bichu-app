/**
 * A politica assinada de envio direto de uma imagem de catalogo (ADR-0007 a
 * letra, ADR-0027 item 10). O backend nunca recebe os bytes.
 *
 * Mesma forma de `MediaService.autorizarEnvioDeFoto`, com tres diferencas, e
 * cada uma tem motivo:
 *
 * - **a lista de tipos e outra**: JPEG, PNG e WebP, sem HEIC, porque a origem e
 *   um computador de mesa; e SVG continua recusado por igualdade, nunca por
 *   prefixo (`image/` aceitaria `image/svg+xml`, que e documento com script);
 * - **a chave nao tem dono** (`catalog/original/<128 bits>`): a imagem e
 *   conteudo do produto, e o prefixo proprio e o que deixa o CORS do bucket
 *   valer "so no prefixo do catalogo" (ADR-0027 item 4);
 * - **dez minutos**, e nao cinco.
 *
 * Esta funcao so assina. Gravar a intencao e a trilha e de quem chama, numa
 * transacao, porque a assinatura e chamada de rede e nao pode segurar conexao
 * do banco.
 */
import { problemas } from '../../../shared/http/errors.js';
import type { IdGenerator } from '../../../shared/ports/index.js';
import { chaveDoOriginalDeCatalogo } from '../domain/chave-de-objeto.js';
import {
  TETO_DE_BYTES_DO_CATALOGO,
  TIPOS_DE_IMAGEM_DE_CATALOGO,
  VALIDADE_DA_INTENCAO_DE_CATALOGO_EM_SEGUNDOS,
  type PreparadorDeEnvioDeCatalogo,
} from '../ports/imagem-de-catalogo.js';
import type { ObjectStorage } from '../ports/object-storage.js';

export function criarPreparadorDeEnvioDeCatalogo(deps: {
  readonly armazenamento: ObjectStorage;
  readonly ids: IdGenerator;
}): PreparadorDeEnvioDeCatalogo {
  return {
    async preparar(contentType, byteSize) {
      if (!(TIPOS_DE_IMAGEM_DE_CATALOGO as readonly string[]).includes(contentType)) {
        throw problemas.tipoDeMidiaNaoAceito();
      }
      if (!Number.isInteger(byteSize) || byteSize <= 0 || byteSize > TETO_DE_BYTES_DO_CATALOGO) {
        throw problemas.validacao([{ field: 'byte_size', code: 'maximum' }]);
      }
      const uploadId = deps.ids.uuidv7();
      const chave = chaveDoOriginalDeCatalogo(deps.ids.random128());
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
