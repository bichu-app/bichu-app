import type { FastifyReply, FastifyRequest } from 'fastify';

import type { Contrato } from './contract.js';

/** Assinatura de gancho do Fastify, na forma com callback. */
export type GanchoDeCorpo = (
  request: FastifyRequest,
  reply: FastifyReply,
  pronto: (erro?: Error) => void,
) => void;

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/**
 * Gancho de `preValidation` que trata corpo ausente como corpo vazio.
 * @throws quando a operação não existe no contrato, não declara `requestBody`, ou
 * o declara **obrigatório** — os três casos são erro de fiação, e erro de fiação
 * derruba a subida em vez de virar comportamento silencioso.
 */
export function corpoAusenteEhCorpoVazio(
  contrato: Contrato,
  operationId: string,
): GanchoDeCorpo {
  const operacao = contrato.operacoes.get(operationId);
  if (operacao === undefined) {
    throw new Error(
      `Operação ${operationId} não existe no contrato, e uma rota tenta tratar ` +
        `o corpo ausente dela. Confira o operationId.`,
    );
  }
  const requestBody = operacao.raw['requestBody'];
  if (!ehObjeto(requestBody)) {
    throw new Error(
      `Operação ${operationId} não declara requestBody no contrato, e uma rota ` +
        `tenta tratar o corpo ausente dela. Corrija a especificação, não o código.`,
    );
  }
  if (requestBody['required'] === true) {
    throw new Error(
      `Operação ${operationId} declara requestBody OBRIGATÓRIO no contrato. ` +
        `Tratar o corpo ausente como corpo vazio aqui apagaria a exigência sem ` +
        `deixar rastro: a rota voltaria a aceitar a requisição que o contrato recusa.`,
    );
  }

  return (request, _reply, pronto) => {
    if (request.body === undefined || request.body === null) {
      request.body = {};
    }
    pronto();
  };
}
