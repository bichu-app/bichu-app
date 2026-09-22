/**
 * O desenho do QR da plaquinha.
 *
 * Domínio puro: sem banco, sem HTTP, sem relógio e **sem biblioteca de imagem**.
 * O que sai daqui é o mapa de pixels já pronto — margem de silêncio incluída,
 * módulos em blocos sólidos —, e embrulhar isso num arquivo PNG é trabalho do
 * `RasterizadorDeQr`, atrás da porta. A divisão não é cerimônia: **todas as
 * decisões que viram plástico** (nível de correção, margem, escala, o que cabe
 * na plaquinha) ficam deste lado, onde se provam sem subir nada.
 *
 * ## O que o QR carrega, e o que ele não carrega
 *
 * Ele carrega **exatamente** `{base}/t/{código}`, a mesma cadeia que a emissão
 * devolve em `url`. Por isso as duas saem de `urlDaTag` e não de duas
 * interpolações parecidas: o QR e o texto legível impressos lado a lado
 * apontando para lugares diferentes é um defeito que só aparece depois da
 * prensa, quando a correção é reimprimir a base inteira (ADR-0004).
 *
 * Ele **não** carrega `pet_id`, `tag_id`, nem nenhum outro identificador
 * interno. O ADR-0004 registra `pet_id` no QR como "o erro irreversível deste
 * projeto", e o ADR-0010 item 6 proíbe UUID interno em saída pública — e o
 * plástico na coleira de um animal é a saída mais pública que este produto tem.
 * `adapters/external/png-do-qr.test.ts` decodifica o PNG e reprova se qualquer
 * UUID aparecer.
 *
 * ## Os números, e de onde cada um vem
 *
 * - **Correção de erro Q (25%).** Está no contrato (`getPetTagQrImage`) e na
 *   Emenda 1 do ADR-0004: com 16 caracteres o payload cabe em Q sem subir de
 *   versão como subiria com 26. Plaquinha em coleira de animal risca, suja e
 *   descasca; Q aguenta isso e M não.
 * - **Margem de silêncio de 4 módulos.** ISO/IEC 18004 §6.3.8 exige 4X em volta
 *   do símbolo. Não é estética: sem ela o leitor não acha os padrões de
 *   posicionamento quando o símbolo encosta em tinta, e é isso que a prova
 *   negativa de `png-do-qr.test.ts` mede, sobre fundo escuro.
 * - **8 pixels por módulo a 300 dpi**, o que dá X = 0,677 mm. O piso é a
 *   dimensão X mínima que a GS1 General Specifications fixa para leitura por
 *   câmera de celular, 0,396 mm; 0,677 mm passa com folga e sobrevive a uma
 *   redução de escala na impressão.
 *
 * ## A guarda que reprova em vez de entregar lixo
 *
 * `LARGURA_UTIL_DA_PLAQUINHA_EM_MM` é a medida da BICHUS-103: 50 mm de largura
 * menos 3 mm de sangria de cada lado. A **versão do símbolo cresce com o
 * tamanho de `TAG_BASE_URL`**, que é variável de ambiente — uma base longa
 * empurra o QR para uma versão que não cabe na plaquinha, e isso não apareceria
 * em nenhuma tela: apareceria na guilhotina. Então `desenharQr` **recusa** um
 * desenho que não cabe, nomeando a medida. Arquivo de impressão que não serve é
 * pior que arquivo nenhum, porque o segundo alguém percebe.
 */
import QRCode from 'qrcode';
import type { AbsoluteUrl, TagCodeCanonical } from '../../../shared/types/brands.js';

/**
 * Nível de correção de erro. `Q` corrige 25% do símbolo.
 *
 * Declarado no contrato e na Emenda 1 do ADR-0004. Baixar para `M` deixa o
 * arquivo menor e a plaquinha ilegível depois de um ano de coleira.
 */
export const NIVEL_DE_CORRECAO = 'Q' as const;

/** Margem de silêncio, em módulos. ISO/IEC 18004 §6.3.8 exige 4. */
export const MODULOS_DE_MARGEM = 4;

/** Pixels por módulo no arquivo gerado. Com 300 dpi, X = 0,677 mm. */
export const PIXELS_POR_MODULO = 8;

/** Resolução gravada no PNG (chunk `pHYs`), para a impressão não adivinhar. */
export const RESOLUCAO_EM_DPI = 300;

/**
 * Largura útil da plaquinha: 50 mm menos 3 mm de sangria de cada lado
 * (BICHUS-103). É o teto que a guarda cobra.
 */
export const LARGURA_UTIL_DA_PLAQUINHA_EM_MM = 44;

/**
 * Dimensão X mínima para leitura por câmera de celular, em milímetros.
 * GS1 General Specifications, tabela de dimensão X para QR em ponto de venda.
 */
export const MODULO_MINIMO_EM_MM = 0.396;

/** Valor do pixel escuro e do claro no mapa de um canal. */
const ESCURO = 0;
const CLARO = 255;

const MILIMETROS_POR_POLEGADA = 25.4;

/**
 * A URL que vai no QR **e** no campo `url` da emissão. Uma função só, porque
 * duas interpolações parecidas divergem e o divergente vira plástico.
 */
export function urlDaTag(base: AbsoluteUrl, codigo: TagCodeCanonical): AbsoluteUrl {
  return `${base}/t/${codigo}` as AbsoluteUrl;
}

export interface MedidaImpressa {
  /** Versão do símbolo (1 a 40). Cresce com o tamanho do payload. */
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
 * papel. É o que atravessa a porta do rasterizador.
 */
export interface DesenhoDoQr {
  /** Um byte por pixel: 0 escuro, 255 claro. Margem de silêncio já pintada. */
  readonly pixels: Uint8Array;
  readonly ladoEmPixels: number;
  readonly densidadeEmDpi: number;
  readonly medida: MedidaImpressa;
}

function emMilimetros(pixels: number): number {
  return (pixels / RESOLUCAO_EM_DPI) * MILIMETROS_POR_POLEGADA;
}

/**
 * Mede o arquivo **antes** de desenhá-lo. Existe separada porque a medida é o
 * que a BICHUS-103 precisa saber, e ela não deveria custar uma rasterização
 * para ser respondida.
 */
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

/**
 * Recusa o desenho que não serve para imprimir, nomeando a medida.
 *
 * Os dois modos de falha são silenciosos de nascença: o primeiro produz um QR
 * que transborda a sangria e sai cortado da guilhotina; o segundo produz um QR
 * que cabe e que nenhuma câmera lê. Os dois só aparecem com a plaquinha na mão.
 */
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

/**
 * O mapa de pixels do QR: um canal, escuro sobre claro, margem incluída.
 *
 * Sem meio-tom: cada módulo é um bloco de `PIXELS_POR_MODULO` pixels exatos.
 * Antisserrilhado na fronteira do módulo é o que faz impressão barata borrar o
 * limiar e o leitor errar.
 */
export function desenharQr(conteudo: string): DesenhoDoQr {
  const medida = medidaImpressa(conteudo);
  exigirQueCaibaNaPlaquinha(medida);

  const simbolo = QRCode.create(conteudo, { errorCorrectionLevel: NIVEL_DE_CORRECAO });
  const lado = simbolo.modules.size;
  const total = medida.ladoEmPixels;

  // Claro é o valor inicial: o mapa já nasce com a margem de silêncio pintada.
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
