import { LIMITE_DE_BYTES, TIPOS_ACEITOS, type Proposito, type TipoAceito } from './envio-de-imagem.ts';

/**
 * RECORTE E REPOSICIONAMENTO, a geometria (BICHUS-314, cliente 28 e
 * 29/10/2026: *"um recurso para o usuario subir a imagem e reposicionar a
 * imagem, pois voce esta cropando no lugar errado"*).
 *
 * O defeito nao e o corte existir: e quem o escolhe. Hoje o servidor corta por
 * `sharp.strategy.attention`, que persegue ENERGIA -- variacao local de pixel --
 * e nao significado. Num retrato de celular ela desce para a folhagem e corta a
 * cabeca do animal; numa logo ela persegue a borda e come o logotipo.
 *
 * ## O painel recorta ANTES de enviar, e isso foi medido
 *
 * O contrato ja DECLARA `ImageCrop` em `CatalogImageInput`,
 * `StoreCatalogImageInput` e `CommunityNetworkEventCoverInput` -- a regiao em
 * fracoes de 0 a 1. Mas **nada no servidor a le**: `grep -rn "crop"` em `src/`
 * fora de `generated/` e dos testes acha so o processador de imagem
 * (`sharp-image-processor.ts`, que ja sabe aplicar uma `RegiaoDoRecorte`) e
 * comentarios; nao ha coluna `crop` em `src/shared/db/schema.ts`, nao ha
 * migracao com esse nome e nenhuma rota ou dominio copia o campo do corpo. O
 * validador aceitaria a regiao e a jogaria fora **sem erro e sem log** -- o
 * painel mandaria a posicao, o cliente veria o mesmo corte errado e o pedido
 * voltaria pela quarta vez.
 *
 * Entao o painel manda os BYTES ja recortados. O custo esta escrito e e real:
 * o original guardado passa a ser o recorte, e reajustar depois exige escolher
 * o arquivo de novo. No dia em que o servidor gravar `ImageCrop`, este mesmo
 * modulo ja produz a fracao ({@link regiaoEnquadrada}) e a troca e no ponto de
 * chamada.
 *
 * ## As coordenadas sao da imagem JA ROTACIONADA
 *
 * `createImageBitmap(..., { imageOrientation: 'from-image' })` aplica o
 * `Orientation` do EXIF nos pixeis antes de qualquer conta. Sem isso uma foto
 * tirada em pe sairia recortada deitada -- um recorte plausivel da parte errada
 * da foto, sem erro e sem log. Onde o navegador nao souber aplicar a
 * orientacao, {@link lerImagem} desiste e o envio segue como antes: e melhor
 * nao oferecer o ajuste do que oferecer um que mente.
 */

/**
 * A proporcao da moldura por proposito, e ela NAO e escolha de tela: sai da
 * geometria das derivadas em `src/modules/media/domain/derivadas.ts`.
 *
 * | proposito | derivadas | moldura |
 * | --- | --- | --- |
 * | `directory_logo` | `card` 512x512, `thumb` 176x176 | 1:1 |
 * | `directory_photo` | `banner` 1280x720, `card` 1024x576 | 16:9 |
 * | `directory_gallery` | 1280x720, 1024x576, `thumb` 480x360 | 16:9 |
 * | `network_event` | 1280x720, 1024x576, `thumb` 480x360 | 16:9 |
 * | `store_item` | `card` 1024 no lado maior, **sem corte** | livre |
 *
 * `null` quer dizer LIVRE: a moldura nasce com a proporcao do proprio arquivo.
 * A Loja e o unico proposito que o servidor **nao corta** -- ele reduz para
 * 1024 px no lado maior e preserva a proporcao --, e impor 1:1 ali decepa o
 * rotulo da embalagem. Quem nao mexer no enquadramento sai com a foto inteira,
 * que e exatamente o comportamento de hoje.
 *
 * Duas das cinco superficies tem DUAS proporcoes nas derivadas (16:9 na capa e
 * no cartao, 4:3 na miniatura). A pessoa enquadra uma vez, na principal; a
 * miniatura sai de dentro do recorte dela, e nao mais da foto inteira.
 *
 * `Record<Proposito, ...>` vale como TRAVA, como em `DIMENSAO_MINIMA`:
 * proposito novo no contrato reprova no compilador aqui em vez de cair em
 * `undefined` e virar moldura quadrada por acidente.
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

/**
 * O lado maior da imagem enviada. A maior derivada e o `banner` 1280 x 720, e
 * 2048 cobre com folga qualquer proporcao futura sem mandar os 4000 px do
 * celular pela rede.
 */
export const LADO_MAXIMO_DO_ENVIO = 2048;

/**
 * A escada de qualidade do recorte, percorrida de cima para baixo ate caber no
 * teto de 5 MB. O jeito errado de respeitar um teto de bytes e escolher uma
 * qualidade fixa e torcer: a mesma qualidade produz 40 KB numa parede lisa e
 * 900 KB numa folhagem. E a mesma ideia de `ESCADA_DA_FAIXA` no servidor.
 */
export const ESCADA_DE_QUALIDADE = [0.92, 0.86, 0.78, 0.68, 0.55] as const;

/** O que a pessoa escolheu: o zoom e o centro do enquadramento, em fracao da imagem. */
export interface Enquadramento {
  readonly escala: number;
  readonly centroX: number;
  readonly centroY: number;
}

export const ENQUADRAMENTO_INICIAL: Enquadramento = { escala: ESCALA_MINIMA, centroX: 0.5, centroY: 0.5 };

/** A regiao enquadrada, na MESMA forma de `ImageCrop` no contrato: fracoes de 0 a 1. */
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

/**
 * A regiao que a moldura mostra, em fracoes da imagem ja rotacionada.
 *
 * **A conta NAO e a proporcao crua, e este e o engano que o prototipo pegou na
 * primeira execucao.** A regiao mede `w * largura` por `h * altura`, entao
 * `w / h = alvo / proporcaoDaImagem` -- e nao `proporcaoDaImagem / alvo`.
 * Trocar os dois nao da erro nenhum: devolve `w = 1, h = 1` numa moldura 1:1 e
 * entrega a imagem inteira achatada, que e um recorte plausivel do lugar
 * errado.
 *
 * Regiao que estoura a borda e **presa** dentro da imagem, e nao recusada --
 * a mesma regra que o contrato escreve para `ImageCrop`: a pessoa enquadrou
 * alguma coisa, e o recorte possivel mais proximo e melhor do que uma recusa
 * por um milesimo de arredondamento.
 */
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

/** O tamanho do envio: o do proprio recorte, limitado a {@link LADO_MAXIMO_DO_ENVIO}. NUNCA amplia. */
export function tamanhoDoEnvio(janela: Janela): { largura: number; altura: number } {
  const fator = Math.min(1, LADO_MAXIMO_DO_ENVIO / Math.max(janela.width, janela.height));
  return {
    largura: Math.max(1, Math.round(janela.width * fator)),
    altura: Math.max(1, Math.round(janela.height * fator)),
  };
}

/**
 * O formato de saida do recorte: **o mesmo da entrada**.
 *
 * Nao e preguica: PNG e WebP guardam canal alfa e JPEG nao. Reescrever uma logo
 * PNG transparente como JPEG aqui a entregaria com fundo preto -- o servidor
 * achata alfa em BRANCO (`flatten({ background: 255,255,255 })`), e o navegador
 * nao tem como saber disso. Mantendo o formato, o alfa chega inteiro ao
 * servidor e e ele que continua decidindo, exatamente como antes do recorte
 * existir.
 *
 * PNG grande demais cai em WebP, que e lossy e **mantem** o alfa -- e nunca em
 * JPEG, pela mesma razao.
 */
export function formatosDeSaida(tipo: TipoAceito): readonly TipoAceito[] {
  return tipo === 'image/png' ? ['image/png', 'image/webp'] : [tipo];
}

/** O navegador sabe recortar? Sem isto o envio segue como antes, sem oferecer o ajuste. */
export function podeRecortar(): boolean {
  return (
    typeof globalThis.createImageBitmap === 'function' &&
    typeof globalThis.HTMLCanvasElement === 'function' &&
    typeof globalThis.HTMLCanvasElement.prototype.toBlob === 'function'
  );
}

/**
 * Le o arquivo com a orientacao do EXIF JA APLICADA nos pixeis.
 *
 * Devolve `undefined` onde o navegador nao sabe fazer isso. **Nao ha plano B
 * sem a orientacao**: ler sem ela cortaria uma foto de retrato pelos eixos
 * trocados e entregaria um recorte plausivel da parte errada, sem erro e sem
 * log. Melhor nao oferecer o ajuste.
 */
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

/**
 * Recorta e devolve o arquivo que sobe no lugar do original.
 *
 * `undefined` quando o navegador nao entregou bytes utilizaveis -- e ai quem
 * chama manda o arquivo original, que e o comportamento de antes deste recurso.
 */
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
      // Navegador que nao conhece o formato devolve OUTRO tipo calado (a
      // especificacao manda cair em PNG). Aceitar isso mandaria um PNG
      // dizendo-se WebP; entao o tipo do blob e conferido, e nao o pedido.
      if (!blob || !(TIPOS_ACEITOS as readonly string[]).includes(blob.type)) break;
      if (blob.size <= LIMITE_DE_BYTES) {
        return new File([blob], imagem.nome, { type: blob.type });
      }
      // PNG ignora a qualidade: insistir na escada so repete o mesmo byte.
      if (blob.type === 'image/png') break;
    }
  }
  return undefined;
}

/** Devolve ao navegador o que a leitura tomou. Falhar aqui nao pode parar a tela. */
export function devolverImagem(imagem: ImagemParaRecorte | undefined): void {
  if (imagem && typeof (imagem.fonte as ImageBitmap).close === 'function') {
    try {
      (imagem.fonte as ImageBitmap).close();
    } catch {
      // O bitmap ja nao vale; nada a fazer.
    }
  }
}
