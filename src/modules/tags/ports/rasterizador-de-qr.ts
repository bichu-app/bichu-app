import type { DesenhoDoQr } from '../domain/qr-da-tag.js';

export interface RasterizadorDeQr {
  /** O desenho como arquivo PNG, com a densidade gravada nele. */
  paraPng(desenho: DesenhoDoQr): Promise<Buffer>;
}
