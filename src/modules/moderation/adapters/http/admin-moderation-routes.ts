/** `/v1/admin/moderation/reports`: a FILA DE MODERACAO do painel. */
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

/** D52: 120 escritas em 10 minutos por conta, somadas todas as escritas do painel. */
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
/** 50, o mesmo tamanho das outras filas do painel. */
const TAMANHO_PADRAO = 50;

const contaDoTeto = (request: FastifyRequest): string | undefined => {
  const conta = request.sessaoAdministrativa?.adminAccountId;
  return conta === undefined ? undefined : `admin:${conta}`;
};

function parametro(request: FastifyRequest, nome: string): string {
  return (request.params as Record<string, string>)[nome] ?? '';
}

/**
 * A origem da LEITURA, como o contrato a validou.
 *
 * O `enum` do caminho **e** conferido antes de chegar aqui:
 * `validacao-de-parametros.ts` instala o schema de `params` do contrato em
 * toda rota registrada, e valor fora dos cinco responde `400` sem entrar nesta
 * funcao (medido em 31/10/2026: `origin=banana` da `400 validation-failed`).
 * O que o contrato NAO podia conferir e quais dos cinco esta casa sabe
 * decidir.
 */
function origemDe(request: FastifyRequest): OrigemDaDenuncia {
  return parametro(request, 'origin') as OrigemDaDenuncia;
}

/**
 * **A origem da DECISAO, estreitada aqui e em nenhum outro lugar.**
 *
 * ===========================================================================
 * POR QUE `400` E NAO `404`, E POR QUE NAO 501
 * ===========================================================================
 * `profile`, `photo` e `publication` APARECEM na fila: a visao
 * `fila_de_moderacao` tem as cinco pernas, `listAdminModerationReports`
 * devolve o item e `getAdminModerationReport` o le -- as tres coisas medidas
 * em 31/10 com uma denuncia de perfil de verdade. Responder `404` na decisao
 * diria "nao existe" sobre um item que a tela ao lado mostra, que e pior que
 * dizer o que de fato acontece: a decisao desta origem nao esta construida.
 *
 * `501` nao entra porque **nenhuma das tres operacoes o declara**, e
 * responder status que o contrato nao promete e o mesmo tipo de divergencia
 * que esta tarefa conserta. `400 validation-failed` e declarado nas tres, e o
 * `code` de `ProblemFieldError` e cadeia livre no contrato -- nao ha mudanca
 * de contrato nenhuma aqui.
 *
 * **O que esta recusa NAO decide**: se as tres ganham implementacao ou se
 * `ModerationOrigin` encolhe para duas. Encolher apaga capacidade prometida a
 * quatro consumidores, e e decisao do cliente.
 */
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
