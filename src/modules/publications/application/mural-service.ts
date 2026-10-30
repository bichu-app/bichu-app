/** O caso de uso do Mural. */
import { problemas } from '../../../shared/http/errors.js';
import type { Clock } from '../../../shared/ports/index.js';
import type { IdGenerator } from '../../../shared/ports/index.js';
import type { DbExecutor } from '../../../shared/db/pool.js';
import type { UserId } from '../../../shared/types/brands.js';
import {
  recusarDimensaoDeclaradaPequena,
  type AutorizacaoDeCapa,
  type PreparadorDeEnvioDeCatalogo,
} from '../../media/ports/imagem-de-catalogo.js';
import {
  conferirComentarioPedido,
  conferirLimite,
  conferirPublicacaoPedida,
  lerCursor,
  type PublicacaoPedida,
} from '../domain/publicacao.js';
import type {
  ComentarioVisivel,
  ContagemDaReacao,
  PaginaDeComentarios,
  PaginaDePublicacoes,
  PublicacaoDoDono,
  PublicacaoNaLinha,
  PublicacoesRepository,
} from '../ports/publicacoes-repository.js';
import { PROPOSITO_DA_PUBLICACAO } from '../adapters/persistence/kysely-publicacoes.js';

/** O corpo de `createPublicationPhotoUploadIntent`, como o contrato o declara. */
export interface CorpoDaIntencaoDaPublicacao {
  readonly content_type: string;
  readonly byte_size: number;
  readonly width?: number;
  readonly height?: number;
}

/** O recorte que a borda extrai da consulta. */
export interface RecortePedido {
  readonly cursor?: unknown;
  readonly limit?: unknown;
}

export interface DependenciasDoMural {
  readonly envios: PreparadorDeEnvioDeCatalogo;
  readonly publicacoes: PublicacoesRepository;
  /** Grava a intenção com autor de `users`. */
  readonly registrarIntencao: (
    db: DbExecutor,
    nova: {
      readonly id: string;
      readonly userId: string;
      readonly objectKey: string;
      readonly declaredType: string;
      readonly maxBytes: number;
      readonly expiresAt: Date;
      readonly purpose: 'user_publication';
    },
  ) => Promise<void>;
  readonly db: DbExecutor;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export class Mural {
  constructor(private readonly deps: DependenciasDoMural) {}

  /** As publicações do DONO. Lista vazia é resposta normal, e não ausência. */
  async minhasPublicacoes(
    dono: UserId,
    pedido: RecortePedido,
  ): Promise<PaginaDePublicacoes<PublicacaoDoDono>> {
    return this.deps.publicacoes.minhas(dono, this.recorte(pedido));
  }

  /** A linha do tempo. O recorte está no `WHERE` do repositório (ADR-0021). */
  async linhaDoTempo(
    quemOlha: UserId,
    pedido: RecortePedido,
  ): Promise<PaginaDePublicacoes<PublicacaoNaLinha>> {
    return this.deps.publicacoes.linhaDoTempo(quemOlha, this.recorte(pedido));
  }

  async autorizarEnvio(
    dono: UserId,
    corpo: CorpoDaIntencaoDaPublicacao,
  ): Promise<AutorizacaoDeCapa> {
    recusarDimensaoDeclaradaPequena(PROPOSITO_DA_PUBLICACAO, corpo.width, corpo.height);

    const envio = await this.deps.envios.preparar(
      corpo.content_type,
      corpo.byte_size,
      PROPOSITO_DA_PUBLICACAO,
    );
    await this.deps.registrarIntencao(this.deps.db, {
      id: envio.uploadId,
      userId: dono,
      objectKey: envio.chave,
      declaredType: envio.contentType,
      maxBytes: envio.maxBytes,
      expiresAt: envio.autorizacao.expiraEm,
      purpose: 'user_publication',
    });
    return { uploadId: envio.uploadId, autorizacao: envio.autorizacao };
  }

  /**
   * Publica. A conferência vem ANTES da transação: abrir transação para descobrir
   * que o corpo tem 300 caracteres é segurar conexão por nada.
   */
  async publicar(autor: UserId, pedida: PublicacaoPedida): Promise<PublicacaoDoDono> {
    const conferida = conferirPublicacaoPedida(pedida);
    if ('recusas' in conferida) throw problemas.validacao([...conferida.recusas]);

    const desfecho = await this.deps.publicacoes.publicar({
      autor,
      ref: Buffer.from(this.deps.ids.random128()).toString('base64url'),
      corpo: conferida.ok.corpo,
      uploadId: conferida.ok.uploadId,
      textoAlternativo: conferida.ok.textoAlternativo,
      agora: this.deps.clock.now(),
    });

    if (typeof desfecho !== 'string') return desfecho;

    switch (desfecho) {
      case 'envio-nao-encontrado':
        throw problemas.naoEncontrado();
      case 'envio-ja-usado':
        throw problemas.validacao([
          { field: 'upload_id', code: 'conflict', message: 'Essa foto já foi usada.' },
        ]);
      case 'envio-vencido':
        throw problemas.validacao([
          { field: 'upload_id', code: 'expired', message: 'Esse envio venceu. Envie a foto de novo.' },
        ]);
    }
  }

  /** Apaga a própria publicação. */
  async apagar(dono: UserId, ref: string): Promise<void> {
    const apagou = await this.deps.publicacoes.apagar(dono, ref, this.deps.clock.now());
    if (!apagou) throw problemas.naoEncontrado();
  }

  /** Curte. **IDEMPOTENTE** -- ver a porta e a chave primaria de `publication_likes`. */
  async curtir(quemCurte: UserId, ref: string): Promise<ContagemDaReacao> {
    const contagem = await this.deps.publicacoes.curtir(quemCurte, ref);
    if (contagem === undefined) throw problemas.naoEncontrado();
    return contagem;
  }

  async descurtir(quemCurte: UserId, ref: string): Promise<ContagemDaReacao> {
    const contagem = await this.deps.publicacoes.descurtir(quemCurte, ref);
    if (contagem === undefined) throw problemas.naoEncontrado();
    return contagem;
  }

  /**
   * Os comentarios. **Publicacao invisivel e `404`, e nao lista vazia** -- uma lista
   * vazia afirmaria que a publicacao existe e nao tem comentario.
   */
  async comentarios(
    quemOlha: UserId,
    ref: string,
    pedido: RecortePedido,
  ): Promise<PaginaDeComentarios> {
    const pagina = await this.deps.publicacoes.comentarios(
      quemOlha,
      ref,
      this.recorte(pedido),
    );
    if (pagina === undefined) throw problemas.naoEncontrado();
    return pagina;
  }

  /** Comenta. A conferencia de forma vem ANTES da transacao, como em `publicar`. */
  async comentar(
    autor: UserId,
    ref: string,
    corpo: unknown,
  ): Promise<{ readonly comentario: ComentarioVisivel; readonly total: number }> {
    const conferido = conferirComentarioPedido(corpo);
    if ('recusas' in conferido) throw problemas.validacao([...conferido.recusas]);

    const desfecho = await this.deps.publicacoes.comentar(
      autor,
      ref,
      conferido.ok,
      Buffer.from(this.deps.ids.random128()).toString('base64url'),
      this.deps.clock.now(),
    );
    if (desfecho === undefined) throw problemas.naoEncontrado();
    return desfecho;
  }

  /**
   * Apaga um comentario. **Dois caminhos**: o autor do comentario, e o dono da
   * publicacao (decisao do cliente de 20/10/2026) -- os dois resolvidos na clausula
   * `WHERE`, ver `construtorDoApagarComentario`.
   */
  async apagarComentario(
    chamador: UserId,
    ref: string,
    refDoComentario: string,
  ): Promise<number> {
    const total = await this.deps.publicacoes.apagarComentario(
      chamador,
      ref,
      refDoComentario,
      this.deps.clock.now(),
    );
    if (total === undefined || total === null) throw problemas.naoEncontrado();
    return total;
  }

  /** O recorte pedido, conferido. */
  private recorte(pedido: RecortePedido): { readonly limite: number; readonly curso: ReturnType<typeof lerCursor> } {
    const limite = conferirLimite(pedido.limit);
    if ('recusa' in limite) throw problemas.validacao([limite.recusa]);

    if (pedido.cursor === undefined || pedido.cursor === null || pedido.cursor === '') {
      return { limite: limite.limite, curso: undefined };
    }
    const curso = typeof pedido.cursor === 'string' ? lerCursor(pedido.cursor) : undefined;
    if (curso === undefined) {
      throw problemas.validacao([
        { field: 'cursor', code: 'invalid', message: 'Recomece a lista.' },
      ]);
    }
    return { limite: limite.limite, curso };
  }
}
