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
  | 'imagem_ilegivel'
  /**
   * WebP (ou HEIF) com mais de um quadro: animação.
   *
   * RECUSA EXPLÍCITA, e esta é a escolha (BICHUS-87 não a tinha previsto). O
   * número mágico de um WebP animado é o mesmo de um parado, então ele passava
   * na conferência de bytes; e o `sharp`, sem `animated: true`, pega **só o
   * primeiro quadro, em silêncio**. A pessoa enviava um WebP animado, via uma
   * foto parada aparecer e não tinha como saber por quê.
   *
   * Recusar em vez de aceitar documentando que congela: GIF já é recusado pelo
   * número mágico, e aceitar animação num formato e não no outro seria a mesma
   * regra com duas respostas. Congelar em silêncio é o que não pode continuar.
   */
  | 'imagem_animada'
  /**
   * O cabeçalho foi lido, mas o DECODIFICADOR não abre os pixels.
   *
   * É o caso do HEIC nesta instalação: o `sharp` 0.35.4 / libvips 8.18.6 lê o
   * cabeçalho do HEIC (`metadata()` devolve formato e dimensões) e falha na
   * decodificação com "Support for this compression format is not implemented"
   * — o libheif do pacote pré-compilado não traz o decodificador HEVC.
   *
   * Sem este motivo, esse arquivo virava EXCEÇÃO no worker, a fila entendia
   * "culpa nossa", tentava cinco vezes e a foto ficava `processing` até a
   * varredura de órfãos. Cabeçalho que abre e pixel que não abre é **culpa do
   * arquivo**, e recusa final é o certo: tentar de novo não muda a resposta.
   */
  | 'formato_nao_decodificavel';

/**
 * O resultado de `derivar`, e as DUAS exigências que o adaptador precisa cumprir.
 *
 * Elas estão escritas aqui porque quem implementar a próxima versão desta porta
 * não tem como adivinhá-las lendo o tipo: os dois campos são `string`, e os dois
 * saem daqui direto para um lugar onde `string` qualquer faz estrago. Hoje o
 * único adaptador devolve literais seguros — e é só isso que segura (BICHUS-133).
 */
/**
 * A geometria e a escada de uma derivada, como o caso de uso as pede.
 *
 * Os números vêm de `domain/derivadas.ts`, que é o ponto único — o adaptador
 * não escolhe largura, proporção, qualidade nem teto, e é isso que mantém a
 * decisão do cliente num lugar só.
 */
export interface PedidoDeDerivada {
  readonly largura: number;
  /** Presente = CORTA nesta proporção. Ausente = reduz sem cortar. */
  readonly altura?: number;
  /** A escada de qualidade, do melhor degrau para o pior. */
  readonly escada: readonly number[];
  /** O teto de bytes. O adaptador desce a escada até caber. */
  readonly tetoDeBytes: number;
  /**
   * A região que a PESSOA enquadrou, quando ela enquadrou alguma.
   *
   * Presente: o adaptador recorta exatamente esta região e reduz para a
   * geometria pedida, **sem heurística nenhuma**. Ausente: o corte continua
   * sendo o automático (`sharp.strategy.attention`), que é o comportamento de
   * sempre — nada do que já está gravado muda de resultado.
   *
   * Ignorada quando [altura] está ausente: sem proporção pedida não há corte,
   * e recortar assim mesmo mudaria em silêncio a imagem de produto da Loja,
   * que é a única derivada sem corte.
   */
  readonly recorte?: RegiaoDoRecorte;
}

/**
 * A região escolhida, em FRAÇÕES de 0 a 1 do original **já rotacionado**.
 *
 * ## As frações, e por que não pixels
 *
 * Quem escolhe a região é uma pessoa arrastando uma moldura sobre uma PRÉVIA
 * reduzida — 400 dp de tela sobre uma foto de 4000 px. Mandar pixels obrigaria
 * o cliente a converter, e a conversão é onde nasce o erro de um que ninguém
 * percebe: a derivada sai um pixel torta e nada acusa. Em fração, o cliente
 * manda o que mediu e quem converte é quem tem os bytes.
 *
 * ## JÁ ROTACIONADO, e esta é a armadilha
 *
 * O servidor chama `.rotate()` **antes** de cortar, para aplicar o
 * `Orientation` do EXIF nos pixels — sem isso uma foto tirada em pé seria
 * cortada deitada. Então a região precisa ser medida no **mesmo** sistema de
 * coordenadas: o da imagem depois da rotação, que é a que a pessoa viu na
 * tela.
 *
 * Um cliente que medisse sobre a imagem ANTES da rotação mandaria uma região
 * com os eixos trocados, e o resultado seria um recorte plausível da parte
 * errada da foto — **sem erro, sem log, sem nada**. É o defeito mais provável
 * de toda esta mudança, e é por isso que ele tem caso próprio em
 * `sharp-image-processor.test.ts`, com uma foto em retrato e EXIF de
 * rotação de verdade.
 */
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
  /**
   * EXIGÊNCIA: um de `TIPOS_DE_DERIVADA` (`image/webp` ou `image/jpeg`).
   *
   * Ele vira o `Content-Type` do PUT sem passar por mais nada, e o
   * armazenamento devolve depois o que recebeu. Um adaptador que devolvesse
   * `text/html` faria o domínio de mídia servir HTML executável — e esse
   * domínio é separado da origem do app justamente para conter XSS.
   *
   * A gravação recusa o que estiver fora da lista, por IGUALDADE e nunca por
   * prefixo: `image/` aceitaria `image/svg+xml`, que é documento com script.
   */
  readonly contentType: string;
  /**
   * EXIGÊNCIA: uma de `EXTENSOES_DE_DERIVADA` (`webp`, `jpg` ou `jpeg`), sem
   * ponto e sem barra.
   *
   * Ela é INTERPOLADA NO CAMINHO da chave (`{variante}/{nome}.{extensao}`).
   * Extensão com barra ou `..` escapa do prefixo da variante e pode atravessar
   * do bucket privado para o público; como a assinatura V4 é calculada depois
   * da chave existir, a gravação sairia assinada e válida para o lugar errado.
   *
   * `chaveDaDerivada` RECUSA o que estiver fora da lista, e não saneia: uma
   * extensão com travessia não é formatação ruim, é tentativa.
   */
  readonly extensao: string;
  readonly largura: number;
  readonly altura: number;
  /** O degrau da escada em que ela parou. Vai para o log, e é o que se audita. */
  readonly qualidade: number;
  /**
   * `true` quando NEM o último degrau da escada caber no teto.
   *
   * A derivada sai de qualquer forma, no último degrau, e quem chama registra.
   * A alternativa seria continuar borrando até caber, e aí ninguém descobre que
   * o teto não é alcançável naquela proporção — o número real é mais útil que
   * uma imagem feia entregue como se fosse o pedido.
   */
  readonly acimaDoTeto: boolean;
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
   * Reescreve a imagem no tamanho pedido, **sem metadado nenhum**, cortando na
   * proporção quando o pedido traz `altura`.
   *
   * Devolve `MotivoDeRecusa` em vez de lançar quando o decodificador não abre
   * os pixels: é culpa do arquivo, e lançar fazia a fila tentar cinco vezes.
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
  derivar(bytes: Buffer, pedido: PedidoDeDerivada): Promise<Derivada | MotivoDeRecusa>;
}
