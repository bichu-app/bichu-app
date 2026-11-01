import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import {
  executarComIdempotencia,
  exigenciaDeIdempotencia,
  type Idempotencia,
} from '../../../../shared/http/idempotency.js';
import { hashDeToken } from '../../../../shared/crypto/digest.js';
import type { Clock } from '../../../../shared/ports/index.js';
import { mascararEmail } from '../../domain/janela-da-transferencia.js';
import type { PetTransferService } from '../../application/pet-transfer-service.js';
import type {
  TransferId,
  TransferenciaGravada,
  TransferenciaPorTokenDeCancelamento,
} from '../../ports/transfer-repository.js';
import type { PetId, UserId } from '../../../../shared/types/brands.js';

export const rotaDeInicioDaTransferencia = defineRoute({
  operationId: 'startPetTransfer',
  method: 'post',
  path: '/pets/:petId/transfer',
  effects: ['notifies', 'verifies_secret'],
  rateLimit: [{ dimension: ['account'], limit: 5, window: '24h', onExceed: 'deny_429' }],
  reauthScope: 'pet_transfer',
});

export const rotaDeCancelamentoDaTransferencia = defineRoute({
  operationId: 'cancelPetTransfer',
  method: 'post',
  path: '/pets/transfers/:transferId/cancel',
  effects: ['notifies'],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeAceiteDaTransferencia = defineRoute({
  operationId: 'acceptPetTransfer',
  method: 'post',
  path: '/pets/transfers/accept',
  effects: ['verifies_secret', 'notifies'],
  rateLimit: [
    { dimension: ['account'], limit: 10, window: '1h', onExceed: 'deny_429' },
    {
      dimension: ['ip'],
      limit: 20,
      window: '1h',
      onExceed: 'deny_429',
      appliesTo: 'invalid_attempts',
    },
  ],
});

/**
 * ==================================================================== AS DUAS
 * ROTAS DE TOKEN DE CANCELAMENTO NAO FILTRAM CONTA DESABILITADA
 */
export const rotaDaTransferenciaPorToken = defineRoute({
  operationId: 'getTransferByCancelToken',
  method: 'get',
  path: '/public/transfers/:cancelToken',
  effects: [],
  noChallenge: true,
  rateLimit: [{ dimension: ['ip'], limit: 30, window: '1h', onExceed: 'log_and_alert' }],
});

export const rotaDeCancelamentoPorToken = defineRoute({
  operationId: 'cancelTransferByToken',
  method: 'post',
  path: '/public/transfers/:cancelToken/cancel',
  effects: ['irreversible_write', 'notifies'],
  noChallenge: true,
  rateLimit: [{ dimension: ['ip'], limit: 10, window: '1h', onExceed: 'log_and_alert' }],
});

export interface Autenticador {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDeTransferencia {
  readonly transferencias: PetTransferService;
  readonly autenticador: Autenticador;
  readonly contrato: Contrato;
  readonly idempotencia: Idempotencia;
  readonly clock: Clock;
}

function comoRespostaDaTransferencia(t: TransferenciaGravada): Record<string, unknown> {
  return {
    id: t.id,
    pet_id: t.petId,
    status: t.status,
    recipient_email_masked: mascararEmail(t.recipientEmail),
    expires_at: t.inviteExpiresAt.toISOString(),
    accepted_at: t.acceptedAt === null ? null : t.acceptedAt.toISOString(),
    effective_at: t.effectiveAt === null ? null : t.effectiveAt.toISOString(),
    cancelled_at: t.cancelledAt === null ? null : t.cancelledAt.toISOString(),
  };
}

function comoVisaoDeCancelamento(
  t: TransferenciaPorTokenDeCancelamento,
): Record<string, unknown> {
  return {
    pet_display_name: t.petDisplayName,
    effective_at: (t.effectiveAt ?? t.requestedAt).toISOString(),
    requested_at: t.requestedAt.toISOString(),
  };
}

function donoAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeTransferencia,
): Promise<{ userId: UserId; correlationId: string; ip: string | undefined }> {
  return memoDaRequisicao(request, 'transferencias:dono', async () => {
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

async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeTransferencia,
): Promise<string | undefined> {
  try {
    return (await donoAutenticado(request, deps)).userId;
  } catch {
    return undefined;
  }
}

export function registrarRotasDeTransferencia(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDeTransferencia,
): void {
  registrarRota(
    app,
    rotaDeInicioDaTransferencia,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeInicioDaTransferencia.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await donoAutenticado(request, deps);
      const { petId } = request.params as { petId: string };
      const corpo = request.body as { recipient_email: string };
      const t = await deps.transferencias.iniciar(
        petId as PetId,
        corpo.recipient_email,
        chamador,
      );
      return reply.status(202).send(comoRespostaDaTransferencia(t));
    },
  );

  registrarRota(
    app,
    rotaDeCancelamentoDaTransferencia,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await donoAutenticado(request, deps);
      const { transferId } = request.params as { transferId: string };
      const t = await deps.transferencias.cancelarPeloTutor(transferId as TransferId, chamador);
      return reply.status(200).send(comoRespostaDaTransferencia(t));
    },
  );

  registrarRota(
    app,
    rotaDeAceiteDaTransferencia,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeAceiteDaTransferencia.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await donoAutenticado(request, deps);
      const corpo = request.body as { token: string };
      const t = await deps.transferencias.aceitar(corpo.token, chamador);
      return reply.status(200).send(comoRespostaDaTransferencia(t));
    },
  );

  registrarRota(
    app,
    rotaDaTransferenciaPorToken,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { cancelToken } = request.params as { cancelToken: string };
      const t = await deps.transferencias.verPorTokenDeCancelamento(cancelToken);
      return reply.status(200).send(comoVisaoDeCancelamento(t));
    },
  );

  registrarRota(
    app,
    rotaDeCancelamentoPorToken,
    {
      config: { idempotencia: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { cancelToken } = request.params as { cancelToken: string };

      const resposta = await executarComIdempotencia(
        deps.idempotencia,
        {
          exigencia: exigenciaDeIdempotencia(
            deps.contrato,
            rotaDeCancelamentoPorToken.operationId,
          ),
          chaveDoCabecalho: request.headers['idempotency-key'],
          donoOuToken: hashDeToken(cancelToken).toString('base64'),
          endpoint: `${rotaDeCancelamentoPorToken.method.toUpperCase()} ${rotaDeCancelamentoPorToken.path}`,
          parametrosDeCaminho: { cancelToken: hashDeToken(cancelToken).toString('base64') },
          corpo: null,
          agoraEmMilissegundos: deps.clock.now(),
        },
        async () => {
          await deps.transferencias.cancelarPorToken(cancelToken);
          return { status: 204, body: null };
        },
      );

      return reply.status(resposta.status).send(resposta.body ?? undefined);
    },
  );
}
