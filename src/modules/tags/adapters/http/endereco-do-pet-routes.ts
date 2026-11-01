import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import { recusarCampoDesconhecido } from '../../../../shared/http/corpo-fechado.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import type { PetId, UserId } from '../../../../shared/types/brands.js';
import type { Autenticador } from '../../ports/autenticador.js';
import type { EnderecoDoPetRepository } from '../../ports/endereco-do-pet.js';
import {
  comoDeliveryAddress,
  comoEnderecoDeEntrega,
  type DeliveryAddressDoContrato,
} from './endereco-de-entrega-no-contrato.js';

export const rotaDoEnderecoDeEntregaDoPet = defineRoute({
  operationId: 'getPetDeliveryAddress',
  method: 'get',
  path: '/pets/:petId/delivery-address',
  effects: [],
});

export const rotaDeGuardarOEnderecoDoPet = defineRoute({
  operationId: 'putPetDeliveryAddress',
  method: 'put',
  path: '/pets/:petId/delivery-address',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 30, window: '1h', onExceed: 'deny_429' }],
});

export interface DependenciasDoEnderecoDoPet {
  readonly enderecos: EnderecoDoPetRepository;
  readonly autenticador: Autenticador;
  readonly contrato: Contrato;
}

type CorpoDoEnderecoDoPet = DeliveryAddressDoContrato;

function contaDoChamador(
  request: FastifyRequest,
  deps: DependenciasDoEnderecoDoPet,
): Promise<UserId> {
  return memoDaRequisicao(request, 'endereco-do-pet:chamador', async () => {
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
  deps: DependenciasDoEnderecoDoPet,
): Promise<string | undefined> {
  try {
    return await contaDoChamador(request, deps);
  } catch {
    return undefined;
  }
}

function petIdDoCaminho(request: FastifyRequest): PetId {
  const { petId } = request.params as { petId: string };
  return petId as PetId;
}

export function registrarRotasDoEnderecoDoPet(
  app: RegistradorDeRotas,
  deps: DependenciasDoEnderecoDoPet,
): void {
  registrarRota(
    app,
    rotaDoEnderecoDeEntregaDoPet,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      const conta = await contaDoChamador(request, deps);
      const endereco = await deps.enderecos.doPetDoChamador(petIdDoCaminho(request), conta);
      if (endereco === undefined) throw problemas.naoEncontrado();
      return reply.status(200).send(endereco === null ? null : comoDeliveryAddress(endereco));
    },
  );

  const corpo = corpoDe(deps.contrato, rotaDeGuardarOEnderecoDoPet.operationId);
  registrarRota(
    app,
    rotaDeGuardarOEnderecoDoPet,
    {
      schema: { body: corpo },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
      preValidation: [recusarCampoDesconhecido(corpo, rotaDeGuardarOEnderecoDoPet.operationId)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const conta = await contaDoChamador(request, deps);
      const guardado = await deps.enderecos.guardarNoPet(
        petIdDoCaminho(request),
        conta,
        comoEnderecoDeEntrega(request.body as CorpoDoEnderecoDoPet),
      );
      if (guardado === undefined) throw problemas.naoEncontrado();
      return reply.status(200).send(comoDeliveryAddress(guardado));
    },
  );
}
