/**
 * A imagem de catalogo, como os outros modulos a enxergam (ADR-0027 item 10).
 *
 * Duas portas, porque sao dois atos separados no tempo e no lugar:
 *
 * - `PreparadorDeEnvioDeCatalogo` assina a politica de envio direto. E chamada
 *   de rede a um servico externo, e roda FORA de transacao.
 * - `RegistroDeImagemDeCatalogo` grava a intencao. Recebe o executor de quem
 *   chama porque a intencao e a trilha dela vao na MESMA transacao.
 *
 * **A confirmacao do envio nao esta aqui ainda.** Ela e a escrita do item com a
 * imagem, e o cliente pediu em 23/09 varias imagens por produto; a arquitetura
 * vai emendar o modelo (uma tabela de imagens do produto no lugar do
 * `image_id` unico do apendice A.2), e a confirmacao entra com a emenda.
 *
 * `purpose` e o que amarra o envio ao destino (T9): a escrita do item so aceita
 * `store_item`, e a do encontro so aceitara `network_event`.
 */
import type { DbExecutor } from '../../../shared/db/pool.js';
import type { ObjectKey } from '../../../shared/types/brands.js';
import type { AutorizacaoDeEnvio } from './object-storage.js';

export type PropositoDaImagem = 'store_item' | 'network_event';

/**
 * JPEG, PNG e WebP. **SVG nunca** (D50), e HEIC tambem nao: a origem e um
 * computador de mesa (`AdminCatalogImageIntentInput.content_type`).
 */
export const TIPOS_DE_IMAGEM_DE_CATALOGO = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** O teto do contrato (`byte_size.maximum`), que vai para a politica assinada. */
export const TETO_DE_BYTES_DO_CATALOGO = 10 * 1024 * 1024;

/**
 * Dez minutos, o numero do ADR-0027 item 10. A foto do pet tem cinco porque sai
 * de um celular e a historia dela fixou cinco; esta sai de um computador de
 * mesa, e o ADR fixou dez.
 */
export const VALIDADE_DA_INTENCAO_DE_CATALOGO_EM_SEGUNDOS = 600;

export interface EnvioPreparado {
  readonly uploadId: string;
  readonly chave: ObjectKey;
  readonly contentType: string;
  readonly maxBytes: number;
  readonly autorizacao: AutorizacaoDeEnvio;
}

export interface PreparadorDeEnvioDeCatalogo {
  /** Recusa com 415 o tipo fora da lista, por IGUALDADE (SVG inclusive). */
  preparar(contentType: string, byteSize: number): Promise<EnvioPreparado>;
}

export interface NovaIntencaoDeCatalogo {
  readonly id: string;
  readonly userId: string;
  readonly purpose: PropositoDaImagem;
  readonly objectKey: ObjectKey;
  readonly declaredType: string;
  readonly maxBytes: number;
  readonly expiresAt: Date;
}

export interface RegistroDeImagemDeCatalogo {
  registrarIntencao(db: DbExecutor, nova: NovaIntencaoDeCatalogo): Promise<void>;
}
