/**
 * A porta da vitrine de fotos do usuário.
 *
 * Mesma decisão do ADR-0021 aplicada aqui: **todo método recebe o dono como
 * argumento obrigatório, e a autorização é a própria cláusula `WHERE`.** A
 * consulta que devolveria a vitrine de outra conta não existe deste lado da
 * porta — e é essa ausência, e não um `if` numa camada acima, que faz a vitrine
 * ser visível só ao dono.
 *
 * Nenhum método devolve nem aceita URL: o que trafega é `ObjectKey`, e a URL é
 * montada na leitura, a partir do domínio de mídia (§11.1 proibição 9).
 */
import type { DbExecutor } from '../../../shared/db/pool.js';
import type { Instant, ObjectKey, UserId } from '../../../shared/types/brands.js';
import type { StatusDaFoto } from '../../media/ports/media-repository.js';
import type { FotoDaVitrineParaGravar } from '../domain/vitrine-de-fotos.js';

/** Uma foto da vitrine, como a leitura a devolve. */
export interface FotoDaVitrine {
  /**
   * O `upload_id` — `catalog_upload_intents.id` —, e **nunca**
   * `catalog_images.id`, que é identidade interna e não sai em resposta. É o
   * mesmo identificador que as duas galerias da casa usam, e é o que o cliente
   * devolve na escrita declarativa para dizer "esta foto, nesta posição".
   *
   * Nulo depois que o varredor apagou a intenção de envio (`ON DELETE SET
   * NULL`): a foto continua na vitrine, e deixa de poder ser reordenada por
   * ela. Estado raro e previsto, não erro.
   */
  readonly uploadId: string | null;
  readonly position: number;
  readonly status: StatusDaFoto;
  /** A derivada da GRADE (320 px). Nula enquanto o worker não terminou. */
  readonly gradeKey: ObjectKey | null;
  /** A derivada ABERTA (1024 px). Nula enquanto o worker não terminou. */
  readonly abertaKey: ObjectKey | null;
  readonly rejectionReason: string | null;
  readonly altText: string | null;
}

export interface VitrineRepository {
  /** A vitrine do dono, em ordem de posição. Lista vazia é resposta normal. */
  listar(dono: UserId): Promise<readonly FotoDaVitrine[]>;

  /**
   * Substitui a vitrine inteira, numa transação só.
   *
   * **A confirmação do envio vai na MESMA transação da escrita**, e é isso que
   * tira a intenção da lista da varredura de vencidos no instante em que a foto
   * passa a existir. Confirmar numa transação separada reabriria o defeito que
   * apagou foto de achado: a intenção ficaria não confirmada entre as duas
   * escritas, e uma varredura no meio a recolheria junto com o objeto.
   *
   * Recebe `agora` de fora porque o relógio é porta, e não `now()` espalhado.
   */
  substituir(entrada: {
    readonly dono: UserId;
    readonly fotos: readonly FotoDaVitrineParaGravar[];
    readonly agora: Instant;
  }): Promise<readonly FotoDaVitrine[]>;
}

/** O que a escrita precisa saber de um envio antes de confirmá-lo. */
export interface EnvioDaVitrine {
  readonly id: string;
  readonly purpose: string;
  readonly expiresAt: Date;
  readonly confirmedAt: Date | null;
  readonly catalogImageId: string | null;
}

/** As funções soltas sobre um executor, para a escrita compor a transação. */
export interface OperacoesDaVitrine {
  envioDoDono(db: DbExecutor, uploadId: string, dono: UserId): Promise<EnvioDaVitrine | null>;
}
