/**
 * Porta do armazenamento de objeto (ADR-0007).
 *
 * O armazenamento é tratado como **interface, não como produto**. Hoje é MinIO
 * em container; amanhã pode ser S3, GCS em modo de interoperabilidade, R2 ou
 * Spaces, e a troca é endpoint, credencial, região e DNS de mídia — nenhuma
 * linha de código.
 *
 * Por isso três coisas são proibidas fora de `adapters/external/`, e a lista é
 * normativa (ADR-0007, seção "o que é proibido usar hoje"):
 *
 * 1. Importar SDK de provedor. Ele vive no adaptador, atrás desta porta.
 * 2. Escrever endpoint, região ou nome de bucket em código. Tudo vem de ambiente.
 * 3. Depender de notificação de bucket. O processamento é disparado pela
 *    confirmação do cliente, e não por evento do armazenamento: notificação
 *    existe em todo provedor com nome, formato e garantia diferentes, e
 *    amarrá-la ao caminho crítico compraria acoplamento em troca de nada.
 *
 * **O backend nunca recebe os bytes da foto.** O cliente pede a autorização
 * assinada e envia direto. `put` e `get` existem aqui para o WORKER, que precisa
 * ler o original para validar e gravar as derivadas — não para a rota HTTP.
 */
import type { AbsoluteUrl, ObjectKey } from '../../../shared/types/brands.js';

/** As duas classes de mídia, fisicamente separadas e nunca no mesmo lugar. */
export type Classe =
  /** Originais e derivadas privadas. Só o dono, e só por URL assinada. */
  | 'privado'
  /** Só as derivadas que a rota pública mostra, servidas pelo domínio de mídia. */
  | 'publico';

/**
 * A forma da requisição de envio.
 *
 * **O cliente lê este campo em vez de presumir a forma**, e é isso que impede
 * que a troca de provedor vire mudança de aplicativo publicado: nem todo
 * compatível com S3 aceita política de POST.
 */
export type MetodoDeEnvio = 'POST' | 'PUT';

export interface AutorizacaoDeEnvio {
  readonly metodo: MetodoDeEnvio;
  readonly url: AbsoluteUrl;
  /** Campos do formulário assinado. Presente quando o método é `POST`. */
  readonly campos?: Readonly<Record<string, string>>;
  /** Cabeçalhos assinados, a enviar sem alterar. Presente quando é `PUT`. */
  readonly cabecalhos?: Readonly<Record<string, string>>;
  readonly expiraEm: Date;
  readonly maxBytes: number;
}

export interface PedidoDeEnvio {
  readonly classe: Classe;
  readonly chave: ObjectKey;
  readonly contentType: string;
  readonly maxBytes: number;
  readonly validadeEmSegundos: number;
}

export interface Cabecalho {
  readonly contentLength: number;
  readonly contentType: string | undefined;
  readonly etag: string | undefined;
}

export interface ObjectStorage {
  /** A autorização assinada que o CLIENTE usa para enviar direto. */
  createUploadIntent(pedido: PedidoDeEnvio): Promise<AutorizacaoDeEnvio>;

  /**
   * URL assinada de leitura, curta. Usada para o original, que é privado.
   *
   * A derivada pública **não passa por aqui**: a chave dela carrega 128 bits
   * aleatórios, é servida pelo domínio de mídia com cache longo, e assinar
   * inviabilizaria o cache sem aumentar a proteção.
   */
  getSignedReadUrl(classe: Classe, chave: ObjectKey, validadeEmSegundos: number): Promise<AbsoluteUrl>;

  /** Confere que o objeto chegou, e com que tamanho. Nunca confia no declarado. */
  head(classe: Classe, chave: ObjectKey): Promise<Cabecalho | null>;

  /** Só o worker. A rota HTTP não lê bytes de foto. */
  get(classe: Classe, chave: ObjectKey): Promise<Buffer>;

  /** Só o worker, para gravar as derivadas. */
  put(classe: Classe, chave: ObjectKey, bytes: Buffer, contentType: string): Promise<void>;

  delete(classe: Classe, chave: ObjectKey): Promise<void>;
}
