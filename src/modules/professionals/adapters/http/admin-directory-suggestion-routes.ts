/**
 * `/v1/admin/directory/suggestions/...`: a FILA DE REVISAO das indicacoes do
 * `Perto` (18/10/2026).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import { defineRoute, type RateLimitEntry } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { atorAdministrativoDe } from '../../../../shared/http/superficie-administrativa.js';
import type { RevisaoDaIndicacao } from '../../domain/fila-de-indicacoes.js';
import type {
  AprovacaoDaIndicacao,
  FilaDeIndicacoes,
  RecusaDaIndicacao,
} from '../../application/fila-de-indicacoes.js';

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

export const rotaDeListarIndicacoes = defineRoute({
  operationId: 'listAdminDirectorySuggestions',
  method: 'get',
  path: '/admin/directory/suggestions',
  effects: [],
  adminRoles: ADMIN,
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeLerIndicacao = defineRoute({
  operationId: 'getAdminDirectorySuggestion',
  method: 'get',
  path: '/admin/directory/suggestions/:suggestionRef',
  effects: [],
  adminRoles: ADMIN,
});

export const rotaDeAprovarIndicacao = defineRoute({
  operationId: 'approveAdminDirectorySuggestion',
  method: 'post',
  path: '/admin/directory/suggestions/:suggestionRef/approval',
  effects: [],
  adminRoles: ADMIN,
  audit: { action: 'admin.directory_suggestion.approved', resourceKind: 'directory_suggestion' },
  rateLimit: [BALDE_DE_ESCRITA],
});

export const rotaDeRecusarIndicacao = defineRoute({
  operationId: 'declineAdminDirectorySuggestion',
  method: 'post',
  path: '/admin/directory/suggestions/:suggestionRef/decline',
  effects: [],
  adminRoles: ADMIN,
  audit: { action: 'admin.directory_suggestion.declined', resourceKind: 'directory_suggestion' },
  rateLimit: [BALDE_DE_ESCRITA],
});

export interface DependenciasDasRotasDaFilaDeIndicacoes {
  readonly fila: FilaDeIndicacoes;
  readonly contrato: Contrato;
}

const PAGINA_INICIAL = 1;
const TAMANHO_PADRAO = 50;

/**
 * `admin:`, e nao `account:`: um balde do painel e um do app nunca dividem chave
 * (ADR-0027 item 20.2).
 */
const contaDoTeto = (request: FastifyRequest): string | undefined => {
  const conta = request.sessaoAdministrativa?.adminAccountId;
  return conta === undefined ? undefined : `admin:${conta}`;
};

function referencia(request: FastifyRequest): string {
  return (request.params as Record<string, string>)['suggestionRef'] ?? '';
}

interface QueryDaFila {
  readonly review_status?: RevisaoDaIndicacao;
  readonly page?: number;
  readonly limit?: number;
}

export function registrarRotasDaFilaDeIndicacoes(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDaFilaDeIndicacoes,
): void {
  const { fila, contrato } = deps;
  const resolvedores = { account: contaDoTeto };

  registrarRota(
    app,
    rotaDeListarIndicacoes,
    { resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = (request.query ?? {}) as QueryDaFila;
      const pagina = await fila.listar({
        reviewStatus: query.review_status,
        page: query.page ?? PAGINA_INICIAL,
        limit: query.limit ?? TAMANHO_PADRAO,
      });
      return reply.send(pagina);
    },
  );

  registrarRota(app, rotaDeLerIndicacao, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await fila.ler(referencia(request)));
  });

  registrarRota(
    app,
    rotaDeAprovarIndicacao,
    { schema: { body: corpoDe(contrato, rotaDeAprovarIndicacao.operationId) }, resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { etagDaEntrada, ...corpo } = await fila.aprovar(
        atorAdministrativoDe(request),
        referencia(request),
        request.body as AprovacaoDaIndicacao,
      );
      return reply.header('ETag', etagDaEntrada).send(corpo);
    },
  );

  registrarRota(
    app,
    rotaDeRecusarIndicacao,
    { schema: { body: corpoDe(contrato, rotaDeRecusarIndicacao.operationId) }, resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return reply.send(
        await fila.recusar(
          atorAdministrativoDe(request),
          referencia(request),
          request.body as RecusaDaIndicacao,
        ),
      );
    },
  );
}
