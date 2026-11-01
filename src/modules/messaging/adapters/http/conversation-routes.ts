import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import {
  registrarRota,
  type RegistradorDeRotas,
} from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import {
  executarComIdempotencia,
  exigenciaDeIdempotencia,
  type Idempotencia,
} from '../../../../shared/http/idempotency.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import type { Clock } from '../../../../shared/ports/index.js';
import type { ResolvedorDeDimensao } from '../../../../shared/http/aplicacao-de-teto.js';
import type {
  Chamador,
  ConversaVisivel,
  ConversationService,
} from '../../application/conversation-service.js';
import type {
  MensagemGravada,
  MotivoDaDenuncia,
  Pagina,
  PaginaDaLista,
} from '../../ports/conversation-repository.js';
import { decodificarCursor, limiteEfetivo } from '../../domain/paginacao.js';
import type { AbsoluteUrl, ConversationId, UserId } from '../../../../shared/types/brands.js';
import type { AssinadorDeFoto } from '../../ports/assinador-de-foto.js';

export const rotaDeListagemDeConversas = defineRoute({
  operationId: 'listConversations',
  method: 'get',
  path: '/conversations',
  effects: [],
});

/** `POST /v1/me/conversations-seen` -- a area de mensagens foi VISTA. */
export const rotaDeListaVista = defineRoute({
  operationId: 'markMyConversationsSeen',
  method: 'post',
  path: '/me/conversations-seen',
  effects: [],
  rateLimit: [
    { dimension: ['account'], limit: 240, window: '1h', onExceed: 'accept_and_deduplicate' },
  ],
});

export const rotaDeDetalheDaConversa = defineRoute({
  operationId: 'getConversation',
  method: 'get',
  path: '/conversations/:conversationId',
  effects: [],
});

/** O envio, e os três tetos do contrato. */
export const rotaDeEnvioDeMensagem = defineRoute({
  operationId: 'postConversationMessage',
  method: 'post',
  path: '/conversations/:conversationId/messages',
  effects: ['notifies', 'human_work'],
  rateLimit: [
    { dimension: ['conversation_participant'], limit: 30, window: '1h', onExceed: 'deny_429' },
    {
      dimension: ['conversation_participant'],
      limit: 200,
      window: '24h',
      onExceed: 'hold_for_review',
    },
    {
      dimension: ['account'],
      counts: 'distinct_cases',
      limit: 3,
      window: '24h',
      onExceed: 'hold_for_review',
    },
  ],
});

/** O bloqueio (`blockConversation`). */
export const rotaDeBloqueioDaConversa = defineRoute({
  operationId: 'blockConversation',
  method: 'post',
  path: '/conversations/:conversationId/block',
  effects: [],
  rateLimit: [
    { dimension: ['account'], limit: 20, window: '24h', onExceed: 'accept_and_deduplicate' },
  ],
});

/** A denúncia (`reportConversation`). */
export const rotaDeDenunciaDaConversa = defineRoute({
  operationId: 'reportConversation',
  method: 'post',
  path: '/conversations/:conversationId/report',
  effects: ['human_work'],
  rateLimit: [
    { dimension: ['account'], limit: 3, window: '24h', onExceed: 'accept_and_deduplicate' },
    {
      dimension: ['report_target'],
      counts: 'distinct_identities',
      limit: 3,
      window: '24h',
      onExceed: 'raise_queue_priority',
    },
  ],
});

export interface Autenticador {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDeConversa {
  readonly conversas: ConversationService;
  readonly autenticador: Autenticador;
  readonly contrato: Contrato;
  readonly idempotencia: Idempotencia;
  readonly clock: Clock;
  /** O dominio das derivadas publicas. */
  readonly baseDeMidia: AbsoluteUrl;
  /** O assinador da foto da MENSAGEM (BICHUS-35). */
  readonly assinarFoto: AssinadorDeFoto;
}

function chamadorAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeConversa,
): Promise<Chamador> {
  return memoDaRequisicao(request, 'conversas:chamador', async () => {
    const cabecalho = request.headers.authorization;
    if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
      throw problemas.naoAutenticado();
    }
    const token = cabecalho.slice('Bearer '.length).trim();
    if (token === '') throw problemas.naoAutenticado();
    const { userId } = await deps.autenticador.autenticar(token);
    return { userId, correlationId: request.id, ip: request.ip };
  });
}

function conversaDoCaminho(request: FastifyRequest): ConversationId {
  const { conversationId } = request.params as { conversationId?: string };
  if (typeof conversationId !== 'string' || conversationId === '') {
    throw problemas.naoEncontrado();
  }
  return conversationId as ConversationId;
}

function paginaDaQuery(request: FastifyRequest): Pagina {
  const { cursor, limit } = request.query as { cursor?: string; limit?: number };
  const posicao = decodificarCursor(cursor);
  return {
    limit: limiteEfetivo(limit),
    ...(posicao === undefined ? { depoisDe: undefined } : { depoisDe: posicao }),
  };
}

function paginaDaListaDaQuery(request: FastifyRequest): PaginaDaLista {
  const { q } = request.query as { q?: string };
  const termo = typeof q === 'string' ? q.trim() : '';
  return {
    ...paginaDaQuery(request),
    termo: termo === '' ? undefined : termo,
  };
}

async function participanteDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeConversa,
): Promise<string | undefined> {
  const { conversationId } = request.params as { conversationId?: string };
  if (typeof conversationId !== 'string' || conversationId === '') return undefined;
  try {
    const chamador = await chamadorAutenticado(request, deps);
    return `${conversationId}:${chamador.userId}`;
  } catch {
    return undefined;
  }
}

async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeConversa,
): Promise<string | undefined> {
  try {
    return (await chamadorAutenticado(request, deps)).userId;
  } catch {
    return undefined;
  }
}

/** Os resolvedores do envio, num lugar só. */
export function resolvedoresDoEnvio(deps: DependenciasDasRotasDeConversa): {
  conversation_participant: ResolvedorDeDimensao;
  account: ResolvedorDeDimensao;
} {
  return {
    conversation_participant: (request) => participanteDoTeto(request, deps),
    account: (request) => contaDoTeto(request, deps),
  };
}

/** A conversa na forma do contrato, campo a campo. */
export async function comoResposta(
  conversa: ConversaVisivel,
  baseDeMidia: AbsoluteUrl,
  assinar: AssinadorDeFoto,
): Promise<Record<string, unknown>> {
  const base = baseDeMidia.replace(/\/$/, '');
  return {
    id: conversa.id,
    found_report_id: conversa.foundReportId,
    photo_reaches_other_side: conversa.fotoAlcancaOutroLado,
    case_id: conversa.caseId,
    pet_display_name: conversa.petDisplayName,
    status: conversa.status,
    viewer_role: conversa.papelDoChamador,
    participants: conversa.participants.map((p) => ({
      role: p.role,
      display_name: p.displayName,
      handle: p.handle,
      photo_icon_url: p.photoKey === null ? null : `${base}/${p.photoKey}`,
    })),
    messages: await Promise.all(conversa.messages.map((m) => comoMensagem(m, assinar))),
    unread: conversa.naoLida,
    last_message_preview: conversa.previaDaUltima,
    last_message_at:
      conversa.ultimaMensagemEm === null ? null : conversa.ultimaMensagemEm.toISOString(),
    next_cursor: conversa.nextCursor,
  };
}

async function urlDaFoto(
  mensagem: MensagemGravada,
  assinar: AssinadorDeFoto,
): Promise<string | null> {
  if (mensagem.photoObjectKey === null) return null;
  return assinar(mensagem.photoObjectKey);
}

async function comoMensagem(
  mensagem: MensagemGravada,
  assinar: AssinadorDeFoto,
): Promise<Record<string, unknown>> {
  return {
    id: mensagem.id,
    sender_role: mensagem.senderRole,
    body: mensagem.body,
    redactions: mensagem.redactions.map((r) => ({ kind: r.kind, hint: r.hint })),
    photo_url: await urlDaFoto(mensagem, assinar),
    created_at: mensagem.createdAt.toISOString(),
  };
}

export function registrarRotasDeConversas(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDeConversa,
): void {
  registrarRota(
    app,
    rotaDeListagemDeConversas,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const pagina = paginaDaListaDaQuery(request);
      const pagina_ = await deps.conversas.listar(chamador, pagina);
      return reply.status(200).send({
        items: await Promise.all(
          pagina_.items.map((c) => comoResposta(c, deps.baseDeMidia, deps.assinarFoto)),
        ),
        total: pagina_.total,
        unread_count: pagina_.naoLidas,
        next_cursor: pagina_.nextCursor,
      });
    },
  );

  registrarRota(
    app,
    rotaDeListaVista,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      await deps.conversas.marcarListaVista(chamador);
      return reply.status(204).send();
    },
  );

  registrarRota(
    app,
    rotaDeDetalheDaConversa,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const conversa = await deps.conversas.buscar(
        conversaDoCaminho(request),
        chamador,
        paginaDaQuery(request),
      );
      return reply.status(200).send(await comoResposta(conversa, deps.baseDeMidia, deps.assinarFoto));
    },
  );

  registrarRota(
    app,
    rotaDeEnvioDeMensagem,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeEnvioDeMensagem.operationId) },
      config: { idempotencia: true },
      resolvedores: resolvedoresDoEnvio(deps),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const conversationId = conversaDoCaminho(request);
      const corpo = request.body as { body: string; photo_upload_id?: string };

      const resposta = await executarComIdempotencia(
        deps.idempotencia,
        {
          exigencia: exigenciaDeIdempotencia(deps.contrato, rotaDeEnvioDeMensagem.operationId),
          chaveDoCabecalho: request.headers['idempotency-key'],
          donoOuToken: chamador.userId,
          endpoint: `${rotaDeEnvioDeMensagem.method.toUpperCase()} ${rotaDeEnvioDeMensagem.path}`,
          parametrosDeCaminho: { conversationId },
          corpo,
          agoraEmMilissegundos: deps.clock.now(),
        },
        async () => ({
          status: 201,
          body: await comoMensagem(
            await deps.conversas.enviar(
              conversationId,
              corpo.body,
              chamador,
              corpo.photo_upload_id,
            ),
            deps.assinarFoto,
          ),
        }),
      );

      return reply.status(resposta.status).send(resposta.body);
    },
  );

  registrarRota(
    app,
    rotaDeBloqueioDaConversa,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      await deps.conversas.bloquear(conversaDoCaminho(request), chamador);
      return reply.status(204).send();
    },
  );

  registrarRota(
    app,
    rotaDeDenunciaDaConversa,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeDenunciaDaConversa.operationId) },
      resolvedores: {
        account: (request) => contaDoTeto(request, deps),
        report_target: async (request) => {
          const { conversationId } = request.params as { conversationId?: string };
          if (typeof conversationId !== 'string' || conversationId === '') return undefined;
          try {
            return await deps.conversas.alvoDaDenuncia(
              conversationId as ConversationId,
              await chamadorAutenticado(request, deps),
            );
          } catch {
            return undefined;
          }
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const corpo = request.body as { reason: MotivoDaDenuncia; detail?: string };
      await deps.conversas.denunciar(
        conversaDoCaminho(request),
        corpo.reason,
        corpo.detail,
        chamador,
      );
      return reply.status(202).send({ status: 'accepted' });
    },
  );
}
