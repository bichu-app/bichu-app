/**
 * As rotas do **convite de conexão** — o segredo que alimenta o link e o QR
 * (decisão do cliente de 20/10/2026).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { problemas } from '../../../../shared/http/errors.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type { ConviteDoPerfil } from '../../application/convite-do-perfil.js';

/**
 * **`irreversible_write`**: emitir **revoga o convite anterior**, e revogar não se
 * desfaz — o link que já foi compartilhado para de valer e não volta.
 */
export const rotaDaEmissaoDeConvite = defineRoute({
  operationId: 'issueConnectionInvite',
  method: 'post',
  path: '/connection-invites',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

/** `irreversible_write` pela mesma razão: o link revogado não volta. */
export const rotaDaRevogacaoDeConvite = defineRoute({
  operationId: 'revokeConnectionInvite',
  method: 'delete',
  path: '/connection-invites',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

/** Convite é segredo ao portador: nada daqui entra em cache compartilhado. */
const SEM_CACHE = 'private, no-store';

export interface Autenticador {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDeConvite {
  readonly convites: ConviteDoPerfil;
  readonly autenticador: Autenticador;
}

function tokenDoCabecalho(request: FastifyRequest): string {
  const cabecalho = request.headers.authorization;
  const prefixo = 'Bearer ';
  if (cabecalho === undefined || !cabecalho.startsWith(prefixo)) throw problemas.naoAutenticado();
  return cabecalho.slice(prefixo.length);
}

async function chamador(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeConvite,
): Promise<UserId> {
  return memoDaRequisicao(request, 'convite:chamador', async () => {
    const { userId } = await deps.autenticador.autenticar(tokenDoCabecalho(request));
    return userId;
  });
}

async function contexto(request: FastifyRequest, deps: DependenciasDasRotasDeConvite) {
  return {
    userId: await chamador(request, deps),
    correlationId: request.id,
    ip: request.ip,
  };
}

export function registrarRotasDeConvite(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDeConvite,
): void {
  const porConta = {
    account: async (request: FastifyRequest) => chamador(request, deps),
  };

  /**
   * Emitir. **201**, porque uma linha nova de convite nasce — e o token em claro sai
   * nesta resposta e em lugar nenhum mais: o banco guarda o resumo de 32 bytes,
   * então nem esta casa nem um despejo do banco o recuperam depois.
   */
  registrarRota(
    app,
    rotaDaEmissaoDeConvite,
    { resolvedores: porConta },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const convite = await deps.convites.emitir(await contexto(request, deps));
      return reply.status(201).header('Cache-Control', SEM_CACHE).send(convite);
    },
  );

  /** Revogar. **204 sem corpo, e idempotente**: sem convite ativo também é 204. */
  registrarRota(
    app,
    rotaDaRevogacaoDeConvite,
    { resolvedores: porConta },
    async (request: FastifyRequest, reply: FastifyReply) => {
      await deps.convites.revogar(await contexto(request, deps));
      return reply.status(204).header('Cache-Control', SEM_CACHE).send();
    },
  );
}
