import { problemas } from '../../../shared/http/errors.js';
import { TIPOS_ACEITOS, comoObjectKey, type CategoriaDeCatalogo } from '../domain/chave-de-objeto.js';

/** A ÚNICA porta pela qual outro módulo obtém a marca `ObjectKey`. */
export { comoObjectKey };
import {
  DERIVADAS_DA_FOTO_DE_USUARIO,
  DERIVADAS_DA_FOTO_DO_LOCAL,
  DERIVADAS_DA_GALERIA_DO_DIRETORIO,
  DERIVADAS_DA_LOGO,
  DERIVADAS_DA_PUBLICACAO,
  DERIVADAS_DA_VITRINE_DO_USUARIO,
  DERIVADAS_DO_ENCONTRO,
  DERIVADAS_DO_PRODUTO,
  TETO_DE_BYTES_DO_ENVIO,
  type EspecificacaoDaDerivada,
} from '../domain/derivadas.js';
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
  | 'directory_suggestion_photo'
  | 'user_photo'
  | 'user_showcase'
  | 'user_publication';

/** O proposito do LOGOTIPO DA INDICACAO, num ponto so. */
export const PROPOSITO_DO_LOGOTIPO_DA_INDICACAO = 'directory_suggestion_logo' as const;

/** O proposito da FOTO DO ESTABELECIMENTO da indicacao, num ponto so. */
export const PROPOSITO_DA_FOTO_DA_INDICACAO = 'directory_suggestion_photo' as const;

/** O prefixo do armazenamento de cada proposito (ADR-0007 Emenda 1). */
export const CATEGORIA_DO_PROPOSITO: Readonly<Record<PropositoDaImagem, CategoriaDeCatalogo>> = {
  store_item: 'products',
  network_event: 'events',
  directory_logo: 'directory',
  directory_photo: 'directory',
  directory_gallery: 'directory',
  directory_suggestion_logo: 'directory',
  directory_suggestion_photo: 'directory',
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
  directory_suggestion_photo: TIPOS_DE_IMAGEM_DE_CATALOGO,
  user_photo: TIPOS_ACEITOS,
  user_showcase: TIPOS_ACEITOS,
  user_publication: TIPOS_ACEITOS,
};

/** O teto do envio, reexportado do PONTO ÚNICO (`domain/derivadas.ts`). */
export const TETO_DE_BYTES_DO_CATALOGO = TETO_DE_BYTES_DO_ENVIO;

/**
 * As derivadas de cada proposito: o PONTO UNICO de onde sai tanto a geometria
 * que o worker gera quanto a proporcao que o piso obedece.
 */
export const DERIVADAS_POR_PROPOSITO: Readonly<Record<PropositoDaImagem, readonly EspecificacaoDaDerivada[]>> = {
  network_event: DERIVADAS_DO_ENCONTRO,
  store_item: DERIVADAS_DO_PRODUTO,
  directory_logo: DERIVADAS_DA_LOGO,
  directory_photo: DERIVADAS_DA_FOTO_DO_LOCAL,
  directory_gallery: DERIVADAS_DA_GALERIA_DO_DIRETORIO,
  directory_suggestion_logo: DERIVADAS_DA_LOGO,
  directory_suggestion_photo: DERIVADAS_DA_FOTO_DO_LOCAL,
  user_photo: DERIVADAS_DA_FOTO_DE_USUARIO,
  user_showcase: DERIVADAS_DA_VITRINE_DO_USUARIO,
  user_publication: DERIVADAS_DA_PUBLICACAO,
};

/**
 * A proporcao que o recorte FORCA no proposito, ou `null` quando ele e livre.
 *
 * Ela sai da MAIOR derivada que declara altura -- a `banner` quando existe --,
 * e nao de uma tabela escrita a mao: a derivada e que manda, e o recorte do
 * painel e do app so a espelha. A derivada sem `altura` (a Loja) nao corta:
 * `sharp` usa `fit: 'inside'` e a imagem inteira passa.
 *
 * **A `thumb` do encontro e 480 x 360, que e 4:3 e nao 16:9**, e por isso a
 * regra e "a maior com altura" e nao "todas concordam".
 */
export function proporcaoDaMoldura(purpose: PropositoDaImagem): number | null {
  const comAltura = DERIVADAS_POR_PROPOSITO[purpose].filter((d) => d.altura !== undefined);
  if (comAltura.length === 0) return null;
  const maior = comAltura.reduce((a, b) => (b.largura > a.largura ? b : a));
  return maior.largura / (maior.altura ?? maior.largura);
}

/**
 * A LARGURA minima decidida de cada proposito -- o unico numero escrito a mao.
 *
 * ## Por que a altura nao esta aqui
 *
 * Em 02/11/2026 o cliente travou publicando: a moldura de `directory_photo` e
 * 16:9 e o piso era 600 x 600, que e QUADRADO. Uma faixa 16:9 so alcanca 600
 * de ALTURA com 1067 de largura, entao a foto dele (1028 x 578) era recusada
 * por uma regra que o proprio recorte do produto nao conseguia cumprir. O 600
 * era o numero da LOGO, que e quadrada, e vazou para a foto em 18/10/2026.
 *
 * Em 03/11/2026 ele travou de novo, agora na capa do encontro, e disse o que
 * esperava: *"as vezes a foto ja tem 600px de largura e e muito grande na
 * altura, ai precisa manter os 600px que e o minimo, mas realizar o crop na
 * altura"*. E fixou a regra que decide este desenho: *"sempre que estivermos
 * falando de upload de imagem, isso deve ser tratado no mesmo lugar, e as
 * correcoes devem ser realizadas em todos os lugares por ser o mesmo codigo"*.
 *
 * Por isso **a altura e DERIVADA da proporcao**, e nao escrita ao lado da
 * largura: par escrito a mao pode discordar da moldura outra vez, e foi
 * exatamente assim que o defeito nasceu. O piso derivado e PONTO FIXO --
 * medido: uma imagem 600 x 338 recortada em 16:9 sai 600 x 338.
 *
 * `1280` em `directory_photo` e `directory_gallery` e a decisao do cliente de
 * 02/11/2026 e **fica**: `1280/720` e exatamente `16/9`, entao aquele piso
 * sempre foi coerente. A premissa que escolheu o 1280 ("no piso nada e
 * ampliado") era falsa -- `sharp` usa `withoutEnlargement: true` nas duas
 * formas do `resize` (`sharp-image-processor.ts`, linhas 61 a 70), e o sistema
 * nunca amplia --, mas o NUMERO continua coerente, e baixa-lo seria decisao
 * nova que o cliente nao tomou.
 */
export const LARGURA_MINIMA: Readonly<Record<PropositoDaImagem, number>> = {
  store_item: 800,
  network_event: 600,
  directory_logo: 256,
  directory_photo: 1280,
  directory_gallery: 1280,
  directory_suggestion_logo: 256,
  directory_suggestion_photo: 600,
  user_photo: 300,
  user_showcase: 600,
  user_publication: 600,
};

/** A altura do piso: a que a moldura impoe a essa largura. */
export function alturaDoPiso(largura: number, proporcao: number | null): number {
  return proporcao === null ? largura : Math.round(largura / proporcao);
}

/**
 * A dimensao minima por proposito (`AdminCatalogImageIntentInput.byte_size`),
 * **derivada** de [LARGURA_MINIMA] e da proporcao da moldura. Nenhum par e
 * escrito a mao, e e isso que impede o terceiro proposito de nascer com o
 * mesmo furo.
 */
export const DIMENSAO_MINIMA: Readonly<Record<PropositoDaImagem, { largura: number; altura: number }>> =
  Object.freeze(
    Object.fromEntries(
      (Object.keys(LARGURA_MINIMA) as PropositoDaImagem[]).map((purpose) => {
        const largura = LARGURA_MINIMA[purpose];
        return [purpose, { largura, altura: alturaDoPiso(largura, proporcaoDaMoldura(purpose)) }];
      }),
    ) as Record<PropositoDaImagem, { largura: number; altura: number }>,
  );

/**
 * A recusa do WORKER, que vai para `rejection_reason` e e o que o APP mostra.
 *
 * Ela mora aqui, junto do piso, para nao poder divergir dele: ate 03/11/2026
 * a frase era montada dentro de `processar-imagem-de-catalogo.ts` e o numero
 * era lido de `DIMENSAO_MINIMA` la, longe da tabela.
 *
 * A grafia `x` (e nao `×`) e a de hoje, de proposito: trocar o sinal mudaria
 * tambem a recusa da vitrine e a da foto de pet, que nao mudaram de numero, e
 * quebraria casos do app sem nenhum ganho para quem le.
 */
export function textoDaRecusaPorDimensao(purpose: PropositoDaImagem): string {
  const minima = DIMENSAO_MINIMA[purpose];
  return `A imagem precisa ter pelo menos ${String(minima.largura)} x ${String(minima.altura)} pixels.`;
}

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
