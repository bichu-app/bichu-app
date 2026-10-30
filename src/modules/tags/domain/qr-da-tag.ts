/** O desenho do QR da plaquinha. */
import QRCode from 'qrcode';
import type { AbsoluteUrl, TagCodeCanonical } from '../../../shared/types/brands.js';

/** Nível de correção de erro. */
export const NIVEL_DE_CORRECAO = 'Q' as const;

/** Margem de silêncio, em módulos. */
export const MODULOS_DE_MARGEM = 4;

/** Pixels por módulo no arquivo gerado. */
export const PIXELS_POR_MODULO = 8;

/** Resolução gravada no PNG (chunk `pHYs`), para a impressão não adivinhar. */
export const RESOLUCAO_EM_DPI = 300;

/**
 * Largura útil da plaquinha: 50 mm menos 3 mm de sangria de cada lado
 * (BICHUS-103).
 */
export const LARGURA_UTIL_DA_PLAQUINHA_EM_MM = 44;

/** Dimensão X mínima para leitura por câmera de celular, em milímetros. */
export const MODULO_MINIMO_EM_MM = 0.396;

/** Valor do pixel escuro e do claro no mapa de um canal. */
const ESCURO = 0;
const CLARO = 255;

const MILIMETROS_POR_POLEGADA = 25.4;

/** A URL que vai no QR **e** no campo `url` da emissão. */
export function urlDaTag(base: AbsoluteUrl, codigo: TagCodeCanonical): AbsoluteUrl {
  return `${base}/t/${codigo}` as AbsoluteUrl;
}

export interface MedidaImpressa {
  /** Versão do símbolo (1 a 40). */
  readonly versao: number;
  /** Lado do símbolo em módulos, sem a margem. */
  readonly modulosDoSimbolo: number;
  /** Lado do arquivo em módulos, com as duas margens. */
  readonly modulosComMargem: number;
  readonly ladoEmPixels: number;
  readonly ladoEmMilimetros: number;
  readonly moduloEmMilimetros: number;
  readonly bytesDoPayload: number;
}

/**
 * O arquivo antes de ser arquivo: o mapa de pixels e a medida que ele terá no
 * papel.
 */
export interface DesenhoDoQr {
  /** Um byte por pixel: 0 escuro, 255 claro. */
  readonly pixels: Uint8Array;
  readonly ladoEmPixels: number;
  readonly densidadeEmDpi: number;
  readonly medida: MedidaImpressa;
}

function emMilimetros(pixels: number): number {
  return (pixels / RESOLUCAO_EM_DPI) * MILIMETROS_POR_POLEGADA;
}

/** Mede o arquivo **antes** de desenhá-lo. */
export function medidaImpressa(conteudo: string): MedidaImpressa {
  const simbolo = QRCode.create(conteudo, { errorCorrectionLevel: NIVEL_DE_CORRECAO });
  const modulosDoSimbolo = simbolo.modules.size;
  const modulosComMargem = modulosDoSimbolo + 2 * MODULOS_DE_MARGEM;
  const ladoEmPixels = modulosComMargem * PIXELS_POR_MODULO;

  return {
    versao: simbolo.version,
    modulosDoSimbolo,
    modulosComMargem,
    ladoEmPixels,
    ladoEmMilimetros: emMilimetros(ladoEmPixels),
    moduloEmMilimetros: emMilimetros(PIXELS_POR_MODULO),
    bytesDoPayload: Buffer.byteLength(conteudo, 'utf8'),
  };
}

/** Recusa o desenho que não serve para imprimir, nomeando a medida. */
export function exigirQueCaibaNaPlaquinha(medida: MedidaImpressa): void {
  if (medida.ladoEmMilimetros > LARGURA_UTIL_DA_PLAQUINHA_EM_MM) {
    throw new Error(
      `O QR de ${String(medida.bytesDoPayload)} bytes saiu na versão ` +
        `${String(medida.versao)} (${String(medida.modulosComMargem)} módulos com a ` +
        `margem) e mede ${medida.ladoEmMilimetros.toFixed(2)} mm, acima dos ` +
        `${String(LARGURA_UTIL_DA_PLAQUINHA_EM_MM)} mm úteis da plaquinha (BICHUS-103: ` +
        '50 mm de largura menos 3 mm de sangria de cada lado). O payload cresceu — ' +
        'quase sempre porque `TAG_BASE_URL` ficou mais longa. Encurte a base ou ' +
        'redimensione a plaquinha ANTES de imprimir: o formato impresso é ' +
        'irreversível (ADR-0004).',
    );
  }

  if (medida.moduloEmMilimetros < MODULO_MINIMO_EM_MM) {
    throw new Error(
      `O módulo do QR mede ${medida.moduloEmMilimetros.toFixed(3)} mm, abaixo da ` +
        `dimensão X mínima de ${String(MODULO_MINIMO_EM_MM)} mm que a GS1 fixa para ` +
        'leitura por câmera de celular. O arquivo seria impresso e não seria lido. ' +
        `Conteúdo de ${String(medida.bytesDoPayload)} bytes, versão ` +
        `${String(medida.versao)}.`,
    );
  }
}

/** O mapa de pixels do QR: um canal, escuro sobre claro, margem incluída. */
export function desenharQr(conteudo: string): DesenhoDoQr {
  const medida = medidaImpressa(conteudo);
  exigirQueCaibaNaPlaquinha(medida);

  const simbolo = QRCode.create(conteudo, { errorCorrectionLevel: NIVEL_DE_CORRECAO });
  const lado = simbolo.modules.size;
  const total = medida.ladoEmPixels;

  const pixels = new Uint8Array(total * total).fill(CLARO);

  for (let y = 0; y < lado; y += 1) {
    for (let x = 0; x < lado; x += 1) {
      if (simbolo.modules.data[y * lado + x] === 0) continue;
      const topo = (y + MODULOS_DE_MARGEM) * PIXELS_POR_MODULO;
      const esquerda = (x + MODULOS_DE_MARGEM) * PIXELS_POR_MODULO;
      for (let dy = 0; dy < PIXELS_POR_MODULO; dy += 1) {
        const inicio = (topo + dy) * total + esquerda;
        pixels.fill(ESCURO, inicio, inicio + PIXELS_POR_MODULO);
      }
    }
  }

  return { pixels, ladoEmPixels: total, densidadeEmDpi: RESOLUCAO_EM_DPI, medida };
}
