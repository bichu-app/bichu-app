import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { ListagemPublicaDePerdidosService } from '../../application/listagem-publica-de-perdidos.js';
import type { EspecieDoCaso, PorteDoCaso } from '../../ports/leitura-publica-do-caso.js';
import type { JanelaDePerdidos } from '../../ports/listagem-publica-de-perdidos.js';
import type { EstadoDoCasoPedido } from '../../application/listagem-publica-de-perdidos.js';

export const rotaDaListagemDePerdidos = defineRoute({
  operationId: 'listPublicLostPets',
  method: 'get',
  path: '/public/lost-pets',
  effects: ['expensive_query'],
  rateLimit: [
    { dimension: ['ip'], limit: 120, window: '1h', onExceed: 'challenge' },
    { dimension: ['ip'], limit: 600, window: '24h', onExceed: 'challenge' },
    { dimension: ['ip', 'q'], limit: 30, window: '1h', onExceed: 'challenge' },
  ],
});

export interface DependenciasDaListagemDePerdidos {
  readonly listagem: ListagemPublicaDePerdidosService;
}

interface QueryDePerdidos {
  readonly case_state?: EstadoDoCasoPedido | undefined;
  readonly city?: string | undefined;
  readonly neighborhood?: string | undefined;
  readonly species?: EspecieDoCaso | undefined;
  readonly size?: PorteDoCaso | undefined;
  readonly period?: JanelaDePerdidos | undefined;
  readonly q?: string | undefined;
  readonly page?: number | undefined;
  readonly limit?: number | undefined;
}

export function registrarRotaDaListagemDePerdidos(
  app: RegistradorDeRotas,
  deps: DependenciasDaListagemDePerdidos,
): void {
  registrarRota(
    app,
    rotaDaListagemDePerdidos,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      void reply.header('X-Robots-Tag', 'noindex, nofollow');
      void reply.header('Referrer-Policy', 'no-referrer');
      void reply.header('Cache-Control', 'no-store');

      const query = (request.query ?? {}) as QueryDePerdidos;
      const corpo = await deps.listagem.pagina({
        caseState: query.case_state,
        city: query.city,
        neighborhood: query.neighborhood,
        species: query.species,
        size: query.size,
        period: query.period,
        q: query.q,
        page: query.page,
        limit: query.limit,
      });
      return reply.status(200).send(corpo);
    },
  );
}
