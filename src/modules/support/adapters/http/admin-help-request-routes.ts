import type { FastifyReply, FastifyRequest } from 'fastify';

import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { defineRoute, type RateLimitEntry } from '../../../../shared/http/route-definition.js';
import { problemas } from '../../../../shared/http/errors.js';
import { atorAdministrativoDe } from '../../../../shared/http/superficie-administrativa.js';
import type {
  DuvidaNaFila,
  PaginaDaFila,
  SituacaoDaDuvida,
} from '../../ports/duvidas-de-ajuda.js';
import type { FilaDeAjudaAdministrativa } from '../../application/fila-de-ajuda-service.js';

const ADMIN = ['admin'] as const;

const PAGINA_INICIAL = 1;
const TAMANHO_PADRAO = 50;
const SITUACAO_PADRAO: SituacaoDaDuvida = 'open';

const BALDE_DE_ESCRITA = {
  bucket: 'admin_write',
  dimension: ['account'],
  limit: 120,
  window: '10m',
  onExceed: 'deny_429',
} as const satisfies RateLimitEntry;

export const rotaDeListarDuvidasDeAjuda = defineRoute({
  operationId: 'listAdminHelpRequests',
  method: 'get',
  path: '/admin/help-requests',
  effects: [],
  adminRoles: ADMIN,
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

/** MARCAR COMO ATENDIDA (cliente, 30/10/2026). */
export const rotaDeAtenderDuvida = defineRoute({
  operationId: 'attendAdminHelpRequest',
  method: 'post',
  path: '/admin/help-requests/:requestRef/attendance',
  effects: [],
  adminRoles: ADMIN,
  audit: { action: 'admin.help_request.attended', resourceKind: 'help_request' },
  rateLimit: [BALDE_DE_ESCRITA],
});

export interface DependenciasDasRotasDaFilaDeAjuda {
  readonly fila: FilaDeAjudaAdministrativa;
}

interface QueryDaFila {
  status?: SituacaoDaDuvida;
  page?: number | string;
  limit?: number | string;
}

function parametro(request: FastifyRequest, nome: string): string {
  return (request.params as Record<string, string>)[nome] ?? '';
}

function inteiroDaConsulta(valor: number | string | undefined, padrao: number): number {
  if (valor === undefined) return padrao;
  const numero = typeof valor === 'number' ? valor : Number.parseInt(valor, 10);
  return Number.isFinite(numero) ? numero : padrao;
}

function comoResposta(duvida: DuvidaNaFila): Record<string, unknown> {
  return {
    ref: duvida.ref,
    subject: duvida.assunto,
    body: duvida.texto,
    created_at: new Date(duvida.criadaEm).toISOString(),
    status: duvida.atendidaEm === undefined ? 'open' : 'attended',
    attended_at:
      duvida.atendidaEm === undefined ? null : new Date(duvida.atendidaEm).toISOString(),
    attended_by: duvida.atendidaPor ?? null,
  };
}

function comoPagina(
  pagina: PaginaDaFila,
  page: number,
  limit: number,
): Record<string, unknown> {
  return {
    items: pagina.itens.map(comoResposta),
    page,
    limit,
    total: pagina.total,
    pending_total: pagina.abertas,
  };
}

const contaDoTeto = (request: FastifyRequest): string | undefined => {
  const conta = request.sessaoAdministrativa?.adminAccountId;
  return conta === undefined ? undefined : `admin:${conta}`;
};

export function registrarRotasDaFilaDeAjuda(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDaFilaDeAjuda,
): void {
  registrarRota(
    app,
    rotaDeListarDuvidasDeAjuda,
    { resolvedores: { account: contaDoTeto } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = (request.query ?? {}) as QueryDaFila;
      const page = inteiroDaConsulta(query.page, PAGINA_INICIAL);
      const limit = inteiroDaConsulta(query.limit, TAMANHO_PADRAO);
      const pagina = await deps.fila.listar(query.status ?? SITUACAO_PADRAO, page, limit);
      return reply.send(comoPagina(pagina, page, limit));
    },
  );

  registrarRota(
    app,
    rotaDeAtenderDuvida,
    { resolvedores: { account: contaDoTeto } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const ator = atorAdministrativoDe(request);
      const duvida = await deps.fila.atender(ator, parametro(request, 'requestRef'));
      if (duvida === undefined) throw problemas.naoEncontrado();
      return reply.send(comoResposta(duvida));
    },
  );
}
