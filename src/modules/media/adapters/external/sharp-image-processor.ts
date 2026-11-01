import sharp from 'sharp';
import type { OutputInfo } from 'sharp';
import type {
  Derivada,
  DimensoesDaImagem,
  ImageProcessor,
  MotivoDeRecusa,
  PedidoDeDerivada,
} from '../../ports/image-processor.js';
import { formatoRealDe } from '../../domain/numeros-magicos.js';
import { FORMATO_DAS_DERIVADAS } from '../../domain/derivadas.js';

const TETO_DE_MEGAPIXELS = 50;

const TETO_DE_PIXELS = TETO_DE_MEGAPIXELS * 1_000_000;

sharp.cache(false);

async function codificar(
  cru: Buffer,
  entrada: { readonly raw: { width: number; height: number; channels: 1 | 2 | 3 | 4 } },
  qualidade: number,
): Promise<Buffer> {
  const pipeline = sharp(cru, entrada);
  switch (FORMATO_DAS_DERIVADAS.nome) {
    case 'jpeg':
      return pipeline.jpeg({ quality: qualidade, mozjpeg: true, progressive: false }).toBuffer();
    case 'webp':
      return pipeline.webp({ quality: qualidade, effort: 4 }).toBuffer();
  }
}

export function criarImageProcessor(): ImageProcessor {
  return {
    async inspecionar(bytes: Buffer): Promise<DimensoesDaImagem | MotivoDeRecusa> {
      const formato = formatoRealDe(bytes);
      if (formato === null) return 'formato_nao_aceito';

      try {
        const meta = await sharp(bytes, { failOn: 'error' }).metadata();
        const largura = meta.width ?? 0;
        const altura = meta.height ?? 0;
        if (largura <= 0 || altura <= 0) return 'imagem_ilegivel';

        const megapixels = (largura * altura) / 1_000_000;
        if (megapixels > TETO_DE_MEGAPIXELS) return 'imagem_grande_demais';

        if ((meta.pages ?? 1) > 1) return 'imagem_animada';

        return { formato, largura, altura, megapixels };
      } catch {
        return 'imagem_ilegivel';
      }
    },

    async derivar(bytes: Buffer, pedido: PedidoDeDerivada): Promise<Derivada | MotivoDeRecusa> {
      let cru: { data: Buffer; info: OutputInfo };
      try {
        const pipeline = sharp(bytes, { limitInputPixels: TETO_DE_PIXELS, failOn: 'error' })
          .rotate()
          .resize(
            pedido.altura === undefined
              ?
                { width: pedido.largura, fit: 'inside', withoutEnlargement: true }
              : {
                  width: pedido.largura,
                  height: pedido.altura,
                  fit: 'cover',
                  position: sharp.strategy.attention,
                  withoutEnlargement: true,
                },
          );

        const achatada = FORMATO_DAS_DERIVADAS.achataAlfa
          ? pipeline.flatten({ background: { r: 255, g: 255, b: 255 } })
          : pipeline;

        cru = await achatada.raw().toBuffer({ resolveWithObject: true });
      } catch {
        return 'formato_nao_decodificavel';
      }

      const canais = cru.info.channels;
      const entradaCrua = {
        raw: { width: cru.info.width, height: cru.info.height, channels: canais },
      } as const;

      let ultima: { bytes: Buffer; qualidade: number } | null = null;
      for (const qualidade of pedido.escada) {
        const saida = await codificar(cru.data, entradaCrua, qualidade);
        ultima = { bytes: saida, qualidade };
        if (saida.length <= pedido.tetoDeBytes) break;
      }
      if (ultima === null) return 'imagem_ilegivel';

      return {
        bytes: ultima.bytes,
        contentType: FORMATO_DAS_DERIVADAS.contentType,
        extensao: FORMATO_DAS_DERIVADAS.extensao,
        largura: cru.info.width,
        altura: cru.info.height,
        qualidade: ultima.qualidade,
        acimaDoTeto: ultima.bytes.length > pedido.tetoDeBytes,
      };
    },
  };
}
