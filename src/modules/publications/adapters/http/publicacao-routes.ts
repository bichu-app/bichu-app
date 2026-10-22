/**
 * As rotas do **Mural**: a publicação do usuário e a linha do tempo.
 *
 * São cinco, e **as quatro de `/me/publications` são do dono**. A quinta é a
 * linha do tempo, e ela é a ÚNICA leitura deste contrato que mostra publicação
 * de outra pessoa.
 *
 * ## Por que não há `GET /publications/{ref}`, e a ausência é a defesa
 *
 * Uma leitura avulsa por endereço existiria exatamente para ser chamada com um
 * endereço que quem chama recebeu de outro lugar — de uma denúncia, de um
 * compartilhamento, de uma varredura. Ela teria de repetir o recorte inteiro da
 * linha do tempo num segundo lugar, e segundo lugar é onde uma correção falta.
 * **A rota que a mostraria não existe, em vez de existir com um `if`:** um `if`
 * alguém esquece de repetir, uma rota ausente ninguém chama por engano. Mesma
 * decisão que `showcase-routes.ts` registrou para a vitrine de terceiro.
 *
 * ## Por que a etiqueta é `publications`
 *
 * Porque `conexao-nao-expoe-lista-nem-identificador.test.ts` cobra que
 * `connections` tenha **exatamente cinco** operações, e `people` é fechada em
 * uma. Pôr qualquer destas lá faria um portão certo reprovar o desenho certo, e
 * a saída é etiqueta própria — não afrouxar o número. É a mesma razão pela qual
 * `people` nasceu em 19/10.
 *
 * ## O que este arquivo NÃO decide
 *
 * **Quem pode ver o quê.** Isso é a cláusula `WHERE` de
 * `kysely-publicacoes.ts` (ADR-0021). Não há um `if` nesta borda que escolha
 * entre `404` e `403`, e não há caminho que produza `403`: publicação de quem
 * não tem relação com quem chama, endereço inexistente e publicação apagada são
 * o **mesmo 404**.
 *
 * **O que é moderado.** Não há conferência de conteúdo aqui, por decisão do
 * cliente (*"deixe o texto livre na timeline"*). O ponto de acesso da moderação
 * é `reportPublication`, que é de `safety` e já existia — esta frente a LIGOU à
 * publicação em vez de criar uma segunda.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import type { AbsoluteUrl, UserId } from '../../../../shared/types/brands.js';
import type {
  CorpoDaIntencaoDaPublicacao,
  Mural,
  RecortePedido,
} from '../../application/mural-service.js';
import type {
  ComentarioVisivel,
  PaginaDePublicacoes,
  PublicacaoDoDono,
  PublicacaoNaLinha,
} from '../../ports/publicacoes-repository.js';
import type { PublicacaoPedida } from '../../domain/publicacao.js';

export const rotaDasMinhasPublicacoes = defineRoute({
  operationId: 'listMyPublications',
  method: 'get',
  path: '/me/publications',
  effects: [],
});

export const rotaDeLinhaDoTempo = defineRoute({
  operationId: 'getMyTimeline',
  method: 'get',
  path: '/timeline',
  effects: [],
});

export const rotaDePublicar = defineRoute({
  operationId: 'createPublication',
  method: 'post',
  path: '/me/publications',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 30, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeApagarPublicacao = defineRoute({
  operationId: 'deleteMyPublication',
  method: 'delete',
  path: '/me/publications/:publicationRef',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

/**
 * Assinar é barato, mas cada assinatura é uma autorização de escrita que **não
 * se desfaz dentro da validade**. Mesmo teto de 20/h da foto de pet, da capa do
 * encontro e da vitrine, pelo mesmo motivo.
 */
export const rotaDeIntencaoDaFotoDaPublicacao = defineRoute({
  operationId: 'createPublicationPhotoUploadIntent',
  method: 'post',
  path: '/me/publications/photo-intents',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 20, window: '1h', onExceed: 'deny_429' }],
});

/**
 * Curtir e descurtir, **no MESMO caminho e com verbos diferentes**.
 *
 * `PUT` curte e `DELETE` descurte, porque as duas sao a mesma ARESTA vista dos
 * dois lados -- e `PUT` e o verbo de uma escrita idempotente. `POST /likes`
 * sugeriria uma colecao de curtidas, que e exatamente a lista que o item 7 da
 * Emenda 5 do ADR-0010 recusa.
 *
 * `x-effects: []` e nao `irreversible_write`: curtir se desfaz com um toque, e e
 * o unico par de escritas desta fatia que se desfaz.
 */
export const rotaDeCurtir = defineRoute({
  operationId: 'likePublication',
  method: 'put',
  path: '/publications/:publicationRef/like',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeDescurtir = defineRoute({
  operationId: 'unlikePublication',
  method: 'delete',
  path: '/publications/:publicationRef/like',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDosComentarios = defineRoute({
  operationId: 'listPublicationComments',
  method: 'get',
  path: '/publications/:publicationRef/comments',
  effects: [],
});

export const rotaDeComentar = defineRoute({
  operationId: 'commentOnPublication',
  method: 'post',
  path: '/publications/:publicationRef/comments',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeApagarComentario = defineRoute({
  operationId: 'deleteComment',
  method: 'delete',
  path: '/publications/:publicationRef/comments/:commentRef',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

export interface Autenticador {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDoMural {
  readonly mural: Mural;
  readonly autenticador: Autenticador;
  readonly contrato: Contrato;
  /** Domínio de mídia, separado da origem da aplicação (ADR-0007). */
  readonly baseDeMidia: AbsoluteUrl;
}

/** MEMOIZADA: o teto por `account` e o handler precisam do mesmo dono. */
function donoAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDoMural,
): Promise<UserId> {
  return memoDaRequisicao(request, 'publications:dono', async () => {
    const cabecalho = request.headers.authorization;
    if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
      throw problemas.naoAutenticado();
    }
    const token = cabecalho.slice('Bearer '.length).trim();
    if (token === '') throw problemas.naoAutenticado();
    return (await deps.autenticador.autenticar(token)).userId;
  });
}

async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDoMural,
): Promise<string | undefined> {
  try {
    return await donoAutenticado(request, deps);
  } catch {
    return undefined;
  }
}

/**
 * A URL é montada AQUI, na leitura, a partir do domínio de mídia. O banco
 * guarda só a chave (§11.1 proibição 9): gravar URL absoluta amarraria cada
 * linha ao provedor do dia em que ela foi escrita.
 */
function url(base: AbsoluteUrl, chave: string | null): string | null {
  return chave === null ? null : `${base.replace(/\/$/, '')}/${chave}`;
}

/**
 * Uma publicação como o DONO a vê. **Com estado**, porque motivo de recusa é
 * assunto entre o dono e quem modera.
 *
 * `upload_id` sai; `catalog_images.id` e `user_publications.id` **não** — são
 * identidade interna (ADR-0010 item 6, ADR-0024). O endereço que sai é `ref`.
 */
function comoMinhaPublicacao(
  publicacao: PublicacaoDoDono,
  baseDeMidia: AbsoluteUrl,
): Record<string, unknown> {
  return {
    ref: publicacao.ref,
    body: publicacao.corpo,
    created_at: publicacao.criadaEm.toISOString(),
    // `image` e nao `photo`, e `url` e nao `open_url`: os dois nomes sao
    // deliberados e o contrato diz por que -- `photo` e, nesta casa, o nome da
    // foto de PESSOA (um portao conta os campos `photo:`), e `open_url` e o nome
    // de uma derivada da VITRINE (outro portao os varre por nome de campo).
    image:
      publicacao.foto === null
        ? null
        : {
            upload_id: publicacao.foto.uploadId,
            status: publicacao.foto.status,
            url: url(baseDeMidia, publicacao.foto.abertaKey),
            rejection_reason: publicacao.foto.rejectionReason,
            alt_text: publicacao.foto.altText,
          },
  };
}

/**
 * Uma publicação na linha do tempo. **MENOS do que o dono vê**, e a redução é a
 * mesma que `PersonShowcasePhoto` fez sobre `ShowcasePhoto`: sem `status`, sem
 * `rejection_reason` e sem `upload_id`.
 *
 * **O autor sai com `handle`, `display_name`, `photo_icon_url` e
 * `contact_channel_verified`** — a foto pela **Emenda 5 do ADR-0010**
 * (20/10/2026) e o selo de validado pela emenda de **21/10/2026**, e as duas
 * NOMEIAM esta superfície: atributo novo sobre pessoa em superfície de terceiro
 * não se acrescenta por analogia, e as duas frentes pararam e perguntaram. Sem
 * `public_ref`, sem UUID e sem pet em forma nenhuma, e sem estado na foto.
 *
 * **O selo é um BOOLEANO e nada mais**: nem o endereço, nem a data, nem qual
 * dos dois canais. O que ele prova é canal de contato confirmado — na prática
 * e-mail —, e é por isso que o rótulo que o app desenha diz "e-mail
 * confirmado" e nunca "verificado" nem "confiável".
 *
 * **Exportada para a isca**, como `comoResposta` do perfil de pessoa e como os
 * `construtorDe...` da persistência: **nenhum portão deste repositório confere o
 * CORPO da resposta**, então a única forma de medir a forma do corpo em suíte é
 * chamar a projeção. Antes de 21/10/2026 esta função não tinha medição nenhuma —
 * `photo_icon_url` podia sumir do corpo e a suíte inteira continuava verde,
 * porque a lista de seleção do SQL era o mais longe que os casos chegavam.
 */
export function comoPublicacaoDaLinha(
  publicacao: PublicacaoNaLinha,
  baseDeMidia: AbsoluteUrl,
): Record<string, unknown> {
  return {
    ref: publicacao.ref,
    body: publicacao.corpo,
    created_at: publicacao.criadaEm.toISOString(),
    image:
      publicacao.foto === null
        ? null
        : {
            url: url(baseDeMidia, publicacao.foto.abertaKey),
            alt_text: publicacao.foto.altText,
          },
    like_count: publicacao.curtidas,
    comment_count: publicacao.comentarios,
    liked_by_me: publicacao.curtiEu,
    author: {
      handle: publicacao.handle,
      display_name: publicacao.displayName,
      // A `thumb` 176, e nunca a `card` de 512: o icone pinta 40 dp (120 px
      // reais a 3x), e a de 512 seria 4,27x mais dado do que a celula pinta --
      // vinte vezes por pagina. A conta e da propria Emenda 5.
      photo_icon_url: url(baseDeMidia, publicacao.autorThumbKey),
      // O SELO DE VALIDADO (emenda do ADR-0010, 21/10/2026). **Lido do
      // servidor e nunca comparado nesta camada**: o que ele afirma e
      // `email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL` na
      // conta DO AUTOR, e a borda nao tem a conta do autor -- so o que a
      // consulta trouxe.
      contact_channel_verified: publicacao.canalVerificado,
    },
    mine: publicacao.minha,
  };
}

/**
 * Um comentario, como o contrato o declara.
 *
 * **O autor usa o MESMO `PublicationAuthor` da publicacao**, e o reuso e
 * deliberado: e a mesma pessoa, com os mesmos tres campos e a mesma derivada de
 * foto (Emenda 5). Um `CommentAuthor` separado seria a segunda definicao da
 * mesma coisa -- e foi assim que `photo_icon_url` quase ganhou um hospedeiro que
 * o portao nao vigiava.
 *
 * **Exportada para a isca**, pelo mesmo motivo de [comoPublicacaoDaLinha]: o
 * corpo da resposta não tem portão, e o reuso de `PublicationAuthor` só é real
 * se as duas projeções forem medidas lado a lado.
 */
export function comoComentario(
  comentario: ComentarioVisivel,
  baseDeMidia: AbsoluteUrl,
): Record<string, unknown> {
  return {
    ref: comentario.ref,
    body: comentario.corpo,
    created_at: comentario.criadoEm.toISOString(),
    author: {
      handle: comentario.handle,
      display_name: comentario.displayName,
      photo_icon_url: url(baseDeMidia, comentario.autorThumbKey),
      contact_channel_verified: comentario.canalVerificado,
    },
    mine: comentario.meu,
  };
}

function comoPagina<T>(
  pagina: PaginaDePublicacoes<T>,
  converter: (item: T) => Record<string, unknown>,
): Record<string, unknown> {
  return { items: pagina.itens.map(converter), next_cursor: pagina.proximoCursor };
}

/** O recorte da consulta, como a borda o lê. A conferência é do caso de uso. */
function recorteDa(request: FastifyRequest): RecortePedido {
  const consulta = (request.query ?? {}) as Record<string, unknown>;
  return { cursor: consulta.cursor, limit: consulta.limit };
}

export function registrarRotasDoMural(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDoMural,
): void {
  registrarRota(
    app,
    rotaDasMinhasPublicacoes,
    // Sem `resolvedores`: a leitura não declara teto, e `registrarRota` recusa
    // resolvedor para rota sem `rateLimit` — o que é certo, porque um resolvedor
    // sem balde seria trabalho feito e descartado a cada leitura.
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      const dono = await donoAutenticado(request, deps);
      const pagina = await deps.mural.minhasPublicacoes(dono, recorteDa(request));
      return reply
        .status(200)
        .send(comoPagina(pagina, (item) => comoMinhaPublicacao(item, deps.baseDeMidia)));
    },
  );

  registrarRota(
    app,
    rotaDeLinhaDoTempo,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      const quemOlha = await donoAutenticado(request, deps);
      const pagina = await deps.mural.linhaDoTempo(quemOlha, recorteDa(request));
      return reply
        .status(200)
        .send(comoPagina(pagina, (item) => comoPublicacaoDaLinha(item, deps.baseDeMidia)));
    },
  );

  registrarRota(
    app,
    rotaDePublicar,
    {
      schema: { body: corpoDe(deps.contrato, rotaDePublicar.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const autor = await donoAutenticado(request, deps);
      const publicacao = await deps.mural.publicar(autor, request.body as PublicacaoPedida);
      return reply.status(201).send(comoMinhaPublicacao(publicacao, deps.baseDeMidia));
    },
  );

  registrarRota(
    app,
    rotaDeApagarPublicacao,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const dono = await donoAutenticado(request, deps);
      const { publicationRef } = request.params as { publicationRef: string };
      await deps.mural.apagar(dono, publicationRef);
      return reply.status(204).send();
    },
  );

  // CURTIR e DESCURTIR. `200` nas duas, com a contagem que passou a valer: sem
  // ela a tela precisaria refazer a leitura da linha do tempo a cada toque.
  registrarRota(
    app,
    rotaDeCurtir,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const quemCurte = await donoAutenticado(request, deps);
      const { publicationRef } = request.params as { publicationRef: string };
      const contagem = await deps.mural.curtir(quemCurte, publicationRef);
      return reply
        .status(200)
        .send({ like_count: contagem.curtidas, liked_by_me: contagem.curtiEu });
    },
  );

  registrarRota(
    app,
    rotaDeDescurtir,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const quemCurte = await donoAutenticado(request, deps);
      const { publicationRef } = request.params as { publicationRef: string };
      const contagem = await deps.mural.descurtir(quemCurte, publicationRef);
      return reply
        .status(200)
        .send({ like_count: contagem.curtidas, liked_by_me: contagem.curtiEu });
    },
  );

  registrarRota(
    app,
    rotaDosComentarios,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      const quemOlha = await donoAutenticado(request, deps);
      const { publicationRef } = request.params as { publicationRef: string };
      const pagina = await deps.mural.comentarios(quemOlha, publicationRef, recorteDa(request));
      return reply.status(200).send({
        items: pagina.itens.map((item) => comoComentario(item, deps.baseDeMidia)),
        next_cursor: pagina.proximoCursor,
        // O TOTAL da publicacao, e nao `items.length` -- que e o tamanho desta
        // pagina. A tela mostra o total no cartao e a pagina na folha.
        comment_count: pagina.total,
      });
    },
  );

  registrarRota(
    app,
    rotaDeComentar,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeComentar.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const autor = await donoAutenticado(request, deps);
      const { publicationRef } = request.params as { publicationRef: string };
      const desfecho = await deps.mural.comentar(autor, publicationRef, request.body);
      return reply.status(201).send({
        comment: comoComentario(desfecho.comentario, deps.baseDeMidia),
        comment_count: desfecho.total,
      });
    },
  );

  registrarRota(
    app,
    rotaDeApagarComentario,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await donoAutenticado(request, deps);
      const { publicationRef, commentRef } = request.params as {
        publicationRef: string;
        commentRef: string;
      };
      // **Quem chama, e nao "o autor do comentario".** Os dois caminhos de
      // autorizacao -- autor do comentario, dono da publicacao -- sao
      // resolvidos na clausula `WHERE` do `UPDATE`, e nao aqui.
      const total = await deps.mural.apagarComentario(
        chamador,
        publicationRef,
        commentRef,
      );
      return reply.status(200).send({ comment_count: total });
    },
  );

  registrarRota(
    app,
    rotaDeIntencaoDaFotoDaPublicacao,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeIntencaoDaFotoDaPublicacao.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const dono = await donoAutenticado(request, deps);
      const { uploadId, autorizacao } = await deps.mural.autorizarEnvio(
        dono,
        request.body as CorpoDaIntencaoDaPublicacao,
      );
      return reply.status(201).send({
        upload_id: uploadId,
        method: autorizacao.metodo,
        url: autorizacao.url,
        // Um dos dois, nunca os dois: `POST` leva campos de formulário, `PUT`
        // leva cabeçalhos assinados. O cliente LÊ `method` em vez de presumir.
        ...(autorizacao.campos === undefined ? {} : { fields: autorizacao.campos }),
        ...(autorizacao.cabecalhos === undefined ? {} : { headers: autorizacao.cabecalhos }),
        expires_at: autorizacao.expiraEm.toISOString(),
        max_bytes: autorizacao.maxBytes,
      });
    },
  );
}
