import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { problemas } from '../../../../shared/http/errors.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { recusarCampoDesconhecido } from '../../../../shared/http/corpo-fechado.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import type { AbsoluteUrl, UserId } from '../../../../shared/types/brands.js';
import type { PerfilDePessoa, PerfilDePessoaProjetado } from '../../application/perfil-de-pessoa.js';
import type { FotoDoPerfilDeOutraPessoa } from '../../ports/perfil-de-pessoa-repository.js';

/** O teto é o do contrato, COPIADO de lá. */
export const rotaDoPerfilDePessoa = defineRoute({
  operationId: 'getPersonProfile',
  method: 'get',
  path: '/people/:handle',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 600, window: '1h', onExceed: 'deny_429' }],
});

/**
 * **A tela de destino do link de convite e do QR**: o perfil de quem emitiu,
 * endereçado pelo **token** em vez do apelido.
 */
export const rotaDaResolucaoDeConvite = defineRoute({
  operationId: 'resolveConnectionInvite',
  method: 'post',
  path: '/connection-invites/resolution',
  effects: [],
  rateLimit: [
    { dimension: ['account'], limit: 120, window: '1h', onExceed: 'deny_429' },
    {
      dimension: ['account'],
      appliesTo: 'invalid_attempts',
      limit: 20,
      window: '1h',
      onExceed: 'deny_429',
    },
  ],
});

const SEM_CACHE = 'private, no-store';

export interface Autenticador {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDePessoa {
  readonly perfis: PerfilDePessoa;
  readonly autenticador: Autenticador;
  /** O domínio das derivadas públicas. */
  readonly baseDeMidia: AbsoluteUrl;
  /** O contrato, para o esquema do corpo de `resolveConnectionInvite`. */
  readonly contrato: Contrato;
}

interface CaminhoDoPerfil {
  readonly handle: string;
}

function tokenDoCabecalho(request: FastifyRequest): string {
  const cabecalho = request.headers.authorization;
  const prefixo = 'Bearer ';
  if (cabecalho === undefined || !cabecalho.startsWith(prefixo)) throw problemas.naoAutenticado();
  return cabecalho.slice(prefixo.length);
}

async function chamador(
  request: FastifyRequest,
  deps: DependenciasDasRotasDePessoa,
): Promise<UserId> {
  return memoDaRequisicao(request, 'people:chamador', async () => {
    const { userId } = await deps.autenticador.autenticar(tokenDoCabecalho(request));
    return userId;
  });
}

function comoRespostaDaFoto(
  foto: FotoDoPerfilDeOutraPessoa,
  baseDeMidia: AbsoluteUrl,
): Record<string, unknown> {
  const base = baseDeMidia.replace(/\/$/, '');
  return {
    grid_url: `${base}/${foto.gradeKey}`,
    open_url: `${base}/${foto.abertaKey}`,
    alt_text: foto.altText,
  };
}

/** O perfil como `PersonProfile` o declara. */
export function comoResposta(
  perfil: PerfilDePessoaProjetado,
  baseDeMidia: AbsoluteUrl,
): Record<string, unknown> {
  return {
    handle: perfil.handle,
    public_ref: perfil.publicRef,
    display_name: perfil.displayName,
    pets_count: perfil.petsCount,
    connections_count: perfil.connectionsCount,
    contact_channel_verified: perfil.canalVerificado,
    connection_state: perfil.connectionState,
    connection_ref: perfil.connectionRef,
    ...(perfil.vitrine === undefined
      ? {}
      : { showcase: perfil.vitrine.map((foto) => comoRespostaDaFoto(foto, baseDeMidia)) }),
  };
}

export function registrarRotasDePessoa(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDePessoa,
): void {
  registrarRota(
    app,
    rotaDoPerfilDePessoa,
    {
      resolvedores: {
        account: async (request: FastifyRequest) => chamador(request, deps),
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { handle } = (request.params ?? {}) as CaminhoDoPerfil;
      const perfil = await deps.perfis.porApelido(await chamador(request, deps), handle);
      return reply
        .status(200)
        .header('Cache-Control', SEM_CACHE)
        .send(comoResposta(perfil, deps.baseDeMidia));
    },
  );

  const corpoDaResolucao = corpoDe(deps.contrato, rotaDaResolucaoDeConvite.operationId);
  registrarRota(
    app,
    rotaDaResolucaoDeConvite,
    {
      schema: { body: corpoDaResolucao },
      resolvedores: {
        account: async (request: FastifyRequest) => chamador(request, deps),
      },
      preValidation: [
        recusarCampoDesconhecido(corpoDaResolucao, rotaDaResolucaoDeConvite.operationId),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { invite_token: token } = request.body as { readonly invite_token: string };
      const perfil = await deps.perfis.porConvite(await chamador(request, deps), token);
      return reply
        .status(200)
        .header('Cache-Control', SEM_CACHE)
        .send(comoResposta(perfil, deps.baseDeMidia));
    },
  );
}
