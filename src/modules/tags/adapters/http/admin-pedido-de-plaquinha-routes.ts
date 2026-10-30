/** `/v1/admin/tag-requests`: a fila dos pedidos da plaquinha da coleira. */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute, type RateLimitEntry } from '../../../../shared/http/route-definition.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { atorAdministrativoDe } from '../../../../shared/http/superficie-administrativa.js';
import type {
  DecisaoDoPedidoDePlaquinha,
  PaginaDaFilaDePlaquinhas,
  PassoAlcancavelDoPedido,
  PassoDaEntrega,
  PedidoNaFilaDePlaquinhas,
} from '../../ports/pedido-de-plaquinha.js';
import { comoDeliveryAddress } from './endereco-de-entrega-no-contrato.js';
import type { FilaDePlaquinhasAdministrativa } from '../../application/pedido-de-plaquinha-service.js';

/** D52: 120 escritas em 10 minutos por conta, somadas todas as escritas do painel. */
const BALDE_DE_ESCRITA = {
  bucket: 'admin_write',
  dimension: ['account'],
  limit: 120,
  window: '10m',
  onExceed: 'deny_429',
} as const satisfies RateLimitEntry;

const ADMIN = ['admin'] as const;

export const rotaDeListarPedidosDePlaquinha = defineRoute({
  operationId: 'listAdminCollarTagRequests',
  method: 'get',
  path: '/admin/tag-requests',
  effects: [],
  adminRoles: ADMIN,
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeAtenderPedidoDePlaquinha = defineRoute({
  operationId: 'fulfillAdminCollarTagRequest',
  method: 'post',
  path: '/admin/tag-requests/:requestRef/fulfillment',
  effects: [],
  adminRoles: ADMIN,
  audit: { action: 'admin.collar_tag_request.fulfilled', resourceKind: 'collar_tag_request' },
  rateLimit: [BALDE_DE_ESCRITA],
});

export const rotaDeRecusarPedidoDePlaquinha = defineRoute({
  operationId: 'declineAdminCollarTagRequest',
  method: 'post',
  path: '/admin/tag-requests/:requestRef/decline',
  effects: [],
  adminRoles: ADMIN,
  audit: { action: 'admin.collar_tag_request.declined', resourceKind: 'collar_tag_request' },
  rateLimit: [BALDE_DE_ESCRITA],
});

/** A leitura de UM pedido, para a tela de entrega. */
export const rotaDeLerPedidoDePlaquinha = defineRoute({
  operationId: 'getAdminCollarTagRequest',
  method: 'get',
  path: '/admin/tag-requests/:requestRef',
  effects: [],
  adminRoles: ADMIN,
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

/** A ATUALIZACAO DA ENTREGA: passo e codigo de rastreio numa escrita so. */
export const rotaDeAtualizarEntregaDaPlaquinha = defineRoute({
  operationId: 'updateAdminCollarTagRequestDelivery',
  method: 'post',
  path: '/admin/tag-requests/:requestRef/delivery',
  effects: [],
  adminRoles: ADMIN,
  audit: {
    action: 'admin.collar_tag_request.delivery_updated',
    resourceKind: 'collar_tag_request',
  },
  rateLimit: [BALDE_DE_ESCRITA],
});

export interface DependenciasDaFilaDePlaquinhas {
  readonly fila: FilaDePlaquinhasAdministrativa;
  /** De onde sai o schema do corpo da atualizacao de entrega. */
  readonly contrato: Contrato;
}

const PAGINA_INICIAL = 1;
/** 50, e nao 100: o mesmo tamanho da outra fila do painel. */
const TAMANHO_PADRAO = 50;

const contaDoTeto = (request: FastifyRequest): string | undefined => {
  const conta = request.sessaoAdministrativa?.adminAccountId;
  return conta === undefined ? undefined : `admin:${conta}`;
};

function parametro(request: FastifyRequest, nome: string): string {
  return (request.params as Record<string, string>)[nome] ?? '';
}

interface QueryDaFila {
  readonly status?: DecisaoDoPedidoDePlaquinha;
  /** O passo da entrega. COMBINA com `status`: os dois sao eixos diferentes. */
  readonly delivery_state?: PassoDaEntrega;
  readonly page?: number;
  readonly limit?: number;
}

/** O corpo de `updateAdminCollarTagRequestDelivery`, como o schema o validou. */
interface CorpoDaEntrega {
  readonly delivery_state: PassoAlcancavelDoPedido;
  /**
   * Ausente, texto ou `null`, e os tres sao pedidos diferentes -- manter, definir e
   * apagar.
   */
  readonly tracking_code?: string | null;
}

/** `AdminCollarTagRequest` como o contrato o declara. */
function comoAdminCollarTagRequest(pedido: PedidoNaFilaDePlaquinhas): Record<string, unknown> {
  return {
    ref: pedido.ref,
    pet: { display_name: pedido.petNome, species: pedido.petEspecie },
    delivery_address: comoDeliveryAddress(pedido.endereco),
    notes: pedido.observacao,
    status: pedido.status,
    requested_at: pedido.solicitadoEm.toISOString(),
    decided_at: pedido.decididoEm === null ? null : pedido.decididoEm.toISOString(),
    delivery_state: pedido.passoDaEntrega,
    tracking_code: pedido.codigoDeRastreio,
    shipped_at: pedido.despachadoEm === null ? null : pedido.despachadoEm.toISOString(),
    delivered_at: pedido.entregueEm === null ? null : pedido.entregueEm.toISOString(),
  };
}

function comoPagina(
  pagina: PaginaDaFilaDePlaquinhas,
  page: number,
  limit: number,
): Record<string, unknown> {
  return {
    items: pagina.itens.map(comoAdminCollarTagRequest),
    page,
    limit,
    total: pagina.total,
  };
}

export function registrarRotasDaFilaDePlaquinhas(
  app: RegistradorDeRotas,
  deps: DependenciasDaFilaDePlaquinhas,
): void {
  const { fila, contrato } = deps;
  const resolvedores = { account: contaDoTeto };

  registrarRota(
    app,
    rotaDeListarPedidosDePlaquinha,
    { resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = (request.query ?? {}) as QueryDaFila;
      const page = query.page ?? PAGINA_INICIAL;
      const limit = query.limit ?? TAMANHO_PADRAO;
      const pagina = await fila.listar({
        status: query.status,
        passoDaEntrega: query.delivery_state,
        page,
        limit,
      });
      return reply.send(comoPagina(pagina, page, limit));
    },
  );

  registrarRota(
    app,
    rotaDeLerPedidoDePlaquinha,
    { resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const pedido = await fila.ler(parametro(request, 'requestRef'));
      return reply.send(comoAdminCollarTagRequest(pedido));
    },
  );

  registrarRota(
    app,
    rotaDeAtualizarEntregaDaPlaquinha,
    {
      schema: { body: corpoDe(contrato, rotaDeAtualizarEntregaDaPlaquinha.operationId) },
      resolvedores,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = request.body as CorpoDaEntrega;
      const atualizado = await fila.atualizarEntrega(
        rotaDeAtualizarEntregaDaPlaquinha.audit,
        atorAdministrativoDe(request),
        parametro(request, 'requestRef'),
        corpo.delivery_state,
        corpo.tracking_code,
      );
      return reply.send(comoAdminCollarTagRequest(atualizado));
    },
  );

  registrarRota(
    app,
    rotaDeAtenderPedidoDePlaquinha,
    { resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const atendido = await fila.atender(
        rotaDeAtenderPedidoDePlaquinha.audit,
        atorAdministrativoDe(request),
        parametro(request, 'requestRef'),
      );
      return reply.send(comoAdminCollarTagRequest(atendido));
    },
  );

  registrarRota(
    app,
    rotaDeRecusarPedidoDePlaquinha,
    { resolvedores },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const recusado = await fila.recusar(
        rotaDeRecusarPedidoDePlaquinha.audit,
        atorAdministrativoDe(request),
        parametro(request, 'requestRef'),
      );
      return reply.send(comoAdminCollarTagRequest(recusado));
    },
  );
}
