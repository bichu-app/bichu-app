/** Processamento de imagem com `sharp` / `libvips`. */
import sharp from 'sharp';
import type { OutputInfo } from 'sharp';
import type {
  Derivada,
  DimensoesDaImagem,
  ImageProcessor,
  MotivoDeRecusa,
  PedidoDeDerivada,
  RegiaoDoRecorte,
} from '../../ports/image-processor.js';
import { formatoRealDe } from '../../domain/numeros-magicos.js';
import { FORMATO_DAS_DERIVADAS } from '../../domain/derivadas.js';

/** Critério 18: acima disso é recusa final, e não retentativa. */
const TETO_DE_MEGAPIXELS = 50;

const TETO_DE_PIXELS = TETO_DE_MEGAPIXELS * 1_000_000;

/**
 * O CACHE DO LIBVIPS FICA DESLIGADO, e isto não é afinação: é o que mantém o
 * processo vivo depois da segunda foto.
 */
sharp.cache(false);

/** A codificação de UM degrau da escada, a partir do pixel cru. */
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

/** As dimensões da imagem **como ela é vista**, aplicando o `Orientation`. */
export function dimensoesVistas(meta: {
  width?: number | undefined;
  height?: number | undefined;
  orientation?: number | undefined;
}): { largura: number; altura: number } {
  const largura = meta.width ?? 0;
  const altura = meta.height ?? 0;
  const girado = (meta.orientation ?? 1) >= 5;
  return girado ? { largura: altura, altura: largura } : { largura, altura };
}

/** A região em frações vira a janela em pixels, **presa dentro da imagem**. */
export function janelaEmPixels(
  regiao: RegiaoDoRecorte,
  largura: number,
  altura: number,
): { left: number; top: number; width: number; height: number } {
  const presoEm = (valor: number, teto: number) => Math.min(Math.max(valor, 0), teto);
  const left = presoEm(Math.round(regiao.x * largura), Math.max(largura - 1, 0));
  const top = presoEm(Math.round(regiao.y * altura), Math.max(altura - 1, 0));
  const width = presoEm(Math.max(Math.round(regiao.w * largura), 1), largura - left);
  const height = presoEm(Math.max(Math.round(regiao.h * altura), 1), altura - top);
  return { left, top, width, height };
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
      let janela: { left: number; top: number; width: number; height: number } | null = null;
      if (pedido.recorte !== undefined && pedido.altura !== undefined) {
        try {
          const meta = await sharp(bytes, { failOn: 'error' }).metadata();
          const vistas = dimensoesVistas(meta);
          if (vistas.largura > 0 && vistas.altura > 0) {
            janela = janelaEmPixels(pedido.recorte, vistas.largura, vistas.altura);
          }
        } catch {
          janela = null;
        }
      }

      let cru: { data: Buffer; info: OutputInfo };
      try {
        const girada = sharp(bytes, { limitInputPixels: TETO_DE_PIXELS, failOn: 'error' })
          .rotate();

        const pipeline = (janela === null ? girada : girada.extract(janela))
          .resize(
            pedido.altura === undefined
              ?
                { width: pedido.largura, fit: 'inside', withoutEnlargement: true }
              : {
                  width: pedido.largura,
                  height: pedido.altura,
                  fit: 'cover',
                  position: janela === null ? sharp.strategy.attention : 'centre',
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
