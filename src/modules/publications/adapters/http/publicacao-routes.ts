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
 * Assinar é barato, mas cada assinatura é uma autorização de escrita que **não se
 * desfaz dentro da validade**.
 */
export const rotaDeIntencaoDaFotoDaPublicacao = defineRoute({
  operationId: 'createPublicationPhotoUploadIntent',
  method: 'post',
  path: '/me/publications/photo-intents',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 20, window: '1h', onExceed: 'deny_429' }],
});

/** Curtir e descurtir, **no MESMO caminho e com verbos diferentes**. */
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

function url(base: AbsoluteUrl, chave: string | null): string | null {
  return chave === null ? null : `${base.replace(/\/$/, '')}/${chave}`;
}

function comoMinhaPublicacao(
  publicacao: PublicacaoDoDono,
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
            upload_id: publicacao.foto.uploadId,
            status: publicacao.foto.status,
            url: url(baseDeMidia, publicacao.foto.abertaKey),
            rejection_reason: publicacao.foto.rejectionReason,
            alt_text: publicacao.foto.altText,
          },
  };
}

/** Uma publicação na linha do tempo. */
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
      photo_icon_url: url(baseDeMidia, publicacao.autorThumbKey),
      contact_channel_verified: publicacao.canalVerificado,
    },
    mine: publicacao.minha,
  };
}

/** Um comentario, como o contrato o declara. */
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
        ...(autorizacao.campos === undefined ? {} : { fields: autorizacao.campos }),
        ...(autorizacao.cabecalhos === undefined ? {} : { headers: autorizacao.cabecalhos }),
        expires_at: autorizacao.expiraEm.toISOString(),
        max_bytes: autorizacao.maxBytes,
      });
    },
  );
}
