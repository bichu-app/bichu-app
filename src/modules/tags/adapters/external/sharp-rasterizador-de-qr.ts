/** O rasterizador do QR, com `sharp`. */
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
