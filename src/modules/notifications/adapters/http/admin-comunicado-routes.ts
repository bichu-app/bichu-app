/**
 * `/v1/admin/broadcasts/...`: o COMUNICADO -- o unico aviso do produto com alcance
 * total.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { defineRoute, type RateLimitEntry } from '../../../../shared/http/route-definition.js';
import { atorAdministrativoDe } from '../../../../shared/http/superficie-administrativa.js';
import type { Comunicado, JanelaDeDisparo, PaginaDeComunicados } from '../../domain/comunicado.js';
import type { ComunicadosAdministrativos } from '../../application/comunicados-administrativos.js';

/**
 * D52: 120 escritas em 10 minutos por conta, somadas todas as escritas
 * administrativas.
 */
const BALDE_DE_ESCRITA = {
  bucket: 'admin_write',
  dimension: ['account'],
  limit: 120,
  window: '10m',
  onExceed: 'deny_429',
} as const satisfies RateLimitEntry;

const ADMIN = ['admin'] as const;

export const rotaDeListarComunicados = defineRoute({
  operationId: 'listAdminBroadcasts',
  method: 'get',
  path: '/admin/broadcasts',
  effects: [],
  adminRoles: ADMIN,
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeDispararComunicado = defineRoute({
  operationId: 'dispatchAdminBroadcast',
  method: 'post',
  path: '/admin/broadcasts',
  effects: ['notifies', 'irreversible_write'],
  adminRoles: ADMIN,
  audit: { action: 'admin.broadcast.dispatched', resourceKind: 'broadcast' },
  rateLimit: [BALDE_DE_ESCRITA],
});

export const rotaDaJanelaDeDisparo = defineRoute({
  operationId: 'getAdminBroadcastDispatchWindow',
  method: 'get',
  path: '/admin/broadcasts/dispatch-window',
  effects: [],
  adminRoles: ADMIN,
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

export interface DependenciasDasRotasDeComunicado {
  readonly comunicados: ComunicadosAdministrativos;
  readonly contrato: Contrato;
}

interface CorpoDoRascunho {
  title: string;
  body: string;
}

interface QueryDaLista {
  readonly page?: number;
  readonly limit?: number;
}

/**
 * `admin:`, e nao `account:`: um balde do painel e um do app nunca dividem chave
 * (ADR-0027 item 20.2).
 */
const contaDoTeto = (request: FastifyRequest): string | undefined => {
  const conta = request.sessaoAdministrativa?.adminAccountId;
  return conta === undefined ? undefined : `admin:${conta}`;
};

/** Um comunicado, campo a campo, exatamente como `AdminBroadcast` o declara. */
function comoResposta(c: Comunicado): Record<string, unknown> {
  return {
    ref: c.ref,
    title: c.titulo,
    body: c.corpo,
    dispatched_at: c.disparadoEm.toISOString(),
    dispatched_by: c.disparadoPor,
    recipients_total: c.destinatarios,
  };
}

function paginaComoResposta(p: PaginaDeComunicados): Record<string, unknown> {
  return {
    items: p.itens.map(comoResposta),
    page: p.pagina,
    limit: p.limite,
    total: p.total,
  };
}

function janelaComoResposta(j: JanelaDeDisparo): Record<string, unknown> {
  return {
    would_reach: j.alcancaria,
    remaining_today: j.restamHoje,
    daily_cap: j.tetoDiario,
  };
}

export function registrarRotasDeComunicado(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDeComunicado,
): void {
  const { comunicados, contrato } = deps;
  const resolvedores = { account: contaDoTeto };

  registrarRota(
    app,
    rotaDeListarComunicados,
    { resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = (request.query ?? {}) as QueryDaLista;
      const pagina = await comunicados.listar({
        ...(query.page === undefined ? {} : { pagina: query.page }),
        ...(query.limit === undefined ? {} : { limite: query.limit }),
      });
      return reply.status(200).send(paginaComoResposta(pagina));
    },
  );

  registrarRota(
    app,
    rotaDaJanelaDeDisparo,
    { resolvedores },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const janela = await comunicados.janelaDeDisparo();
      return reply.status(200).send(janelaComoResposta(janela));
    },
  );

  registrarRota(
    app,
    rotaDeDispararComunicado,
    {
      schema: { body: corpoDe(contrato, rotaDeDispararComunicado.operationId) },
      resolvedores,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = request.body as CorpoDoRascunho;
      const comunicado = await comunicados.disparar(
        rotaDeDispararComunicado.audit,
        atorAdministrativoDe(request),
        { titulo: corpo.title, corpo: corpo.body },
      );
      return reply.status(201).send(comoResposta(comunicado));
    },
  );
}
