import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import { problemas } from '../../../../shared/http/errors.js';
import type { AuthService, Autenticado } from '../../application/auth-service.js';
import type { PasskeyService } from '../../application/passkey-service.js';
import type { ContextoDaRequisicao } from '../../application/dependencies.js';
import {
  grafiaDasOpcoesDeCadastro,
  grafiaDasOpcoesDeEntrada,
} from './passkey-grafia.js';

export const rotaDeInicioDoCadastroDePasskey = defineRoute({
  operationId: 'beginPasskeyRegistration',
  method: 'post',
  path: '/auth/passkey/registration/options',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 10, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeConclusaoDoCadastroDePasskey = defineRoute({
  operationId: 'finishPasskeyRegistration',
  method: 'post',
  path: '/auth/passkey/registration',
  effects: ['verifies_secret'],
  rateLimit: [{ dimension: ['account'], limit: 10, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeInicioDaEntradaPorPasskey = defineRoute({
  operationId: 'beginPasskeyAuthentication',
  method: 'post',
  path: '/auth/passkey/authentication/options',
  effects: [],
  rateLimit: [
    { dimension: ['ip'], limit: 300, window: '1h', onExceed: 'deny_429' },
    { dimension: ['ip'], limit: 1500, window: '24h', onExceed: 'deny_429' },
  ],
});

export const rotaDeConclusaoDaEntradaPorPasskey = defineRoute({
  operationId: 'finishPasskeyAuthentication',
  method: 'post',
  path: '/auth/passkey/authentication',
  effects: ['verifies_secret'],
  rateLimit: [{ dimension: ['ip'], limit: 20, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDaListaDePasskeys = defineRoute({
  operationId: 'listPasskeys',
  method: 'get',
  path: '/auth/passkeys',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeRevogacaoDePasskey = defineRoute({
  operationId: 'revokePasskey',
  method: 'delete',
  path: '/auth/passkeys/:passkeyId',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 30, window: '1h', onExceed: 'deny_429' }],
});

export interface DependenciasDasRotasDePasskey {
  readonly auth: AuthService;
  readonly passkeys: PasskeyService;
  readonly contrato: Contrato;
}

function contextoDe(request: FastifyRequest): ContextoDaRequisicao {
  return {
    correlationId: request.id,
    ip: request.ip,
    userAgent:
      typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined,
  };
}

function tokenDoCabecalho(request: FastifyRequest): string {
  const cabecalho = request.headers.authorization;
  if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
    throw problemas.naoAutenticado();
  }
  const token = cabecalho.slice('Bearer '.length).trim();
  if (token === '') throw problemas.naoAutenticado();
  return token;
}

function autenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDePasskey,
): Promise<Autenticado> {
  return memoDaRequisicao(request, 'identity:autenticado', () =>
    deps.auth.autenticar(tokenDoCabecalho(request)),
  );
}

async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDePasskey,
): Promise<string | undefined> {
  try {
    return (await autenticado(request, deps)).conta.id;
  } catch {
    return undefined;
  }
}

export function registrarRotasDePasskey(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDePasskey,
): void {
  registrarRota(
    app,
    rotaDeInicioDoCadastroDePasskey,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { conta } = await autenticado(request, deps);
      const opcoes = await deps.passkeys.comecarCadastro({
        id: conta.id,
        email: conta.email,
        displayName: conta.displayName,
      });
      return reply.status(200).send(grafiaDasOpcoesDeCadastro(opcoes));
    },
  );

  registrarRota(
    app,
    rotaDeConclusaoDoCadastroDePasskey,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeConclusaoDoCadastroDePasskey.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { conta } = await autenticado(request, deps);
      const corpo = request.body as { credential: unknown; label?: string };
      const gravada = await deps.passkeys.concluirCadastro(
        { id: conta.id, email: conta.email, displayName: conta.displayName },
        corpo,
      );
      return reply.status(201).send({
        id: gravada.id,
        label: gravada.label,
        created_at: new Date(gravada.criadaEm).toISOString(),
        last_used_at: gravada.usadaEm === null ? null : new Date(gravada.usadaEm).toISOString(),
      });
    },
  );

  registrarRota(
    app,
    rotaDeInicioDaEntradaPorPasskey,
    {},
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const opcoes = await deps.passkeys.comecarEntrada();
      return reply.status(200).send(grafiaDasOpcoesDeEntrada(opcoes));
    },
  );

  registrarRota(
    app,
    rotaDeConclusaoDaEntradaPorPasskey,
    { schema: { body: corpoDe(deps.contrato, rotaDeConclusaoDaEntradaPorPasskey.operationId) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = request.body as { credential: unknown; stay_signed_in?: boolean };
      const userId = await deps.passkeys.concluirEntrada(corpo);
      const sessao = await deps.auth.entrarComCredencialDigital(
        userId,
        corpo.stay_signed_in === true,
        contextoDe(request),
      );
      return reply.status(200).send(sessao);
    },
  );

  registrarRota(
    app,
    rotaDaListaDePasskeys,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { conta } = await autenticado(request, deps);
      const itens = await deps.passkeys.listar(conta.id);
      return reply.status(200).send({
        items: itens.map((p) => ({
          id: p.id,
          label: p.label,
          created_at: new Date(p.criadaEm).toISOString(),
          last_used_at: p.usadaEm === null ? null : new Date(p.usadaEm).toISOString(),
        })),
      });
    },
  );

  registrarRota(
    app,
    rotaDeRevogacaoDePasskey,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { conta } = await autenticado(request, deps);
      const { passkeyId } = request.params as { passkeyId: string };
      await deps.passkeys.revogar(conta.id, passkeyId);
      return reply.status(204).send();
    },
  );
}
