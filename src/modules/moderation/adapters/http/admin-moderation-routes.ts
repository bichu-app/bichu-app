import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute, type RateLimitEntry } from '../../../../shared/http/route-definition.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { atorAdministrativoDe } from '../../../../shared/http/superficie-administrativa.js';
import { problemas } from '../../../../shared/http/errors.js';
import { ehOrigemDecidivel, ORIGENS_DECIDIVEIS } from '../../domain/fila-de-moderacao.js';
import type {
  FilaDeModeracao,
  MotivoDaDecisao,
} from '../../application/fila-de-moderacao.js';
import type {
  EstadoDaFila,
  OrigemDaDenuncia,
  OrigemDecidivel,
} from '../../domain/fila-de-moderacao.js';

const BALDE_DE_ESCRITA = {
  bucket: 'admin_write',
  dimension: ['account'],
  limit: 120,
  window: '10m',
  onExceed: 'deny_429',
} as const satisfies RateLimitEntry;

const ADMIN = ['admin'] as const;

export const rotaDeListarDenuncias = defineRoute({
  operationId: 'listAdminModerationReports',
  method: 'get',
  path: '/admin/moderation/reports',
  effects: [],
  adminRoles: ADMIN,
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeLerDenuncia = defineRoute({
  operationId: 'getAdminModerationReport',
  method: 'get',
  path: '/admin/moderation/reports/:origin/:targetRef',
  effects: [],
  adminRoles: ADMIN,
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

/** REMOVER O CONTEUDO: exclusao logica, com motivo obrigatorio. */
export const rotaDeRemoverConteudo = defineRoute({
  operationId: 'removeAdminModerationContent',
  method: 'post',
  path: '/admin/moderation/reports/:origin/:targetRef/removal',
  effects: [],
  adminRoles: ADMIN,
  audit: {
    action: 'admin.moderation_report.content_removed',
    resourceKind: 'moderation_report',
  },
  rateLimit: [BALDE_DE_ESCRITA],
});

/** DESCARTAR A DENUNCIA: tambem com motivo, e sem tocar o conteudo. */
export const rotaDeDescartarDenuncia = defineRoute({
  operationId: 'dismissAdminModerationReport',
  method: 'post',
  path: '/admin/moderation/reports/:origin/:targetRef/dismissal',
  effects: [],
  adminRoles: ADMIN,
  audit: { action: 'admin.moderation_report.dismissed', resourceKind: 'moderation_report' },
  rateLimit: [BALDE_DE_ESCRITA],
});

export interface DependenciasDasRotasDeModeracao {
  readonly fila: FilaDeModeracao;
  /** De onde sai o schema do corpo. */
  readonly contrato: Contrato;
}

const PAGINA_INICIAL = 1;
const TAMANHO_PADRAO = 50;

const contaDoTeto = (request: FastifyRequest): string | undefined => {
  const conta = request.sessaoAdministrativa?.adminAccountId;
  return conta === undefined ? undefined : `admin:${conta}`;
};

function parametro(request: FastifyRequest, nome: string): string {
  return (request.params as Record<string, string>)[nome] ?? '';
}

function origemDe(request: FastifyRequest): OrigemDaDenuncia {
  return parametro(request, 'origin') as OrigemDaDenuncia;
}

function origemDecidivelDe(request: FastifyRequest): OrigemDecidivel {
  const bruto = parametro(request, 'origin');
  if (ehOrigemDecidivel(bruto)) return bruto;
  throw problemas.validacao(
    [
      {
        field: 'origin',
        code: 'origin_not_supported',
        message:
          `A fila ainda não decide a origem \`${bruto}\`. As decisões valem para ` +
          `\`${ORIGENS_DECIDIVEIS.join('` e `')}\`.`,
      },
    ],
    'Esta origem aparece na fila para leitura, e a decisão dela não está construída.',
  );
}

interface QueryDaFila {
  readonly state?: EstadoDaFila;
  readonly origin?: OrigemDaDenuncia;
  readonly page?: number;
  readonly limit?: number;
}

export function registrarRotasDaFilaDeModeracao(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDeModeracao,
): void {
  const { fila, contrato } = deps;
  const resolvedores = { account: contaDoTeto };

  registrarRota(
    app,
    rotaDeListarDenuncias,
    { resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = (request.query ?? {}) as QueryDaFila;
      const pagina = await fila.listar({
        estado: query.state,
        origem: query.origin,
        page: query.page ?? PAGINA_INICIAL,
        limit: query.limit ?? TAMANHO_PADRAO,
      });
      return reply.send(pagina);
    },
  );

  registrarRota(
    app,
    rotaDeLerDenuncia,
    { resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const item = await fila.ler(origemDe(request), parametro(request, 'targetRef'));
      return reply.send(item);
    },
  );

  registrarRota(
    app,
    rotaDeRemoverConteudo,
    { schema: { body: corpoDe(contrato, rotaDeRemoverConteudo.operationId) }, resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const item = await fila.remover(
        atorAdministrativoDe(request),
        origemDecidivelDe(request),
        parametro(request, 'targetRef'),
        request.body as MotivoDaDecisao,
      );
      return reply.send(item);
    },
  );

  registrarRota(
    app,
    rotaDeDescartarDenuncia,
    { schema: { body: corpoDe(contrato, rotaDeDescartarDenuncia.operationId) }, resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const item = await fila.descartar(
        atorAdministrativoDe(request),
        origemDecidivelDe(request),
        parametro(request, 'targetRef'),
        request.body as MotivoDaDecisao,
      );
      return reply.send(item);
    },
  );
}
