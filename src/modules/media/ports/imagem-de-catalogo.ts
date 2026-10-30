/** A imagem de catalogo, como os outros modulos a enxergam (ADR-0027 item 10). */
import { problemas } from '../../../shared/http/errors.js';
import { TIPOS_ACEITOS, comoObjectKey, type CategoriaDeCatalogo } from '../domain/chave-de-objeto.js';

/** A ÚNICA porta pela qual outro módulo obtém a marca `ObjectKey`. */
export { comoObjectKey };
import { TETO_DE_BYTES_DO_ENVIO } from '../domain/derivadas.js';
import type { DbExecutor } from '../../../shared/db/pool.js';
import type { Instant, ObjectKey } from '../../../shared/types/brands.js';
import type { AutorizacaoDeEnvio } from './object-storage.js';

/** Os propositos da esteira. */
export type PropositoDaImagem =
  | 'store_item'
  | 'network_event'
  | 'directory_logo'
  | 'directory_photo'
  | 'directory_gallery'
  | 'directory_suggestion_logo'
  | 'user_photo'
  | 'user_showcase'
  | 'user_publication';

/** O proposito do LOGOTIPO DA INDICACAO, num ponto so. */
export const PROPOSITO_DO_LOGOTIPO_DA_INDICACAO = 'directory_suggestion_logo' as const;

/** O prefixo do armazenamento de cada proposito (ADR-0007 Emenda 1). */
export const CATEGORIA_DO_PROPOSITO: Readonly<Record<PropositoDaImagem, CategoriaDeCatalogo>> = {
  store_item: 'products',
  network_event: 'events',
  directory_logo: 'directory',
  directory_photo: 'directory',
  directory_gallery: 'directory',
  directory_suggestion_logo: 'directory',
  user_photo: 'people',
  user_showcase: 'people',
  user_publication: 'people',
};

/**
 * JPEG, PNG e WebP. **SVG nunca** (D50), e HEIC tambem nao: a origem e um
 * computador de mesa (`AdminCatalogImageIntentInput.content_type`).
 */
export const TIPOS_DE_IMAGEM_DE_CATALOGO = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** A lista de ENTRADA de cada proposito, e por que ela nao e uma so. */
export const TIPOS_POR_PROPOSITO: Readonly<Record<PropositoDaImagem, readonly string[]>> = {
  store_item: TIPOS_DE_IMAGEM_DE_CATALOGO,
  network_event: TIPOS_DE_IMAGEM_DE_CATALOGO,
  directory_logo: TIPOS_DE_IMAGEM_DE_CATALOGO,
  directory_photo: TIPOS_DE_IMAGEM_DE_CATALOGO,
  directory_gallery: TIPOS_DE_IMAGEM_DE_CATALOGO,
  directory_suggestion_logo: TIPOS_DE_IMAGEM_DE_CATALOGO,
  user_photo: TIPOS_ACEITOS,
  user_showcase: TIPOS_ACEITOS,
  user_publication: TIPOS_ACEITOS,
};

/** O teto do envio, reexportado do PONTO ÚNICO (`domain/derivadas.ts`). */
export const TETO_DE_BYTES_DO_CATALOGO = TETO_DE_BYTES_DO_ENVIO;

/** A dimensao minima por proposito (`AdminCatalogImageIntentInput.byte_size`). */
export const DIMENSAO_MINIMA: Readonly<Record<PropositoDaImagem, { largura: number; altura: number }>> = {
  store_item: { largura: 800, altura: 800 },
  network_event: { largura: 600, altura: 600 },
  directory_logo: { largura: 256, altura: 256 },
  directory_photo: { largura: 600, altura: 600 },
  directory_gallery: { largura: 600, altura: 600 },
  directory_suggestion_logo: { largura: 256, altura: 256 },
  user_photo: { largura: 300, altura: 300 },
  user_showcase: { largura: 600, altura: 600 },
  user_publication: { largura: 600, altura: 600 },
};

/** Os campos da dimensao declarada que ficam abaixo da minima do proposito. */
export function dimensaoDeclaradaAbaixoDaMinima(
  purpose: PropositoDaImagem,
  largura: number | undefined,
  altura: number | undefined,
): readonly ('width' | 'height')[] {
  const minima = DIMENSAO_MINIMA[purpose];
  const campos: ('width' | 'height')[] = [];
  if (largura !== undefined && largura < minima.largura) campos.push('width');
  if (altura !== undefined && altura < minima.altura) campos.push('height');
  return campos;
}

/**
 * Recusa a dimensao DECLARADA abaixo da minima do proposito, com `422
 * image-too-small` -- e esta e a UNICA redacao desta recusa.
 */
export function recusarDimensaoDeclaradaPequena(
  purpose: PropositoDaImagem,
  largura: number | undefined,
  altura: number | undefined,
): void {
  const abaixo = dimensaoDeclaradaAbaixoDaMinima(purpose, largura, altura);
  if (abaixo.length === 0) return;
  const minima = DIMENSAO_MINIMA[purpose];
  throw problemas.imagemPequenaDemais(
    minima,
    abaixo.map((field) => ({
      field,
      code: 'minimum',
      message: `Mínimo de ${String(field === 'width' ? minima.largura : minima.altura)} pixels.`,
    })),
  );
}

/** Dez minutos, o numero do ADR-0027 item 10. */
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
  preparar(contentType: string, byteSize: number, proposito: PropositoDaImagem): Promise<EnvioPreparado>;
}

/** O que a rota devolve: o `upload_id` e a autorizacao assinada. */
export interface AutorizacaoDeCapa {
  readonly uploadId: string;
  readonly autorizacao: AutorizacaoDeEnvio;
}

export interface NovaIntencaoDeCatalogo {
  readonly id: string;
  /** `admin_accounts.id`: o envio do PAINEL. */
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

/** O job que o worker trata. */
export const TRABALHO_DE_IMAGEM_DE_CATALOGO = 'media.process_catalog_image' as const;

export interface RegistroDeImagemDeCatalogo {
  registrarIntencao(db: DbExecutor, nova: NovaIntencaoDeCatalogo): Promise<void>;
  /**
   * O envio, com trava de linha: duas escritas com o mesmo `upload_id` nao podem as
   * duas acha-lo aberto e criar duas imagens.
   */
  envio(db: DbExecutor, uploadId: string): Promise<EnvioDeCatalogo | null>;
  /** Imagem em `processing`, envio confirmado e trabalho enfileirado, os tres juntos. */
  confirmar(db: DbExecutor, entrada: ConfirmacaoDeCatalogo): Promise<void>;
}

/**
 * A imagem como o worker precisa dela: a chave do original, e nada que sirva de
 * resposta.
 */
export interface ImagemParaProcessar {
  readonly id: string;
  readonly purpose: PropositoDaImagem;
  readonly status: 'processing' | 'ready' | 'rejected';
  readonly originalKey: ObjectKey;
}

/** O que o processamento da imagem de catalogo le e grava. */
export interface ChavesDaImagemDeCatalogo {
  readonly card: ObjectKey;
  readonly thumb?: ObjectKey;
  readonly banner?: ObjectKey;
}

export interface ImagensDeCatalogoDoWorker {
  paraProcessar(imagemId: string): Promise<ImagemParaProcessar | null>;
  /** So a partir de `processing`: estado final nao volta. */
  marcarPronta(imagemId: string, chaves: ChavesDaImagemDeCatalogo): Promise<void>;
  marcarRecusada(imagemId: string, motivo: string): Promise<void>;
}
