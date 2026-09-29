/**
 * A imagem de catalogo, como os outros modulos a enxergam (ADR-0027 item 10).
 *
 * Duas portas, porque sao dois atos separados no tempo e no lugar:
 *
 * - `PreparadorDeEnvioDeCatalogo` assina a politica de envio direto. E chamada
 *   de rede a um servico externo, e roda FORA de transacao.
 * - `RegistroDeImagemDeCatalogo` grava a intencao, acha o envio e o confirma.
 *   Recebe o executor de quem chama porque a confirmacao e a propria escrita do
 *   item (ou do encontro), e precisa estar na MESMA transacao dela e da trilha:
 *   um repositorio com transacao propria confirmaria a imagem de um item que
 *   depois nao foi gravado.
 *
 * `purpose` e o que amarra o envio ao destino (T9): a escrita do item so aceita
 * `store_item`, e a do encontro so aceitara `network_event`.
 */
import type { DbExecutor } from '../../../shared/db/pool.js';
import type { Instant, ObjectKey } from '../../../shared/types/brands.js';
import type { AutorizacaoDeEnvio } from './object-storage.js';

export type PropositoDaImagem = 'store_item' | 'network_event';

/**
 * JPEG, PNG e WebP. **SVG nunca** (D50), e HEIC tambem nao: a origem e um
 * computador de mesa (`AdminCatalogImageIntentInput.content_type`).
 */
export const TIPOS_DE_IMAGEM_DE_CATALOGO = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** O teto do contrato (`byte_size.maximum`), que vai para a politica assinada. */
export const TETO_DE_BYTES_DO_CATALOGO = 5 * 1024 * 1024;

/**
 * A dimensao minima por proposito (`AdminCatalogImageIntentInput.byte_size`).
 * So e conhecida depois do envio: o worker a confere nos bytes e recusa com o
 * motivo, e o painel mostra o erro na miniatura.
 */
export const DIMENSAO_MINIMA: Readonly<Record<PropositoDaImagem, { largura: number; altura: number }>> = {
  store_item: { largura: 800, altura: 800 },
  network_event: { largura: 1600, altura: 900 },
};

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
  /** `admin_accounts.id`: o envio de catalogo e do painel, nunca de `users`. */
  readonly adminAccountId: string;
  readonly purpose: PropositoDaImagem;
  readonly objectKey: ObjectKey;
  readonly declaredType: string;
  readonly maxBytes: number;
  readonly expiresAt: Date;
}

export interface EnvioDeCatalogo {
  readonly id: string;
  readonly kind: string;
  readonly purpose: PropositoDaImagem | null;
  readonly expiresAt: Date;
  readonly confirmedAt: Date | null;
  /** A imagem que ja nasceu deste envio, quando ele ja foi confirmado. */
  readonly catalogImageId: string | null;
}

export interface ConfirmacaoDeCatalogo {
  readonly imagemId: string;
  readonly trabalhoId: string;
  readonly envioId: string;
  readonly purpose: PropositoDaImagem;
  readonly agora: Instant;
}

/** O job que o worker trata. Mesmo prefixo de `media.process_upload`. */
export const TRABALHO_DE_IMAGEM_DE_CATALOGO = 'media.process_catalog_image' as const;

export interface RegistroDeImagemDeCatalogo {
  registrarIntencao(db: DbExecutor, nova: NovaIntencaoDeCatalogo): Promise<void>;
  /**
   * O envio, com trava de linha: duas escritas com o mesmo `upload_id` nao
   * podem as duas acha-lo aberto e criar duas imagens. `null` quando nao existe
   * ou o id nao e UUID.
   */
  envio(db: DbExecutor, uploadId: string): Promise<EnvioDeCatalogo | null>;
  /** Imagem em `processing`, envio confirmado e trabalho enfileirado, os tres juntos. */
  confirmar(db: DbExecutor, entrada: ConfirmacaoDeCatalogo): Promise<void>;
}

/** A imagem como o worker precisa dela: a chave do original, e nada que sirva de resposta. */
export interface ImagemParaProcessar {
  readonly id: string;
  readonly purpose: PropositoDaImagem;
  readonly status: 'processing' | 'ready' | 'rejected';
  readonly originalKey: ObjectKey;
}

/** O que o processamento da imagem de catalogo le e grava. Sem transacao de fora. */
export interface ImagensDeCatalogoDoWorker {
  paraProcessar(imagemId: string): Promise<ImagemParaProcessar | null>;
  /** So a partir de `processing`: estado final nao volta. */
  marcarPronta(imagemId: string, chavePublica: ObjectKey): Promise<void>;
  marcarRecusada(imagemId: string, motivo: string): Promise<void>;
}
