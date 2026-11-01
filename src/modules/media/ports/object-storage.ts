import type { AbsoluteUrl, ObjectKey } from '../../../shared/types/brands.js';

/** As duas classes de mídia, fisicamente separadas e nunca no mesmo lugar. */
export type Classe =
  /** Originais e derivadas privadas. */
  | 'privado'
  /** Só as derivadas que a rota pública mostra, servidas pelo domínio de mídia. */
  | 'publico';

/** A forma da requisição de envio. */
export type MetodoDeEnvio = 'POST' | 'PUT';

export interface AutorizacaoDeEnvio {
  readonly metodo: MetodoDeEnvio;
  readonly url: AbsoluteUrl;
  /** Campos do formulário assinado. */
  readonly campos?: Readonly<Record<string, string>>;
  /** Cabeçalhos assinados, a enviar sem alterar. */
  readonly cabecalhos?: Readonly<Record<string, string>>;
  readonly expiraEm: Date;
  readonly maxBytes: number;
}

export interface PedidoDeEnvio {
  readonly classe: Classe;
  readonly chave: ObjectKey;
  /**
   * EXIGÊNCIA: um de `TIPOS_ACEITOS` (`image/jpeg`, `image/png`, `image/heic` ou
   * `image/webp`).
   */
  readonly contentType: string;
  readonly maxBytes: number;
  readonly validadeEmSegundos: number;
}

export interface Cabecalho {
  readonly contentLength: number;
  readonly contentType: string | undefined;
  readonly etag: string | undefined;
}

/** As operações que falam com a rede. */
export type OperacaoDeRede = 'HEAD' | 'GET' | 'PUT' | 'DELETE';

/** O armazenamento não respondeu dentro do prazo. */
export class PrazoDoArmazenamentoEsgotadoError extends Error {
  readonly operacao: OperacaoDeRede;
  readonly prazoMs: number;

  constructor(operacao: OperacaoDeRede, prazoMs: number) {
    super(`O armazenamento de objeto não respondeu ao ${operacao} em ${String(prazoMs)} ms.`);
    this.name = 'PrazoDoArmazenamentoEsgotadoError';
    this.operacao = operacao;
    this.prazoMs = prazoMs;
  }
}

export interface ObjectStorage {
  /** A autorização assinada que o CLIENTE usa para enviar direto. */
  createUploadIntent(pedido: PedidoDeEnvio): Promise<AutorizacaoDeEnvio>;

  /** URL assinada de leitura, curta. */
  getSignedReadUrl(classe: Classe, chave: ObjectKey, validadeEmSegundos: number): Promise<AbsoluteUrl>;

  /** Confere que o objeto chegou, e com que tamanho. */
  head(classe: Classe, chave: ObjectKey): Promise<Cabecalho | null>;

  /** Só o worker. A rota HTTP não lê bytes de foto. */
  get(classe: Classe, chave: ObjectKey): Promise<Buffer>;

  /** Só o worker, para gravar as derivadas. */
  put(classe: Classe, chave: ObjectKey, bytes: Buffer, contentType: string): Promise<void>;

  delete(classe: Classe, chave: ObjectKey): Promise<void>;
}
