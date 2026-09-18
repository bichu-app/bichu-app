/**
 * Porta do processamento de imagem.
 *
 * A biblioteca (`sharp`, e por baixo `libvips`) vive **só** em
 * `adapters/external/`, e a regra de arquitetura a lista entre os pacotes
 * proibidos em `domain/` e `application/`. Não é preferência de estilo: o
 * decodificador de imagem é a maior superfície de ataque do produto — ele lê
 * bytes hostis por definição — e mantê-lo atrás de uma porta é o que permite
 * trocá-lo sem tocar na lógica, e o que impede alguém de chamá-lo do meio de um
 * manipulador HTTP.
 *
 * As duas operações são separadas de propósito: `inspecionar` lê o **cabeçalho**
 * e nunca decodifica a imagem inteira. É ela que recusa 50 megapixels antes de
 * alocar memória para eles, e por isso ela não pode ser um detalhe interno de
 * `derivar`.
 */

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
  | 'imagem_ilegivel';

export interface Derivada {
  readonly bytes: Buffer;
  readonly contentType: string;
  readonly extensao: string;
  readonly largura: number;
  readonly altura: number;
}

export interface ImageProcessor {
  /**
   * Lê o cabeçalho **sem decodificar**. Devolve o motivo quando recusa.
   *
   * A recusa aqui é **final**: o estado da foto vira `rejected` e não volta para
   * a fila (critério 19). Retentativa infinita de um arquivo que nunca vai ser
   * aceito é um laço que consome CPU para sempre e nunca avisa ninguém.
   */
  inspecionar(bytes: Buffer): Promise<DimensoesDaImagem | MotivoDeRecusa>;

  /**
   * Reescreve a imagem no tamanho pedido, **sem metadado nenhum**.
   *
   * "Sem metadado nenhum" e não "sem os campos conhecidos" — é o que o critério
   * 14 exige, e a diferença é a que importa: uma lista de campos a remover
   * esquece o campo que ainda não existia quando ela foi escrita. Reescrever a
   * imagem do zero e não copiar nada é a única forma que não envelhece.
   *
   * A reescrita também neutraliza a maior parte dos arquivos poliglota, porque o
   * que sai é um arquivo novo gerado a partir dos pixels, e não o original com
   * pedaços removidos.
   */
  derivar(bytes: Buffer, larguraMaxima: number): Promise<Derivada>;
}
