/**
 * O rasterizador do QR, com `sharp`.
 *
 * O adaptador é fino de propósito: ele não decide nada sobre o QR. Escala,
 * margem, nível de correção e a conferência de que o símbolo cabe na plaquinha
 * já aconteceram no domínio, e o que chega aqui é um mapa de pixels de um canal
 * com a densidade que ele deve ter no papel.
 *
 * Três escolhas do formato, e a razão de cada uma:
 *
 * - **Um canal (cinza), e não RGB.** O arquivo é preto e branco puro; três
 *   canais triplicariam o tamanho sem acrescentar nada, e um PNG grande viaja
 *   por aplicativo de mensagem na hora de mandar imprimir.
 * - **`density` gravada no arquivo.** É o `pHYs` do PNG, e é o que faz a
 *   impressão sair em 27,77 mm em vez do que a ferramenta adivinhar.
 * - **Compressão 9.** O conteúdo é de duas cores e grandes blocos sólidos, onde
 *   a compressão sem perdas do PNG é quase gratuita; e o arquivo fica menor
 *   para o caminho que ele de fato percorre, que é o celular do tutor.
 */
import sharp from 'sharp';
import type { DesenhoDoQr } from '../../domain/qr-da-tag.js';
import type { RasterizadorDeQr } from '../../ports/rasterizador-de-qr.js';

export function criarRasterizadorDeQr(): RasterizadorDeQr {
  return {
    paraPng(desenho: DesenhoDoQr): Promise<Buffer> {
      return sharp(Buffer.from(desenho.pixels), {
        raw: { width: desenho.ladoEmPixels, height: desenho.ladoEmPixels, channels: 1 },
      })
        .withMetadata({ density: desenho.densidadeEmDpi })
        .png({ compressionLevel: 9 })
        .toBuffer();
    },
  };
}
