/**
 * A porta de persistência do Mural. **Interna ao módulo**: nenhum outro módulo
 * enxerga publicação.
 *
 * ## A autorização mora na cláusula `WHERE` (ADR-0021)
 *
 * Toda leitura e toda escrita recebe **quem chama**, e quem chama entra no
 * `WHERE`:
 *
 * - `minhas` e `apagar` resolvem por `author_user_id = quem chama`;
 * - `linhaDoTempo` resolve por `EXISTS` sobre `user_connections` com
 *   `state = 'accepted'`, nos dois sentidos do par, somado a
 *   `conta_habilitada` das duas pontas, `NOT bloqueio_entre` e
 *   `NOT publicacao_ocultada_para_quem_denunciou`.
 *
 * Não existe "ler a publicação, conferir num `if`, depois responder". Isso tem
 * duas consequências, e as duas são o desenho:
 *
 * 1. **publicação de quem não tem relação com quem chama é o MESMO `undefined`**
 *    que publicação inexistente e que publicação apagada — e a borda transforma
 *    os três no mesmo `404`, nunca `403`. Distinguir revelaria que a publicação
 *    existe, que é exatamente o oráculo que o perfil e a conexão já recusam;
 * 2. **um caminho novo que chame `linhaDoTempo` por engano devolve lista
 *    vazia**, e não a linha do tempo de outra pessoa.
 *
 * ## Nenhum método devolve um conjunto de pessoas
 *
 * `linhaDoTempo` devolve publicações, e cada uma carrega `handle`,
 * `displayName` e a `thumb` da foto do autor (Emenda 5 do ADR-0010) — o que
 * `ConnectionPerson` já entrega a quem é conexão, mais a foto que a emenda
 * nomeou para esta superfície. **Não existe método que liste as conexões de alguém**, e o conjunto
 * de autores de uma página não é a lista de conexões: ele é o recorte das
 * conexões que publicaram, naquela janela de tempo, e quem não publicou não
 * aparece. É a mesma diferença que faz `pedidosRecebidos` não ser uma lista de
 * conexões.
 *
 * **Isso não é uma brecha aberta de propósito, e vale dizer onde ela para:** se
 * algum dia existir uma leitura cujo propósito seja enumerar com quem a pessoa
 * tem relação, ela não nasce aqui — nasce na mesa do cliente, e o portão
 * `conexao-nao-expoe-lista-nem-identificador.test.ts` é quem a encontra.
 */
import type { Instant, ObjectKey, UserId } from '../../../shared/types/brands.js';
import type { CursoDaLinhaDoTempo } from '../domain/publicacao.js';

/** O estado da imagem na esteira de catálogo. O mesmo de `catalog_images.status`. */
export type EstadoDaFotoDaPublicacao = 'processing' | 'ready' | 'rejected';

/** A foto de uma publicação, como o DONO a vê: com estado. */
export interface FotoDaPublicacaoDoDono {
  readonly uploadId: string | null;
  readonly status: EstadoDaFotoDaPublicacao;
  /** A chave da derivada `card` 1024 × 1024. Nula enquanto `processing`. */
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

/**
 * A foto de uma publicação na linha do tempo. **Menor**: sem estado, sem motivo
 * de recusa e sem envio — ver `PublicationPhoto` no contrato. Foto que não está
 * `ready` não chega aqui, porque o predicado está no `WHERE`.
 */
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
  /**
   * A chave da derivada `thumb` 176 da foto do AUTOR — **Emenda 5 do ADR-0010**.
   *
   * **Nula em três estados, e nenhum é erro**: a pessoa não tem foto, a foto
   * dela não está `ready` (em `processing` ela carrega o EXIF do celular,
   * ADR-0010 item 4), ou a conta está desabilitada. Com nula o cartão desenha a
   * inicial do nome, como a conversa mediada já faz.
   *
   * **Não há estado aqui** — nem `status`, nem `rejection_reason`: motivo de
   * recusa de uma foto é entre o dono e quem modera. Mesma redução da Emenda 3.
   */
  readonly autorThumbKey: ObjectKey | null;
  /**
   * Quantas pessoas curtiram. **Lida das LINHAS**, e nao de coluna
   * denormalizada -- a ausencia dessa coluna e a defesa contra o defeito
   * classico desta superficie, que e a contagem divergir do que existe.
   */
  readonly curtidas: number;
  /** Quantos comentarios VIVOS (`deleted_at IS NULL`). */
  readonly comentarios: number;
  /** Se quem chama curtiu. `EXISTS` sobre a chave primaria de `publication_likes`. */
  readonly curtiEu: boolean;
  /** `true` quando quem chama é o autor. Decide `Apagar` ou `Denunciar` no cartão. */
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

/** O que `publicar` recebe. O `ref` é sorteado por quem chama, não pelo banco. */
export interface NovaPublicacao {
  readonly autor: UserId;
  readonly ref: string;
  readonly corpo: string;
  /** O envio a confirmar, na MESMA transação da escrita. Nulo em texto puro. */
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
  /** `true` quando quem chama escreveu o comentario. Decide se o `Apagar` nasce. */
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
  /** O total de comentarios VIVOS. `items.length` e o tamanho da PAGINA. */
  readonly total: number;
}

export interface PublicacoesRepository {
  /**
   * As publicações do DONO, mais recente primeiro. **Não depende de conexão**:
   * é esta leitura que distingue, na tela, "não tenho conexão" de "ninguém
   * publicou".
   */
  minhas(dono: UserId, recorte: RecorteDaLinhaDoTempo): Promise<PaginaDePublicacoes<PublicacaoDoDono>>;

  /**
   * A linha do tempo de quem chama: as próprias mais as de **conexão aceita**.
   * O predicado inteiro está no `WHERE` — ver o cabeçalho.
   */
  linhaDoTempo(
    quemOlha: UserId,
    recorte: RecorteDaLinhaDoTempo,
  ): Promise<PaginaDePublicacoes<PublicacaoNaLinha>>;

  /**
   * Cria a publicação e **confirma o envio na MESMA transação**, quando há foto.
   *
   * A confirmação junto não é detalhe de implementação: `confirmed_at` deixa de
   * ser nulo no mesmo instante em que a publicação passa a existir, e a linha
   * sai da lista de `varrer-envios-vencidos.ts` nesse instante. Confirmar depois
   * deixaria uma janela em que a intenção está vencida e não confirmada — que é
   * exatamente a condição em que a varredura apagou foto de achado.
   */
  publicar(nova: NovaPublicacao): Promise<PublicacaoDoDono | RecusaDaPublicacao>;

  /**
   * Exclusão LÓGICA, e **só o autor**: `author_user_id = quem chama` e
   * `deleted_at IS NULL` no `WHERE` do `UPDATE`. `false` quando nada foi
   * atingido — publicação de outra conta, endereço inexistente e publicação já
   * apagada são o mesmo `false`, e a borda os transforma no mesmo `404`.
   */
  apagar(dono: UserId, ref: string, agora: Instant): Promise<boolean>;

  /**
   * Curte. **IDEMPOTENTE**: `ON CONFLICT DO NOTHING` sobre a chave primaria
   * `(publication_id, user_id)`. Curtir duas vezes nao conta duas, e a segunda
   * chamada devolve a mesma contagem.
   *
   * `undefined` quando a publicacao nao e visivel a quem chama -- e a borda
   * transforma em `404`, nunca `403`.
   */
  curtir(quemCurte: UserId, ref: string): Promise<ContagemDaReacao | undefined>;

  /** Descurte. Tambem idempotente: descurtir o que nao estava curtido e `200`. */
  descurtir(quemCurte: UserId, ref: string): Promise<ContagemDaReacao | undefined>;

  /** Os comentarios, mais ANTIGO primeiro. `undefined` = publicacao invisivel. */
  comentarios(
    quemOlha: UserId,
    ref: string,
    recorte: RecorteDaLinhaDoTempo,
  ): Promise<PaginaDeComentarios | undefined>;

  /**
   * Comenta. `undefined` quando a publicacao nao e visivel a quem chama.
   *
   * Devolve o comentario **e** a contagem nova, numa transacao: sem a contagem
   * a tela precisaria de uma segunda ida ao servidor para atualizar o numero.
   */
  comentar(
    autor: UserId,
    ref: string,
    corpo: string,
    refDoComentario: string,
    agora: Instant,
  ): Promise<{ readonly comentario: ComentarioVisivel; readonly total: number } | undefined>;

  /**
   * Apaga um comentario, **e so o AUTOR DELE apaga**. O dono da publicacao nao
   * apaga comentario de terceiro -- ver `construtorDoApagarComentario`.
   *
   * `undefined` quando a publicacao nao e visivel; `null` quando ela e visivel
   * mas o comentario nao foi atingido (de outra pessoa, inexistente, ou ja
   * apagado) -- os dois viram `404`, e a distincao existe para a borda nao
   * precisar de uma segunda consulta.
   */
  apagarComentario(
    autorDoComentario: UserId,
    ref: string,
    refDoComentario: string,
    agora: Instant,
  ): Promise<number | null | undefined>;
}
