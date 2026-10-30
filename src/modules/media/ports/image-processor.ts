export type FormatoReal = 'jpeg' | 'png' | 'webp' | 'heic';

export interface DimensoesDaImagem {
  readonly formato: FormatoReal;
  readonly largura: number;
  readonly altura: number;
  readonly megapixels: number;
}

export type MotivoDeRecusa =
  /** Os bytes não são nenhum dos quatro formatos aceitos. */
  | 'formato_nao_aceito'
  /** Acima de 50 megapixels DECODIFICADOS (critério 18). */
  | 'imagem_grande_demais'
  /** O cabeçalho não pôde ser lido: arquivo truncado ou corrompido. */
  | 'imagem_ilegivel'
  /** WebP (ou HEIF) com mais de um quadro: animação. */
  | 'imagem_animada'
  /** O cabeçalho foi lido, mas o DECODIFICADOR não abre os pixels. */
  | 'formato_nao_decodificavel';

/** O resultado de `derivar`, e as DUAS exigências que o adaptador precisa cumprir. */
export interface PedidoDeDerivada {
  readonly largura: number;
  /** Presente = CORTA nesta proporção. */
  readonly altura?: number;
  /** A escada de qualidade, do melhor degrau para o pior. */
  readonly escada: readonly number[];
  /** O teto de bytes. O adaptador desce a escada até caber. */
  readonly tetoDeBytes: number;
  /** A região que a PESSOA enquadrou, quando ela enquadrou alguma. */
  readonly recorte?: RegiaoDoRecorte;
}

/** A região escolhida, em FRAÇÕES de 0 a 1 do original **já rotacionado**. */
export interface RegiaoDoRecorte {
  /** Borda esquerda, 0 a 1. */
  readonly x: number;
  /** Borda de cima, 0 a 1. */
  readonly y: number;
  /** Largura, maior que 0 e até 1. */
  readonly w: number;
  /** Altura, maior que 0 e até 1. */
  readonly h: number;
}

export interface Derivada {
  readonly bytes: Buffer;
  /** EXIGÊNCIA: um de `TIPOS_DE_DERIVADA` (`image/webp` ou `image/jpeg`). */
  readonly contentType: string;
  /**
   * EXIGÊNCIA: uma de `EXTENSOES_DE_DERIVADA` (`webp`, `jpg` ou `jpeg`), sem ponto e
   * sem barra.
   */
  readonly extensao: string;
  readonly largura: number;
  readonly altura: number;
  /** O degrau da escada em que ela parou. */
  readonly qualidade: number;
  /** `true` quando NEM o último degrau da escada caber no teto. */
  readonly acimaDoTeto: boolean;
}

export interface ImageProcessor {
  /** Lê o cabeçalho **sem decodificar**. */
  inspecionar(bytes: Buffer): Promise<DimensoesDaImagem | MotivoDeRecusa>;

  /**
   * Reescreve a imagem no tamanho pedido, **sem metadado nenhum**, cortando na
   * proporção quando o pedido traz `altura`.
   */
  derivar(bytes: Buffer, pedido: PedidoDeDerivada): Promise<Derivada | MotivoDeRecusa>;
}
