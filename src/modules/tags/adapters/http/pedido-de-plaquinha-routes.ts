import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { problemas } from '../../../../shared/http/errors.js';
import { recusarCampoDesconhecido } from '../../../../shared/http/corpo-fechado.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import type { PetId, UserId } from '../../../../shared/types/brands.js';
import type { Autenticador } from '../../ports/autenticador.js';
import type { PedidoDoTutor } from '../../ports/pedido-de-plaquinha.js';
import {
  comoEnderecoDeEntrega,
  type DeliveryAddressDoContrato,
} from './endereco-de-entrega-no-contrato.js';
import type { PedidoDePlaquinhaService } from '../../application/pedido-de-plaquinha-service.js';

export const rotaDePedidoDePlaquinha = defineRoute({
  operationId: 'requestCollarTag',
  method: 'post',
  path: '/pets/:petId/tag-requests',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 3, window: '24h', onExceed: 'deny_429' }],
});

/** `GET /v1/pets/{petId}/tag-requests`: a leitura da pagina de acompanhamento. */
export const rotaDeLerPedidosDePlaquinhaDoPet = defineRoute({
  operationId: 'listCollarTagRequests',
  method: 'get',
  path: '/pets/:petId/tag-requests',
  effects: [],
});

export interface DependenciasDoPedidoDePlaquinha {
  readonly pedidos: PedidoDePlaquinhaService;
  readonly autenticador: Autenticador;
  readonly contrato: Contrato;
}

async function contaDoChamador(
  request: FastifyRequest,
  deps: DependenciasDoPedidoDePlaquinha,
): Promise<UserId> {
  const cabecalho = request.headers.authorization;
  if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
    throw problemas.naoAutenticado();
  }
  const token = cabecalho.slice('Bearer '.length).trim();
  if (token === '') throw problemas.naoAutenticado();
  const autenticado = await deps.autenticador.autenticar(token);
  return autenticado.userId;
}

function petIdDoCaminho(request: FastifyRequest): PetId {
  const { petId } = request.params as { petId: string };
  return petId as PetId;
}

async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDoPedidoDePlaquinha,
): Promise<string | undefined> {
  try {
    return await contaDoChamador(request, deps);
  } catch {
    return undefined;
  }
}

interface CorpoDoPedido {
  readonly delivery_address: DeliveryAddressDoContrato;
  readonly notes?: string;
}

function comoCollarTagRequest(pedido: PedidoDoTutor): Record<string, unknown> {
  return {
    ref: pedido.ref,
    status: pedido.status,
    requested_at: pedido.solicitadoEm.toISOString(),
    decided_at: pedido.decididoEm === null ? null : pedido.decididoEm.toISOString(),
    notes: pedido.observacao,
    delivery_state: pedido.passoDaEntrega,
    tracking_code: pedido.codigoDeRastreio,
    shipped_at: pedido.despachadoEm === null ? null : pedido.despachadoEm.toISOString(),
    delivered_at: pedido.entregueEm === null ? null : pedido.entregueEm.toISOString(),
  };
}

export function registrarRotaDePedidoDePlaquinha(
  app: RegistradorDeRotas,
  deps: DependenciasDoPedidoDePlaquinha,
): void {
  const corpo = corpoDe(deps.contrato, rotaDePedidoDePlaquinha.operationId);
  registrarRota(
    app,
    rotaDePedidoDePlaquinha,
    {
      schema: { body: corpo },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
      preValidation: [recusarCampoDesconhecido(corpo, rotaDePedidoDePlaquinha.operationId)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const conta = await contaDoChamador(request, deps);
      const corpo = request.body as CorpoDoPedido;
      const pedido = await deps.pedidos.pedir(
        petIdDoCaminho(request),
        conta,
        comoEnderecoDeEntrega(corpo.delivery_address),
        corpo.notes ?? null,
      );
      return reply.status(200).send(comoCollarTagRequest(pedido));
    },
  );

  registrarRota(
    app,
    rotaDeLerPedidosDePlaquinhaDoPet,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      const conta = await contaDoChamador(request, deps);
      const pedidos = await deps.pedidos.listarDoPet(petIdDoCaminho(request), conta);
      return reply.send({ items: pedidos.map(comoCollarTagRequest) });
    },
  );
}
