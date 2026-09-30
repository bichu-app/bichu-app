/**
 * As quatro rotas da conversa do achador sem conta (BICHUS-41).
 *
 * `/v1/finder/conversation*`, com `finderToken` e só ele. **Não há id no
 * caminho**, e a ausência é o desenho (SEC-001): o token do aviso é o endereço,
 * então não existe o par "id no caminho + credencial na outra mão" cuja
 * autorização dependeria de uma verificação de vínculo bem escrita. A página
 * `/c/{finderToken}` do site repassa o token em `Authorization: Bearer`, que é
 * o lugar que o esquema `finderToken` (`http`, `bearer`) do contrato declara.
 *
 * ## O que sai, campo a campo
 *
 * `FinderConversation` e `FinderMessage` não têm `id` nem `case_id`, e os
 * montadores abaixo são listas explícitas: um espalhamento publicaria cada
 * campo novo do serviço por omissão. O cursor também não carrega id
 * (`acesso-do-achador.ts`).
 *
 * ## Os tetos
 *
 * Copiados do contrato, entrada por entrada, e conferidos contra ele por
 * `rotas-registradas-contra-o-contrato.test.ts`. Três observações:
 *
 * - o balde de `finder_token` recebe o HMAC do token, nunca o token;
 * - `serve_cache` (leitura) e `accept_and_deduplicate` (bloqueio e denúncia)
 *   não recusam: só `deny_429` recusa (`aplicacao-de-teto.ts`). O de denúncia
 *   é cumprido no banco, pelo índice de uma denúncia aberta por lado;
 * - `hold_for_review` e `raise_queue_priority` com `distinct_identities` não
 *   são aplicáveis pela borda e aparecem no inventário da subida. O primeiro é
 *   cumprido pelo serviço (`avaliarRetencao`).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import {
  executarComIdempotencia,
  exigenciaDeIdempotencia,
  type Idempotencia,
} from '../../../../shared/http/idempotency.js';
import type { Contrato } from '../../../../shared/http/contract.js';
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
}

function origemDe(request: FastifyRequest): OrigemDoPedido {
  return { correlationId: request.id, ip: request.ip };
}

function corpoDe(contrato: Contrato, operationId: string): Record<string, unknown> {
  const schema = contrato.requestBodySchema(operationId);
  if (schema === undefined) {
    throw new Error(
      `Operação ${operationId} não declara corpo de requisição em application/json ` +
        `no contrato, mas a rota espera um. Corrija a especificação, não o código.`,
    );
  }
  return schema;
}

/** `FinderConversation`, campo a campo. Sem `id`, sem `case_id`. */
export function comoConversaDoAchador(conversa: ConversaParaOAchador): Record<string, unknown> {
  return {
    pet_display_name: conversa.petDisplayName,
    status: conversa.status,
    participants: conversa.participants.map((p) => ({ role: p.role, display_name: p.displayName })),
    messages: conversa.messages.map(comoMensagemDoAchador),
    next_cursor: conversa.nextCursor,
  };
}

/** `FinderMessage`, campo a campo. Sem `id`. */
export function comoMensagemDoAchador(mensagem: MensagemParaOAchador): Record<string, unknown> {
  return {
    sender_role: mensagem.senderRole,
    body: mensagem.body,
    redactions: mensagem.redactions.map((r) => ({ kind: r.kind, hint: r.hint })),
    // A foto do achador ainda não tem derivada nem leitura assinada no caminho
    // da conversa. Nulo é o valor verdadeiro; uma URL inventada seria promessa
    // que a tela descobre quebrada.
    photo_url: null,
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
        // O schema do contrato já converte e limita `limit` na subida
        // (`vigiarParametrosDasRotas`); a conversão aqui é para a rota não
        // depender de o gancho estar instalado antes dela.
        limit: limiteEfetivo(limit === undefined ? undefined : Number(limit)),
        deslocamento: decodificarCursorDoAchador(cursor) ?? 0,
      });
      return reply.status(200).send(comoConversaDoAchador(conversa));
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
      const corpo = request.body as { body: string };
      const resposta = await executarComIdempotencia(
        deps.idempotencia,
        {
          exigencia: exigenciaDeIdempotencia(deps.contrato, rotaDeMensagemDoAchador.operationId),
          chaveDoCabecalho: request.headers['idempotency-key'],
          // O dono da chave é o RESUMO do token, como no cancelamento de
          // transferência: a tabela de idempotência não guarda credencial.
          donoOuToken: hashDeToken(token).toString('base64'),
          endpoint: `${rotaDeMensagemDoAchador.method.toUpperCase()} ${rotaDeMensagemDoAchador.path}`,
          // Sem parâmetro de caminho: o token, que separa uma conversa da
          // outra, já está no dono.
          parametrosDeCaminho: {},
          corpo,
          agoraEmMilissegundos: deps.clock.now(),
        },
        async () => ({
          status: 201,
          body: comoMensagemDoAchador(await deps.conversas.enviar(token, corpo.body, origemDe(request))),
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
