import type { FastifyReply, FastifyRequest } from 'fastify';

import { problemas } from '../../../../shared/http/errors.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import type { BuscaDeCep } from '../../ports/busca-de-cep.js';

/** O teto e o do contrato, COPIADO dele. */
export const rotaDeBuscaDeCep = defineRoute({
  operationId: 'lookupAdminPostalCode',
  method: 'get',
  path: '/admin/postal-codes/:postalCode',
  effects: [],
  adminRoles: ['admin'],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

const SEM_CACHE = 'private, no-store';

export interface DependenciasDaRotaDeCep {
  readonly cep: BuscaDeCep;
}

const contaDoTeto = (request: FastifyRequest): string | undefined => {
  const conta = request.sessaoAdministrativa?.adminAccountId;
  return conta === undefined ? undefined : `admin:${conta}`;
};

export function registrarRotaDeBuscaDeCep(
  app: RegistradorDeRotas,
  deps: DependenciasDaRotaDeCep,
): void {
  registrarRota(
    app,
    rotaDeBuscaDeCep,
    { resolvedores: { account: contaDoTeto } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { postalCode } = request.params as { postalCode: string };
      const resposta = await deps.cep.buscar(postalCode);

      void reply.header('Cache-Control', SEM_CACHE);

      if (resposta.desfecho === 'naoEncontrado') throw problemas.naoEncontrado();
      if (resposta.desfecho === 'indisponivel') throw problemas.buscaDeCepIndisponivel();

      return reply.send({
        street: resposta.endereco.street,
        neighborhood: resposta.endereco.neighborhood,
        city: resposta.endereco.city,
        state: resposta.endereco.state,
      });
    },
  );
}
