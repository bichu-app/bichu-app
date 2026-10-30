/** A porta de persistência do Mural. */
import type { Instant, ObjectKey, UserId } from '../../../shared/types/brands.js';
import type { CursoDaLinhaDoTempo } from '../domain/publicacao.js';

/** O estado da imagem na esteira de catálogo. */
export type EstadoDaFotoDaPublicacao = 'processing' | 'ready' | 'rejected';

/** A foto de uma publicação, como o DONO a vê: com estado. */
export interface FotoDaPublicacaoDoDono {
  readonly uploadId: string | null;
  readonly status: EstadoDaFotoDaPublicacao;
  /** A chave da derivada `card` 1024 × 1024. */
  readonly abertaKey: ObjectKey | null;
  readonly rejectionReason: string | null;
  readonly altText: string | null;
}

/** Uma publicação do próprio dono. */
export interface PublicacaoDoDono {
  readonly ref: string;
  readonly corpo: string;
  readonly criadaEm: Date;
  readonly foto: FotoDaPublicacaoDoDono | null;
}

/** A foto de uma publicação na linha do tempo. */
export interface FotoDaPublicacaoNaLinha {
  readonly abertaKey: ObjectKey;
  readonly altText: string | null;
}

/** Uma publicação na linha do tempo. */
export interface PublicacaoNaLinha {
  readonly ref: string;
  readonly corpo: string;
  readonly criadaEm: Date;
  readonly foto: FotoDaPublicacaoNaLinha | null;
  /** O apelido do autor. **Nulo** quando ele não tem apelido: o toque não nasce. */
  readonly handle: string | null;
  readonly displayName: string;
  /** A chave da derivada `thumb` 176 da foto do AUTOR — **Emenda 5 do ADR-0010**. */
  readonly autorThumbKey: ObjectKey | null;
  /**
   * **O SELO DE VALIDADO do autor**: a conta dele tem um canal de contato confirmado
   * (`email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL`), que e a
   * MESMA regua dos quatro `409 contact-channel-unverified`.
   */
  readonly canalVerificado: boolean;
  /** Quantas pessoas curtiram. */
  readonly curtidas: number;
  /** Quantos comentarios VIVOS (`deleted_at IS NULL`). */
  readonly comentarios: number;
  /** Se quem chama curtiu. `EXISTS` sobre a chave primaria de `publication_likes`. */
  readonly curtiEu: boolean;
  /** `true` quando quem chama é o autor. */
  readonly minha: boolean;
}

/** Uma página por cursor. `proximoCursor` nulo é fim da lista. */
export interface PaginaDePublicacoes<T> {
  readonly itens: readonly T[];
  readonly proximoCursor: string | null;
}

/** O recorte de uma leitura paginada. */
export interface RecorteDaLinhaDoTempo {
  readonly limite: number;
  readonly curso: CursoDaLinhaDoTempo | undefined;
}

/** O que `publicar` recebe. */
export interface NovaPublicacao {
  readonly autor: UserId;
  readonly ref: string;
  readonly corpo: string;
  /** O envio a confirmar, na MESMA transação da escrita. */
  readonly uploadId: string | null;
  readonly textoAlternativo: string | null;
  readonly agora: Instant;
}

/** O que a escrita de publicação pode recusar, e o motivo chega legível à borda. */
export type RecusaDaPublicacao = 'envio-nao-encontrado' | 'envio-ja-usado' | 'envio-vencido';

/** Um comentario, como a linha do tempo o entrega. */
export interface ComentarioVisivel {
  readonly ref: string;
  readonly corpo: string;
  readonly criadoEm: Date;
  readonly handle: string | null;
  readonly displayName: string;
  readonly autorThumbKey: ObjectKey | null;
  /**
   * **O SELO DE VALIDADO do autor**: a conta dele tem um canal de contato confirmado
   * (`email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL`), que e a
   * MESMA regua dos quatro `409 contact-channel-unverified`.
   */
  readonly canalVerificado: boolean;
  /** `true` quando quem chama escreveu o comentario. */
  readonly meu: boolean;
}

/** A contagem que passou a valer, lida das LINHAS. */
export interface ContagemDaReacao {
  readonly curtidas: number;
  readonly curtiEu: boolean;
}

/** Uma pagina de comentarios, com o TOTAL da publicacao e nao o da pagina. */
export interface PaginaDeComentarios {
  readonly itens: readonly ComentarioVisivel[];
  readonly proximoCursor: string | null;
  /** O total de comentarios VIVOS. */
  readonly total: number;
}

export interface PublicacoesRepository {
  /** As publicações do DONO, mais recente primeiro. */
  minhas(dono: UserId, recorte: RecorteDaLinhaDoTempo): Promise<PaginaDePublicacoes<PublicacaoDoDono>>;

  /** A linha do tempo de quem chama: as próprias mais as de **conexão aceita**. */
  linhaDoTempo(
    quemOlha: UserId,
    recorte: RecorteDaLinhaDoTempo,
  ): Promise<PaginaDePublicacoes<PublicacaoNaLinha>>;

  /** Cria a publicação e **confirma o envio na MESMA transação**, quando há foto. */
  publicar(nova: NovaPublicacao): Promise<PublicacaoDoDono | RecusaDaPublicacao>;

  /**
   * Exclusão LÓGICA, e **só o autor**: `author_user_id = quem chama` e `deleted_at
   * IS NULL` no `WHERE` do `UPDATE`.
   */
  apagar(dono: UserId, ref: string, agora: Instant): Promise<boolean>;

  /**
   * Curte. **IDEMPOTENTE**: `ON CONFLICT DO NOTHING` sobre a chave primaria
   * `(publication_id, user_id)`.
   */
  curtir(quemCurte: UserId, ref: string): Promise<ContagemDaReacao | undefined>;

  /** Descurte. Tambem idempotente: descurtir o que nao estava curtido e `200`. */
  descurtir(quemCurte: UserId, ref: string): Promise<ContagemDaReacao | undefined>;

  /** Os comentarios, mais ANTIGO primeiro. */
  comentarios(
    quemOlha: UserId,
    ref: string,
    recorte: RecorteDaLinhaDoTempo,
  ): Promise<PaginaDeComentarios | undefined>;

  /** Comenta. `undefined` quando a publicacao nao e visivel a quem chama. */
  comentar(
    autor: UserId,
    ref: string,
    corpo: string,
    refDoComentario: string,
    agora: Instant,
  ): Promise<{ readonly comentario: ComentarioVisivel; readonly total: number } | undefined>;

  /**
   * Apaga um comentario. **DOIS caminhos de autorizacao, os dois na clausula
   * `WHERE`** (ADR-0021): o AUTOR do comentario apaga o proprio, e o DONO da
   * publicacao apaga comentario de terceiro na publicacao dele (decisao do cliente
   * de 20/10/2026).
   */
  apagarComentario(
    chamador: UserId,
    ref: string,
    refDoComentario: string,
    agora: Instant,
  ): Promise<number | null | undefined>;
}
