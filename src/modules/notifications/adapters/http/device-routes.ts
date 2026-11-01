import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import { comoIso } from '../../../../shared/time/clock.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type { Aparelho } from '../../domain/aparelho.js';
import type {
  ChamadorDoAparelho,
  RegistroDeAparelhosService,
} from '../../application/registro-de-aparelhos-service.js';

export const rotaDeListarAparelhos = defineRoute({
  operationId: 'listDevices',
  method: 'get',
  path: '/me/devices',
  effects: [],
});

export const rotaDeRegistrarAparelho = defineRoute({
  operationId: 'registerDevice',
  method: 'post',
  path: '/me/devices',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeRemoverAparelho = defineRoute({
  operationId: 'deleteDevice',
  method: 'delete',
  path: '/me/devices/:deviceId',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

export interface AutenticadorDoAparelho {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDeAparelho {
  readonly aparelhos: RegistroDeAparelhosService;
  readonly autenticador: AutenticadorDoAparelho;
  readonly contrato: Contrato;
}

interface CorpoDoRegistro {
  platform: 'android' | 'ios';
  push_token?: string | null;
  push_permission: 'granted' | 'denied' | 'not_asked';
  app_version?: string;
  os_version?: string;
}

function comoResposta(aparelho: Aparelho): Record<string, unknown> {
  return {
    id: aparelho.id,
    platform: aparelho.plataforma,
    push_permission: aparelho.permissao,
    ...(aparelho.versaoDoApp === null ? {} : { app_version: aparelho.versaoDoApp }),
    last_seen_at: comoIso(aparelho.vistoEm),
  };
}

function chamadorAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeAparelho,
): Promise<ChamadorDoAparelho> {
  return memoDaRequisicao(request, 'aparelhos:chamador', async () => {
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
  deps: DependenciasDasRotasDeAparelho,
): Promise<string | undefined> {
  try {
    return (await chamadorAutenticado(request, deps)).userId;
  } catch {
    return undefined;
  }
}

function textoOuNulo(valor: string | undefined): string | null {
  return valor === undefined || valor === '' ? null : valor;
}

export function registrarRotasDeAparelho(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDeAparelho,
): void {
  registrarRota(app, rotaDeListarAparelhos, {}, async (request, reply: FastifyReply) => {
    const chamador = await chamadorAutenticado(request, deps);
    const aparelhos = await deps.aparelhos.listar(chamador);
    return reply.status(200).send({ items: aparelhos.map(comoResposta) });
  });

  registrarRota(
    app,
    rotaDeRegistrarAparelho,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeRegistrarAparelho.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const corpo = request.body as CorpoDoRegistro;
      const aparelho = await deps.aparelhos.registrar(chamador, {
        plataforma: corpo.platform,
        pushToken: corpo.push_token ?? null,
        permissao: corpo.push_permission,
        versaoDoApp: textoOuNulo(corpo.app_version),
        versaoDoSistema: textoOuNulo(corpo.os_version),
      });
      return reply.status(200).send(comoResposta(aparelho));
    },
  );

  registrarRota(
    app,
    rotaDeRemoverAparelho,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const { deviceId } = request.params as { deviceId: string };
      const removido = await deps.aparelhos.remover(chamador, deviceId);
      if (!removido) throw problemas.naoEncontrado();
      return reply.status(204).send();
    },
  );
}
