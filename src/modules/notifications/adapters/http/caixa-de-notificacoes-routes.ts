import type { FastifyReply, FastifyRequest } from 'fastify';

import type { Contrato } from '../../../../shared/http/contract.js';
import { problemas } from '../../../../shared/http/errors.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type { AvisoDaCaixa, ComunicadoDaCaixa, PaginaDaCaixa } from '../../domain/caixa.js';
import type {
  CaixaDeNotificacoesService,
  ChamadorDaCaixa,
} from '../../application/caixa-de-notificacoes-service.js';

export const rotaDeListarNotificacoes = defineRoute({
  operationId: 'listNotifications',
  method: 'get',
  path: '/me/notifications',
  effects: [],
});

export const rotaDeContarNotificacoes = defineRoute({
  operationId: 'getNotificationCount',
  method: 'get',
  path: '/me/notifications/count',
  effects: [],
});

export const rotaDeListaVista = defineRoute({
  operationId: 'markNotificationsListSeen',
  method: 'post',
  path: '/me/notifications/seen',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 240, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeMarcarTodasLidas = defineRoute({
  operationId: 'markAllNotificationsRead',
  method: 'post',
  path: '/me/notifications/read-all',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeMarcarLida = defineRoute({
  operationId: 'markNotificationRead',
  method: 'post',
  path: '/me/notifications/:notificationRef/read',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 600, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeDispensar = defineRoute({
  operationId: 'dismissNotification',
  method: 'post',
  path: '/me/notifications/:notificationRef/dismiss',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 600, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDoComunicado = defineRoute({
  operationId: 'getMyBroadcast',
  method: 'get',
  path: '/me/broadcasts/:broadcastRef',
  effects: [],
});

export interface AutenticadorDaCaixa {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDaCaixa {
  readonly caixa: CaixaDeNotificacoesService;
  readonly autenticador: AutenticadorDaCaixa;
  readonly contrato: Contrato;
}

function comoResposta(aviso: AvisoDaCaixa): Record<string, unknown> {
  return {
    ref: aviso.ref,
    kind: aviso.tipo,
    subject: aviso.assunto,
    occurred_at: aviso.aconteceuEm.toISOString(),
    read: aviso.lido,
    grouped_count: aviso.agrupados,
    destination: aviso.destino,
    destination_ref: aviso.destinoRef,
  };
}

function comunicadoComoResposta(c: ComunicadoDaCaixa): Record<string, unknown> {
  return {
    ref: c.ref,
    title: c.titulo,
    body: c.corpo,
    dispatched_at: c.disparadoEm.toISOString(),
  };
}

function paginaComoResposta(pagina: PaginaDaCaixa): Record<string, unknown> {
  return {
    items: pagina.itens.map(comoResposta),
    page: pagina.pagina,
    limit: pagina.limite,
    total: pagina.total,
    unread_total: pagina.naoLidos,
  };
}

function chamadorAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDaCaixa,
): Promise<ChamadorDaCaixa> {
  return memoDaRequisicao(request, 'caixa:chamador', async () => {
    const cabecalho = request.headers.authorization;
    if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
      throw problemas.naoAutenticado();
    }
    const token = cabecalho.slice('Bearer '.length).trim();
    if (token === '') throw problemas.naoAutenticado();
    const { userId } = await deps.autenticador.autenticar(token);
    return { userId };
  });
}

async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDaCaixa,
): Promise<string | undefined> {
  try {
    return (await chamadorAutenticado(request, deps)).userId;
  } catch {
    return undefined;
  }
}

interface BuscaDaListagem {
  page?: number;
  limit?: number;
}

export function registrarRotasDaCaixaDeNotificacoes(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDaCaixa,
): void {
  registrarRota(app, rotaDeListarNotificacoes, {}, async (request, reply: FastifyReply) => {
    const chamador = await chamadorAutenticado(request, deps);
    const busca = request.query as BuscaDaListagem;
    const pagina = await deps.caixa.listar(chamador, {
      ...(busca.page === undefined ? {} : { pagina: busca.page }),
      ...(busca.limit === undefined ? {} : { limite: busca.limit }),
    });
    return reply.status(200).send(paginaComoResposta(pagina));
  });

  registrarRota(app, rotaDeContarNotificacoes, {}, async (request, reply: FastifyReply) => {
    const chamador = await chamadorAutenticado(request, deps);
    const total = await deps.caixa.contar(chamador);
    return reply.status(200).send({ unread_total: total });
  });

  registrarRota(
    app,
    rotaDeListaVista,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      await deps.caixa.listaVista(chamador);
      return reply.status(204).send();
    },
  );

  registrarRota(
    app,
    rotaDeMarcarTodasLidas,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const marcadas = await deps.caixa.marcarTodasLidas(chamador);
      return reply.status(200).send({ marked: marcadas });
    },
  );

  registrarRota(
    app,
    rotaDeMarcarLida,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const { notificationRef } = request.params as { notificationRef: string };
      await deps.caixa.marcarLida(chamador, notificationRef);
      return reply.status(204).send();
    },
  );

  registrarRota(
    app,
    rotaDeDispensar,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const { notificationRef } = request.params as { notificationRef: string };
      await deps.caixa.dispensar(chamador, notificationRef);
      return reply.status(204).send();
    },
  );

  registrarRota(app, rotaDoComunicado, {}, async (request, reply: FastifyReply) => {
    const chamador = await chamadorAutenticado(request, deps);
    const { broadcastRef } = request.params as { broadcastRef: string };
    const comunicado = await deps.caixa.buscarComunicado(chamador, broadcastRef);
    return reply.status(200).send(comunicadoComoResposta(comunicado));
  });
}
