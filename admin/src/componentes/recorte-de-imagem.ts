import { LIMITE_DE_BYTES, TIPOS_ACEITOS, type Proposito, type TipoAceito } from './envio-de-imagem.ts';

/**
 * A proporcao da moldura por proposito, e ela NAO e escolha de tela: sai da
 * geometria das derivadas em `src/modules/media/domain/derivadas.ts`.
 */
export const PROPORCAO_DA_MOLDURA: Record<Proposito, number | null> = {
  store_item: null,
  network_event: 16 / 9,
  directory_logo: 1,
  directory_photo: 16 / 9,
  directory_gallery: 16 / 9,
};

/** Zoom de 1x (a imagem inteira dentro da moldura) a 4x. */
export const ESCALA_MINIMA = 1;
export const ESCALA_MAXIMA = 4;
export const PASSO_DA_ESCALA = 0.25;
/** O passo das setas, em fracao da REGIAO visivel: 5% do que esta em tela. */
export const PASSO_DA_SETA = 0.05;

/** O lado maior da imagem enviada. */
export const LADO_MAXIMO_DO_ENVIO = 2048;

/**
 * A escada de qualidade do recorte, percorrida de cima para baixo ate caber no
 * teto de 5 MB.
 */
export const ESCADA_DE_QUALIDADE = [0.92, 0.86, 0.78, 0.68, 0.55] as const;

/**
 * O que a pessoa escolheu: o zoom e o centro do enquadramento, em fracao da
 * imagem.
 */
export interface Enquadramento {
  readonly escala: number;
  readonly centroX: number;
  readonly centroY: number;
}

export const ENQUADRAMENTO_INICIAL: Enquadramento = { escala: ESCALA_MINIMA, centroX: 0.5, centroY: 0.5 };

/**
 * A regiao enquadrada, em fracoes de 0 a 1 da imagem ja rotacionada.
 *
 * **Ela nao sai do navegador**: o painel recorta nos bytes antes de enviar, e o
 * contrato nao tem campo de regiao. Havia um schema `ImageCrop` com esta forma,
 * e ele SAIU em 31/10/2026 por decisao do cliente -- o servidor nunca leu
 * regiao de ninguem.
 */
export interface Regiao {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** A janela em pixeis da imagem ja rotacionada, pronta para `drawImage`. */
export interface Janela {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ImagemParaRecorte {
  readonly largura: number;
  readonly altura: number;
  /** O que `drawImage` aceita como origem. */
  readonly fonte: CanvasImageSource;
  readonly tipo: TipoAceito;
  readonly nome: string;
}

function preso(valor: number, minimo: number, maximo: number): number {
  return Math.min(Math.max(valor, minimo), maximo);
}

/** A regiao que a moldura mostra, em fracoes da imagem ja rotacionada. */
export function regiaoEnquadrada(
  imagem: { largura: number; altura: number },
  proporcaoAlvo: number | null,
  enquadramento: Enquadramento,
): Regiao {
  const daImagem = imagem.largura / imagem.altura;
  const alvo = proporcaoAlvo ?? daImagem;
  const razao = alvo / daImagem;
  const escala = preso(enquadramento.escala, ESCALA_MINIMA, ESCALA_MAXIMA);
  const w = Math.min(1, (razao >= 1 ? 1 : razao) / escala);
  const h = Math.min(1, (razao >= 1 ? 1 / razao : 1) / escala);
  return {
    x: preso(enquadramento.centroX - w / 2, 0, 1 - w),
    y: preso(enquadramento.centroY - h / 2, 0, 1 - h),
    w,
    h,
  };
}

/** A regiao em pixeis. Nunca devolve lado zero: `extract` de largura zero e erro. */
export function janelaEmPixels(regiao: Regiao, largura: number, altura: number): Janela {
  const width = Math.max(1, Math.round(regiao.w * largura));
  const height = Math.max(1, Math.round(regiao.h * altura));
  return {
    left: preso(Math.round(regiao.x * largura), 0, Math.max(0, largura - width)),
    top: preso(Math.round(regiao.y * altura), 0, Math.max(0, altura - height)),
    width,
    height,
  };
}

/**
 * O tamanho do envio: o do proprio recorte, limitado a {@link
 * LADO_MAXIMO_DO_ENVIO}.
 */
export function tamanhoDoEnvio(janela: Janela): { largura: number; altura: number } {
  const fator = Math.min(1, LADO_MAXIMO_DO_ENVIO / Math.max(janela.width, janela.height));
  return {
    largura: Math.max(1, Math.round(janela.width * fator)),
    altura: Math.max(1, Math.round(janela.height * fator)),
  };
}

/** O formato de saida do recorte: **o mesmo da entrada**. */
export function formatosDeSaida(tipo: TipoAceito): readonly TipoAceito[] {
  return tipo === 'image/png' ? ['image/png', 'image/webp'] : [tipo];
}

/** O navegador sabe recortar? */
export function podeRecortar(): boolean {
  return (
    typeof globalThis.createImageBitmap === 'function' &&
    typeof globalThis.HTMLCanvasElement === 'function' &&
    typeof globalThis.HTMLCanvasElement.prototype.toBlob === 'function'
  );
}

/** Le o arquivo com a orientacao do EXIF JA APLICADA nos pixeis. */
export async function lerImagem(arquivo: File): Promise<ImagemParaRecorte | undefined> {
  if (!podeRecortar()) return undefined;
  if (!(TIPOS_ACEITOS as readonly string[]).includes(arquivo.type)) return undefined;
  try {
    const bitmap = await globalThis.createImageBitmap(arquivo, { imageOrientation: 'from-image' });
    return { largura: bitmap.width, altura: bitmap.height, fonte: bitmap, tipo: arquivo.type as TipoAceito, nome: arquivo.name };
  } catch {
    return undefined;
  }
}

function paraBlob(tela: HTMLCanvasElement, tipo: string, qualidade: number): Promise<Blob | null> {
  return new Promise((resolver) => {
    tela.toBlob(resolver, tipo, qualidade);
  });
}

/** Recorta e devolve o arquivo que sobe no lugar do original. */
export async function recortar(imagem: ImagemParaRecorte, janela: Janela): Promise<File | undefined> {
  const { largura, altura } = tamanhoDoEnvio(janela);
  const tela = globalThis.document.createElement('canvas');
  tela.width = largura;
  tela.height = altura;
  const pincel = tela.getContext('2d');
  if (!pincel) return undefined;
  pincel.drawImage(imagem.fonte, janela.left, janela.top, janela.width, janela.height, 0, 0, largura, altura);
  for (const tipo of formatosDeSaida(imagem.tipo)) {
    for (const qualidade of ESCADA_DE_QUALIDADE) {
      const blob = await paraBlob(tela, tipo, qualidade);
      if (!blob || !(TIPOS_ACEITOS as readonly string[]).includes(blob.type)) break;
      if (blob.size <= LIMITE_DE_BYTES) {
        return new File([blob], imagem.nome, { type: blob.type });
      }
      if (blob.type === 'image/png') break;
    }
  }
  return undefined;
}

/** Devolve ao navegador o que a leitura tomou. */
export function devolverImagem(imagem: ImagemParaRecorte | undefined): void {
  if (imagem && typeof (imagem.fonte as ImageBitmap).close === 'function') {
    try {
      (imagem.fonte as ImageBitmap).close();
    } catch {
      // O bitmap ja nao vale; nada a fazer.
    }
  }
}
