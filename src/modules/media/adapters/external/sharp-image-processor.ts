/**
 * Processamento de imagem com `sharp` / `libvips`.
 *
 * **Este é o único arquivo do sistema que importa `sharp`**, e a regra de
 * arquitetura o impõe: a biblioteca está na lista de pacotes proibidos em
 * `domain/` e `application/`.
 *
 * ## Os três limites de memória, e por que são três
 *
 * O decodificador de imagem lê bytes hostis por definição, e a forma clássica de
 * derrubar um serviço com ele não é um arquivo grande — é um arquivo **pequeno**
 * que descomprime para algo enorme (a "bomba de descompressão"). 50.000 × 50.000
 * cabem em poucos quilobytes comprimidos e em 10 GB de RAM decodificados.
 *
 * 1. `limitInputPixels` recusa no próprio libvips, antes de alocar.
 * 2. `inspecionar` lê só o cabeçalho e recusa antes de chamar o decodificador.
 * 3. O worker roda com limite de memória e reinício automático no `compose.yaml`.
 *
 * Os três existem porque cada um falha de um jeito diferente, e o critério 18 de
 * `BICHUS-87` pede os três nomeados.
 *
 * ## Por que `failOn: 'error'`
 *
 * O padrão do `sharp` tolera arquivo truncado e entrega o que conseguiu ler.
 * Para um visualizador isso é gentileza; aqui é o contrário do que queremos —
 * arquivo corrompido precisa virar `rejected` com motivo, e não uma derivada
 * pela metade que ninguém sabe de onde veio.
 */
import sharp from 'sharp';
import type {
  Derivada,
  DimensoesDaImagem,
  ImageProcessor,
  MotivoDeRecusa,
} from '../../ports/image-processor.js';
import { formatoRealDe } from '../../domain/numeros-magicos.js';

/** Critério 18: acima disso é recusa final, e não retentativa. */
const TETO_DE_MEGAPIXELS = 50;

const TETO_DE_PIXELS = TETO_DE_MEGAPIXELS * 1_000_000;

export function criarImageProcessor(): ImageProcessor {
  return {
    async inspecionar(bytes: Buffer): Promise<DimensoesDaImagem | MotivoDeRecusa> {
      // OS BYTES PRIMEIRO. A biblioteca só é chamada depois que a assinatura
      // confere: é ela que decide o formato, nunca o tipo declarado no envio, e
      // é a nossa lista que decide, não a lista do libvips — que aceita SVG.
      const formato = formatoRealDe(bytes);
      if (formato === null) return 'formato_nao_aceito';

      try {
        // `metadata()` lê o CABEÇALHO. Não decodifica a imagem, e é isso que
        // permite recusar 50 megapixels sem nunca alocar memória para eles.
        //
        // **SEM `limitInputPixels` aqui, de propósito.** Com ele, a leitura do
        // cabeçalho LANÇA quando a imagem é grande demais, e o `catch` abaixo
        // transformava "56 megapixels" em `imagem_ilegivel` — a foto era
        // recusada pelo motivo errado, e a pessoa recebia "arquivo corrompido"
        // sobre uma foto perfeitamente válida, só grande.
        //
        // Ler o cabeçalho é barato e não aloca os pixels; quem recusa é a
        // comparação logo abaixo, com o motivo certo. O limite continua valendo
        // em `derivar`, que é onde a decodificação de fato acontece.
        const meta = await sharp(bytes, { failOn: 'error' }).metadata();
        const largura = meta.width ?? 0;
        const altura = meta.height ?? 0;
        if (largura <= 0 || altura <= 0) return 'imagem_ilegivel';

        const megapixels = (largura * altura) / 1_000_000;
        if (megapixels > TETO_DE_MEGAPIXELS) return 'imagem_grande_demais';

        return { formato, largura, altura, megapixels };
      } catch {
        // Inclui o próprio estouro de `limitInputPixels`, que o libvips lança.
        return 'imagem_ilegivel';
      }
    },

    async derivar(bytes: Buffer, larguraMaxima: number): Promise<Derivada> {
      const saida = await sharp(bytes, { limitInputPixels: TETO_DE_PIXELS, failOn: 'error' })
        // `withoutEnlargement`: uma foto de 400 px não vira `card` de 1024
        // esticado. Ampliar não acrescenta informação e triplica o arquivo.
        .resize({ width: larguraMaxima, height: larguraMaxima, fit: 'inside', withoutEnlargement: true })
        // **Nada de metadado sai daqui.** O `sharp` não copia metadado a menos
        // que alguém chame `withMetadata()`, e ninguém chama: é uma ausência
        // deliberada, e o teste de fixtures existe para que ela continue
        // ausente depois de uma refatoração distraída.
        .rotate() // aplica a orientação do EXIF nos PIXELS antes de descartá-lo
        .webp({ quality: 82, effort: 4 })
        .toBuffer({ resolveWithObject: true });

      return {
        bytes: saida.data,
        contentType: 'image/webp',
        extensao: 'webp',
        largura: saida.info.width,
        altura: saida.info.height,
      };
    },
  };
}
