import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import { recusarCampoDesconhecido } from '../../../../shared/http/corpo-fechado.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type { Autenticador } from '../../ports/autenticador.js';
import type { EnderecoGuardadoRepository } from '../../ports/endereco-guardado.js';
import {
  comoDeliveryAddress,
  comoEnderecoDeEntrega,
  type DeliveryAddressDoContrato,
} from './endereco-de-entrega-no-contrato.js';

export const rotaDoMeuEnderecoDeEntrega = defineRoute({
  operationId: 'getMyDeliveryAddress',
  method: 'get',
  path: '/me/delivery-address',
  effects: [],
});

export const rotaDeGuardarMeuEnderecoDeEntrega = defineRoute({
  operationId: 'putMyDeliveryAddress',
  method: 'put',
  path: '/me/delivery-address',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 30, window: '1h', onExceed: 'deny_429' }],
});

export interface DependenciasDoEnderecoGuardado {
  readonly enderecos: EnderecoGuardadoRepository;
  readonly autenticador: Autenticador;
  readonly contrato: Contrato;
}

type CorpoDoEnderecoGuardado = DeliveryAddressDoContrato;

function contaDoChamador(
  request: FastifyRequest,
  deps: DependenciasDoEnderecoGuardado,
): Promise<UserId> {
  return memoDaRequisicao(request, 'endereco-guardado:chamador', async () => {
    const cabecalho = request.headers.authorization;
    if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
      throw problemas.naoAutenticado();
    }
    const token = cabecalho.slice('Bearer '.length).trim();
    if (token === '') throw problemas.naoAutenticado();
    const autenticado = await deps.autenticador.autenticar(token);
    return autenticado.userId;
  });
}

async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDoEnderecoGuardado,
): Promise<string | undefined> {
  try {
    return await contaDoChamador(request, deps);
  } catch {
    return undefined;
  }
}

export function registrarRotasDoEnderecoGuardado(
  app: RegistradorDeRotas,
  deps: DependenciasDoEnderecoGuardado,
): void {
  registrarRota(
    app,
    rotaDoMeuEnderecoDeEntrega,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      const conta = await contaDoChamador(request, deps);
      const endereco = await deps.enderecos.doChamador(conta);
      return reply.status(200).send(endereco === null ? null : comoDeliveryAddress(endereco));
    },
  );

  const corpo = corpoDe(deps.contrato, rotaDeGuardarMeuEnderecoDeEntrega.operationId);
  registrarRota(
    app,
    rotaDeGuardarMeuEnderecoDeEntrega,
    {
      schema: { body: corpo },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
      preValidation: [
        recusarCampoDesconhecido(corpo, rotaDeGuardarMeuEnderecoDeEntrega.operationId),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const conta = await contaDoChamador(request, deps);
      const guardado = await deps.enderecos.guardar(
        conta,
        comoEnderecoDeEntrega(request.body as CorpoDoEnderecoGuardado),
      );
      return reply.status(200).send(comoDeliveryAddress(guardado));
    },
  );
}
