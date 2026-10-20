/**
 * O caso de uso do Mural.
 *
 * Fino de propósito, como o da vitrine: a regra de forma está no domínio
 * (`conferirPublicacaoPedida`), a autorização está na cláusula `WHERE` do
 * repositório, e a geometria das derivadas está em `media/domain/derivadas.ts`.
 * O que sobra aqui é **a ordem dos atos** — conferir antes de abrir transação, e
 * autorizar o envio antes de assinar.
 *
 * ## A autorização de envio é pedida FORA de transação
 *
 * Assinar é chamada de rede a um serviço externo. Segurar conexão do banco
 * esperando por ela é o que esgota o pool num pico, e é o mesmo motivo que
 * `vitrine-de-fotos-service.ts` e `capa-de-encontro-da-comunidade.ts` registram.
 *
 * ## O teto de 5 MB é cobrado na POLÍTICA ASSINADA, e não depois
 *
 * O backend nunca recebe os bytes (ADR-0007): o app envia direto ao
 * armazenamento. Então o teto tem de estar na política — recusar depois seria
 * recusar o que já foi gravado e pago.
 *
 * ## O `ref` é sorteado AQUI, e não pelo banco
 *
 * 128 bits de `ids.random128()` em base64url, 22 símbolos — a mesma forma de
 * `users.public_ref` e a que `publication_reports.publication_ref` já cobrava
 * antes de a tabela existir. Sorteado pela aplicação e não por `DEFAULT` do
 * banco pela mesma razão de `users.public_ref`: a fonte de aleatoriedade é a do
 * processo, auditável, e não a do servidor de banco.
 *
 * **Colisão não é tratada, e a ausência é conta e não descuido.** 128 bits
 * sorteados têm probabilidade de colisão desprezível, e se ela acontecer o
 * `UNIQUE` do banco recusa com erro — alto e visível — em vez de duas
 * publicações compartilharem endereço. Um laço de retentativa aqui seria código
 * que nunca roda escondendo o único sinal de que a fonte de aleatoriedade
 * quebrou.
 */
import { problemas } from '../../../shared/http/errors.js';
import type { Clock } from '../../../shared/ports/index.js';
import type { IdGenerator } from '../../../shared/ports/index.js';
import type { DbExecutor } from '../../../shared/db/pool.js';
import type { UserId } from '../../../shared/types/brands.js';
import {
  DIMENSAO_MINIMA,
  dimensaoDeclaradaAbaixoDaMinima,
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
  /**
   * Grava a intenção com autor de `users`. Uma instrução: não abre transação.
   *
   * **`purpose` entra na assinatura com o literal fechado**, e isso não é
   * decoração: em 18/10/2026 `api.ts` ligou a vitrine ao registrador da capa do
   * encontro, as duas assinaturas eram idênticas, a troca COMPILOU, e nenhuma
   * foto de vitrine podia ser salva. Com o literal no tipo, a troca não compila.
   */
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
    // A dimensão declarada ANTES de assinar: recusar depois deixaria uma
    // política assinada valendo dez minutos para um arquivo já sabido ruim.
    const abaixo = dimensaoDeclaradaAbaixoDaMinima(
      PROPOSITO_DA_PUBLICACAO,
      corpo.width,
      corpo.height,
    );
    if (abaixo.length > 0) {
      const minima = DIMENSAO_MINIMA[PROPOSITO_DA_PUBLICACAO];
      throw problemas.imagemPequenaDemais(
        minima,
        abaixo.map((field) => ({
          field,
          code: 'minimum',
          message: `Mínimo de ${String(field === 'width' ? minima.largura : minima.altura)} pixels.`,
        })),
      );
    }

    // **NÃO HÁ TETO DE PUBLICAÇÕES A CONFERIR AQUI**, ao contrário da vitrine.
    // A vitrine confere as nove antes de assinar porque assinar a décima
    // entregaria autorização que a vitrine nunca aceitaria; aqui cada envio vira
    // uma publicação nova, e não há número que se esgote. O que limita é o teto
    // de chamadas da rota (20/h), que é onde ele pertence.

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
      // O MESMO valor que assinou, e não um segundo literal: a divergência
      // entre o propósito assinado e o propósito gravado é exatamente o defeito
      // de 18/10/2026 (`201` aqui, `404` na confirmação).
      purpose: 'user_publication',
    });
    return { uploadId: envio.uploadId, autorizacao: envio.autorizacao };
  }

  /**
   * Publica. A conferência vem ANTES da transação: abrir transação para
   * descobrir que o corpo tem 300 caracteres é segurar conexão por nada.
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
      // Envio de outra conta, de outro propósito ou inexistente: `404`, e nunca
      // `403`. Distinguir os dois revelaria que o envio existe (ADR-0021).
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

  /**
   * Apaga a própria publicação. `false` do repositório é `404`: publicação de
   * outra conta, endereço inexistente e publicação já apagada são o mesmo
   * desfecho, de propósito.
   */
  async apagar(dono: UserId, ref: string): Promise<void> {
    const apagou = await this.deps.publicacoes.apagar(dono, ref, this.deps.clock.now());
    if (!apagou) throw problemas.naoEncontrado();
  }

  /**
   * Curte. **IDEMPOTENTE** -- ver a porta e a chave primaria de
   * `publication_likes`. `undefined` do repositorio e `404`, nunca `403`.
   */
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
   * Os comentarios. **Publicacao invisivel e `404`, e nao lista vazia** -- uma
   * lista vazia afirmaria que a publicacao existe e nao tem comentario.
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

  /**
   * Comenta. A conferencia de forma vem ANTES da transacao, como em `publicar`.
   *
   * **O `ref` do comentario e sorteado AQUI**, pela mesma razao do da
   * publicacao: 128 bits de `ids.random128()` em base64url, 22 simbolos, e a
   * fonte de aleatoriedade e a do processo. Colisao nao e tratada -- o `UNIQUE`
   * do banco recusa alto e visivel, e um laco de retentativa seria codigo que
   * nunca roda escondendo o unico sinal de que a fonte quebrou.
   */
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
   * publicacao (decisao do cliente de 20/10/2026) -- os dois resolvidos na
   * clausula `WHERE`, ver `construtorDoApagarComentario`.
   *
   * `undefined` (publicacao invisivel) e `null` (comentario nao atingido) sao o
   * MESMO `404`: distinguir revelaria que o comentario existe.
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

  /**
   * O recorte pedido, conferido. Cursor ilegível e limite fora da faixa são
   * `400` com campo — e não aparo em silêncio, que faria o cliente achar que
   * recebeu tudo.
   */
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
