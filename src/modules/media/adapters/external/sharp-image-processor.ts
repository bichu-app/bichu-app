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
 * ## HEIC: o cabeçalho abre, o pixel NÃO (medido em 17/10/2026)
 *
 * O cliente aprovou aceitar HEIC de iPhone e converter para JPEG aqui. A
 * conversão está escrita e é a mesma de qualquer outra entrada — mas **esta
 * instalação não decodifica HEIC**, e o número é este:
 *
 *   sharp 0.35.4, libvips 8.18.6
 *   `sharp.format.heif.input` .............. buffer/file/stream: true
 *   `metadata()` de um HEIC real ........... OK (heif, 800 × 600, pages 1)
 *   `resize().jpeg().toBuffer()` ........... FALHA, "heif: Error while loading
 *                                            plugin: Support for this
 *                                            compression format is not
 *                                            implemented"
 *
 * O pacote pré-compilado do `sharp` traz libheif **sem o decodificador HEVC**
 * (é decisão de licenciamento do projeto, não configuração nossa), e o
 * `Dockerfile` instala pelo mesmo `npm ci`, então o container se comporta
 * igual. O que isso significa na prática: `inspecionar` aceitava o HEIC pelo
 * cabeçalho e `derivar` LANÇAVA, a fila entendia "culpa nossa" e tentava cinco
 * vezes. Agora sai `formato_nao_decodificavel`, que é recusa final com motivo
 * na tela.
 *
 * Isso **não** quebra iPhone hoje: o app recodifica no aparelho antes de enviar
 * (`CameraDoAparelho`, 1920 px e qualidade 80, sempre `image/jpeg`). Aceitar
 * HEIC de verdade no servidor exige libvips compilado com libheif+HEVC, que é
 * dependência nova — e dependência é decisão do cliente.
 *
 * ## Por que `failOn: 'error'`
 *
 * O padrão do `sharp` tolera arquivo truncado e entrega o que conseguiu ler.
 * Para um visualizador isso é gentileza; aqui é o contrário do que queremos —
 * arquivo corrompido precisa virar `rejected` com motivo, e não uma derivada
 * pela metade que ninguém sabe de onde veio.
 */
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
 *
 * O `sharp` nasce com um cache de operação de 50 MiB, 20 arquivos e 100 itens
 * (`sharp.cache()` devolve isso). Ele existe para o caso em que o mesmo processo
 * reencontra a mesma imagem, que é o caso de um servidor de miniaturas. **Aqui
 * nunca acontece**: cada trabalho da fila traz uma foto que este processo nunca
 * viu e nunca vai ver de novo. Então o cache não acerta uma vez, e o que ele faz
 * é retomar memória entre fotos sem nada em troca.
 *
 * Medido no container com o `mem_limit: 448m` da `compose.yaml`, sobre o pior
 * caso que `inspecionar` aceita (50 megapixels exatos, JPEG progressivo, 2,1 MiB
 * — cabe nos 10 MiB de `UploadIntentInput.byte_size`), dez fotos em série:
 *
 *   cache ligado (o padrão) .... 331 → 632 → 925 → 1072 MiB, e continua subindo
 *                                até 1219 MiB com teto de 2 GiB. Com os 448m de
 *                                verdade, morto pelo cgroup na SEGUNDA foto,
 *                                saída 137.
 *   cache desligado ............ pico 304 MiB, estável da terceira foto em
 *                                diante, dez fotos com saída 0.
 *
 * `MALLOC_TRIM_THRESHOLD_=131072` foi medido nos dois sentidos e **não muda
 * nada**: 304 MiB contra 310 MiB sem ela, que é ruído, e com o cache ligado o
 * processo morre com ela igual. A retenção é do cache do libvips, não do
 * alocador da glibc.
 *
 * Chamada no corpo do módulo, e não dentro de `criarImageProcessor()`, porque o
 * ajuste é do processo e não da instância: duas instâncias não são dois caches.
 */
sharp.cache(false);

/**
 * A codificação de UM degrau da escada, a partir do pixel cru.
 *
 * Mora fora de `criarImageProcessor` porque é função do FORMATO configurado e
 * não da instância, e porque é o único lugar que conhece a chamada de
 * codificação de cada formato — o `switch` existe para que trocar
 * `FORMATO_DAS_DERIVADAS` não precise de mais nenhuma edição aqui.
 *
 * `mozjpeg: true` não é enfeite: ele liga a otimização de tabela de Huffman e
 * a quantização "trellis" do mozjpeg que o libvips embute, e tira de 10% a 15%
 * dos bytes **na mesma qualidade**. Com JPEG em vez de WebP por pedido do
 * cliente, é o que devolve parte do que o formato custa.
 */
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

/**
 * As dimensões da imagem **como ela é vista**, aplicando o `Orientation`.
 *
 * O EXIF 5, 6, 7 e 8 giram 90 graus, e aí a largura do arquivo é a altura da
 * foto. É esta troca que faz a diferença entre recortar o rosto do cachorro e
 * recortar o chão ao lado dele — e nada no caminho acusaria o engano, porque
 * os dois são recortes válidos.
 */
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

/**
 * A região em frações vira a janela em pixels, **presa dentro da imagem**.
 *
 * Arredonda, prende nas bordas e garante ao menos 1 pixel em cada eixo: uma
 * janela de largura zero, ou que começa fora, faz o `extract` do libvips
 * lançar — e o que era uma região mal medida pelo cliente viraria exceção no
 * worker, a fila entenderia "culpa nossa" e tentaria cinco vezes.
 *
 * Prender em vez de recusar é deliberado: a pessoa enquadrou alguma coisa, e
 * entregar o recorte possível mais próximo do que ela pediu é melhor do que
 * recusar a foto dela por um milésimo de arredondamento.
 */
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

        // ANIMAÇÃO, recusada aqui e não descoberta depois.
        //
        // `pages` é quantos quadros o contêiner tem. Um WebP animado tem o
        // MESMO número mágico de um parado, então ele atravessa a conferência
        // de bytes; e `sharp`, sem `animated: true`, pega só o primeiro quadro
        // e não avisa. A pessoa enviava uma animação e via uma foto parada.
        //
        // Lido do cabeçalho, junto com largura e altura: nada é decodificado
        // para descobrir isso.
        if ((meta.pages ?? 1) > 1) return 'imagem_animada';

        return { formato, largura, altura, megapixels };
      } catch {
        // Inclui o próprio estouro de `limitInputPixels`, que o libvips lança.
        return 'imagem_ilegivel';
      }
    },

    async derivar(bytes: Buffer, pedido: PedidoDeDerivada): Promise<Derivada | MotivoDeRecusa> {
      // ## UMA decodificação por derivada, e a escada roda sobre PIXEL CRU
      //
      // A escada de qualidade mede os bytes e desce um degrau até caber, então
      // ela codifica várias vezes. O jeito ingênuo — abrir `sharp(bytes)` a cada
      // degrau — decodificaria o arquivo HOSTIL uma vez por degrau, até oito, e
      // este worker já morreu por memória duas vezes (cache do libvips e
      // reentrância; ver o cabeçalho deste arquivo).
      //
      // Então: corta e redimensiona UMA vez, guarda o resultado como pixel cru
      // e **codifica a partir do cru** em cada degrau. A decodificação do
      // arquivo de entrada acontece exatamente uma vez, e o cru é do tamanho da
      // SAÍDA e não da entrada — 1280 × 720 × 3 dá 2,8 MiB, e uma miniatura de
      // 176 px dá 100 KiB. Nenhum degrau aloca em função do arquivo que chegou.
      //
      // E é sequencial: um `await` por degrau, dentro de um laço. Não há
      // `Promise.all` em nenhum lugar deste arquivo, e a ausência é a regra —
      // decodificar em paralelo é o caminho pelo qual o worker morreu antes.
      // ## A REGIÃO ESCOLHIDA PELA PESSOA, quando há uma
      //
      // Ela só vale com proporção pedida: sem `altura` não há corte nenhum
      // (é a imagem de produto da Loja), e recortar assim mesmo mudaria aquela
      // tela em silêncio.
      //
      // As dimensões saem do CABEÇALHO, com o `Orientation` aplicado por
      // `dimensoesVistas` — ler o cabeçalho não decodifica nada, e é o que
      // permite converter a fração em pixel sem um segundo decode. O outro
      // caminho seria `.rotate().toBuffer()` antes de medir, e ele pagaria uma
      // decodificação inteira do arquivo hostil só para saber duas dimensões.
      let janela: { left: number; top: number; width: number; height: number } | null = null;
      if (pedido.recorte !== undefined && pedido.altura !== undefined) {
        try {
          const meta = await sharp(bytes, { failOn: 'error' }).metadata();
          const vistas = dimensoesVistas(meta);
          if (vistas.largura > 0 && vistas.altura > 0) {
            janela = janelaEmPixels(pedido.recorte, vistas.largura, vistas.altura);
          }
        } catch {
          // Cabeçalho que não abre aqui vai falhar logo abaixo, no caminho que
          // já sabe dizer o motivo. Seguir sem janela é cair no corte
          // automático, que é o comportamento de sempre.
          janela = null;
        }
      }

      let cru: { data: Buffer; info: OutputInfo };
      try {
        const girada = sharp(bytes, { limitInputPixels: TETO_DE_PIXELS, failOn: 'error' })
          // A ORIENTAÇÃO PRIMEIRO, e antes do corte: `.rotate()` sem argumento
          // aplica o EXIF `Orientation` nos PIXELS. Sem ele, uma foto de
          // celular tirada na vertical seria cortada deitada — o corte pegaria
          // a faixa errada da imagem — e o metadado que diz "gire" é jogado
          // fora uma linha abaixo. Vale para TODA entrada, HEIC de iPhone
          // incluído: é a mesma chamada para os quatro formatos.
          //
          // **E é por isso que a região da pessoa é medida DEPOIS da rotação**:
          // `janela` saiu de `dimensoesVistas`, que aplica o mesmo
          // `Orientation` nas contas. As duas pontas no mesmo sistema de
          // coordenadas, ou o recorte sai de um lugar plausível e errado.
          .rotate();

        // O recorte da pessoa entra ENTRE a rotação e a redução. Quando ele
        // existe, o `resize` abaixo não escolhe mais nada: ele só reduz a
        // janela já recortada para a geometria pedida.
        const pipeline = (janela === null ? girada : girada.extract(janela))
          .resize(
            pedido.altura === undefined
              ? // Sem proporção pedida: reduz para caber na largura e preserva
                // a proporção do arquivo. É o comportamento da imagem de
                // produto da Loja, cuja tela eu não medi.
                { width: pedido.largura, fit: 'inside', withoutEnlargement: true }
              : {
                  width: pedido.largura,
                  height: pedido.altura,
                  // `cover` é o CORTE que o cliente pediu: a imagem preenche a
                  // moldura e o que sobra fora da proporção é descartado **da
                  // derivada**. O arquivo guardado continua inteiro.
                  fit: 'cover',
                  // `attention` e não o centro: o libvips procura a região de
                  // maior energia e corta em volta dela. Numa foto de cachorro
                  // o centro geométrico costuma ser o corpo, e um corte
                  // centrado em retrato decapita o animal — que é exatamente o
                  // erro que não tem volta.
                  //
                  // **E ele só decide quando ninguém decidiu antes.** Com
                  // `janela`, a imagem que chega aqui JÁ é o retângulo que a
                  // pessoa enquadrou, e `centre` sobre ele é identidade: a
                  // proporção já bate, então não há o que cortar. Deixar
                  // `attention` aqui faria a heurística cortar de novo
                  // dentro do recorte dela, por causa do arredondamento de um
                  // pixel — e seria exatamente o defeito que esta mudança
                  // existe para tirar.
                  position: janela === null ? sharp.strategy.attention : 'centre',
                  // Uma foto de 400 px não vira `card` de 1024 esticado:
                  // ampliar não acrescenta informação e triplica o arquivo. O
                  // `sharp` reduz o alvo preservando a proporção pedida.
                  withoutEnlargement: true,
                },
          );

        // JPEG não guarda canal alfa. Sem achatar, o que o libvips faz com o
        // alfa descartado não é promessa de versão — e um PNG de fundo
        // transparente sairia com o fundo preto.
        const achatada = FORMATO_DAS_DERIVADAS.achataAlfa
          ? pipeline.flatten({ background: { r: 255, g: 255, b: 255 } })
          : pipeline;

        // **Nada de metadado sai daqui.** `.raw()` entrega pixel e só pixel:
        // não existe EXIF, XMP nem IPTC num buffer cru, então a ausência deixa
        // de depender de ninguém lembrar de não chamar `withMetadata()`. É a
        // forma mais forte da mesma garantia do critério 14 — e é ela que
        // descarta a coordenada de GPS da foto de celular.
        cru = await achatada.raw().toBuffer({ resolveWithObject: true });
      } catch {
        // Cabeçalho que abriu e pixel que não abre é culpa do ARQUIVO, e
        // recusa final: tentar de novo não muda a resposta. É por aqui que o
        // HEIC sem decodificador HEVC sai com motivo em vez de derrubar o
        // trabalho cinco vezes.
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
        // PARA NO PRIMEIRO QUE CABE, e a escada vem do melhor degrau para o
        // pior: o que sai é sempre a melhor qualidade que respeita o teto.
        if (saida.length <= pedido.tetoDeBytes) break;
      }
      // A escada nunca é vazia (`derivadas.ts` as declara com oito e seis
      // degraus), mas o tipo não garante isso e um `!` aqui seria uma promessa
      // que ninguém cobra.
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
