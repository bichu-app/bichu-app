/** As quatro rotas da conversa do achador sem conta (BICHUS-41). */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import {
  executarComIdempotencia,
  exigenciaDeIdempotencia,
  type Idempotencia,
} from '../../../../shared/http/idempotency.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import {
  resolvedorDoTokenDoAchador,
  tokenDoAchador,
} from '../../../../shared/http/token-do-achador.js';
import { hashDeToken } from '../../../../shared/crypto/digest.js';
import type { Clock } from '../../../../shared/ports/index.js';
import type {
  ConversaDoAchadorService,
  ConversaParaOAchador,
  MensagemParaOAchador,
  OrigemDoPedido,
} from '../../application/conversa-do-achador.js';
import type { MotivoDaDenuncia } from '../../ports/conversation-repository.js';
import { decodificarCursorDoAchador } from '../../domain/acesso-do-achador.js';
import { limiteEfetivo } from '../../domain/paginacao.js';
import type { AssinadorDeFoto } from '../../ports/assinador-de-foto.js';
import { podeSairParaQuemNaoTemConta } from '../../domain/leitura-da-foto.js';

export const rotaDaConversaDoAchador = defineRoute({
  operationId: 'getFinderConversation',
  method: 'get',
  path: '/finder/conversation',
  effects: [],
  rateLimit: [{ dimension: ['finder_token'], limit: 120, window: '1h', onExceed: 'serve_cache' }],
});

export const rotaDeMensagemDoAchador = defineRoute({
  operationId: 'postFinderMessage',
  method: 'post',
  path: '/finder/conversation/messages',
  effects: ['notifies', 'human_work'],
  rateLimit: [
    { dimension: ['finder_token'], limit: 30, window: '1h', onExceed: 'deny_429' },
    { dimension: ['finder_token'], limit: 200, window: '24h', onExceed: 'hold_for_review' },
  ],
});

export const rotaDeBloqueioDoAchador = defineRoute({
  operationId: 'blockFinderConversation',
  method: 'post',
  path: '/finder/conversation/block',
  effects: [],
  rateLimit: [
    { dimension: ['finder_token'], limit: 10, window: '24h', onExceed: 'accept_and_deduplicate' },
  ],
});

export const rotaDeDenunciaDoAchador = defineRoute({
  operationId: 'reportFinderConversation',
  method: 'post',
  path: '/finder/conversation/report',
  effects: ['human_work'],
  rateLimit: [
    { dimension: ['finder_token'], limit: 3, window: '24h', onExceed: 'accept_and_deduplicate' },
    {
      dimension: ['report_target'],
      counts: 'distinct_identities',
      limit: 3,
      window: '24h',
      onExceed: 'raise_queue_priority',
    },
  ],
});

export interface DependenciasDasRotasDoAchador {
  readonly conversas: ConversaDoAchadorService;
  readonly contrato: Contrato;
  readonly idempotencia: Idempotencia;
  readonly clock: Clock;
  /** O assinador da foto da mensagem (BICHUS-35). */
  readonly assinarFoto: AssinadorDeFoto;
}

function origemDe(request: FastifyRequest): OrigemDoPedido {
  return { correlationId: request.id, ip: request.ip };
}

/** `FinderConversation`, campo a campo. */
export async function comoConversaDoAchador(
  conversa: ConversaParaOAchador,
  assinar: AssinadorDeFoto,
): Promise<Record<string, unknown>> {
  return {
    pet_display_name: conversa.petDisplayName,
    status: conversa.status,
    participants: conversa.participants.map((p) => ({ role: p.role, display_name: p.displayName })),
    messages: await Promise.all(
      conversa.messages.map((m) => comoMensagemDoAchador(m, assinar)),
    ),
    next_cursor: conversa.nextCursor,
  };
}

/** `FinderMessage`, campo a campo. */
export async function comoMensagemDoAchador(
  mensagem: MensagemParaOAchador,
  assinar: AssinadorDeFoto,
): Promise<Record<string, unknown>> {
  return {
    sender_role: mensagem.senderRole,
    body: mensagem.body,
    redactions: mensagem.redactions.map((r) => ({ kind: r.kind, hint: r.hint })),
    photo_url:
      mensagem.photoObjectKey === null ||
      !podeSairParaQuemNaoTemConta(mensagem.photoObjectKey)
        ? null
        : await assinar(mensagem.photoObjectKey),
    created_at: mensagem.createdAt.toISOString(),
  };
}

export function registrarRotasDoAchador(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDoAchador,
): void {
  registrarRota(
    app,
    rotaDaConversaDoAchador,
    { resolvedores: { finder_token: resolvedorDoTokenDoAchador } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const token = tokenDoAchador(request);
      const { cursor, limit } = request.query as { cursor?: string; limit?: number | string };
      const conversa = await deps.conversas.ler(token, {
        limit: limiteEfetivo(limit === undefined ? undefined : Number(limit)),
        deslocamento: decodificarCursorDoAchador(cursor) ?? 0,
      });
      return reply.status(200).send(await comoConversaDoAchador(conversa, deps.assinarFoto));
    },
  );

  registrarRota(
    app,
    rotaDeMensagemDoAchador,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeMensagemDoAchador.operationId) },
      config: { idempotencia: true },
      resolvedores: { finder_token: resolvedorDoTokenDoAchador },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const token = tokenDoAchador(request);
      const corpo = request.body as { body: string; photo_upload_ref?: string };
      const resposta = await executarComIdempotencia(
        deps.idempotencia,
        {
          exigencia: exigenciaDeIdempotencia(deps.contrato, rotaDeMensagemDoAchador.operationId),
          chaveDoCabecalho: request.headers['idempotency-key'],
          donoOuToken: hashDeToken(token).toString('base64'),
          endpoint: `${rotaDeMensagemDoAchador.method.toUpperCase()} ${rotaDeMensagemDoAchador.path}`,
          parametrosDeCaminho: {},
          corpo,
          agoraEmMilissegundos: deps.clock.now(),
        },
        async () => ({
          status: 201,
          body: await comoMensagemDoAchador(
            await deps.conversas.enviar(
              token,
              corpo.body,
              origemDe(request),
              corpo.photo_upload_ref,
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
    rotaDeBloqueioDoAchador,
    { resolvedores: { finder_token: resolvedorDoTokenDoAchador } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      await deps.conversas.bloquear(tokenDoAchador(request), origemDe(request));
      return reply.status(204).send();
    },
  );

  registrarRota(
    app,
    rotaDeDenunciaDoAchador,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeDenunciaDoAchador.operationId) },
      resolvedores: {
        finder_token: resolvedorDoTokenDoAchador,
        report_target: async (request) => {
          try {
            return await deps.conversas.alvoDaDenuncia(tokenDoAchador(request));
          } catch {
            return undefined;
          }
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = request.body as { reason: MotivoDaDenuncia; detail?: string };
      await deps.conversas.denunciar(
        tokenDoAchador(request),
        corpo.reason,
        corpo.detail,
        origemDe(request),
      );
      return reply.status(202).send({ status: 'accepted' });
    },
  );
}
