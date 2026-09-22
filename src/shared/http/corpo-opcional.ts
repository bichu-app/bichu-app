/**
 * Corpo ausente em operação cujo contrato declara `requestBody` **opcional**.
 *
 * ## O defeito que este arquivo existe para impedir
 *
 * Declarar `schema: { body: ... }` numa rota é o que faz o `maxLength` do
 * contrato valer em tempo de execução. Só que o Fastify valida `request.body`
 * mesmo quando **não veio corpo nenhum**: sem `Content-Type` e sem carga, o
 * corpo é `undefined`, e `undefined` contra `{ type: 'object' }` reprova com
 * `body must be object`. Medido, não deduzido.
 *
 * Isso é aceitável onde o contrato exige corpo. Onde ele declara
 * `requestBody: { required: false }`, é uma regressão: a requisição que o
 * próprio documento chama de caminho principal passa a responder 400.
 * `createFoundReportFromTag` é o caso extremo — o contrato diz, com todas as
 * letras, que ela "precisa funcionar com corpo vazio, um toque, zero campos",
 * e é a operação mais crítica do produto.
 *
 * O gancho abaixo roda em `preValidation`, ou seja, depois de parsear e antes
 * de validar, e repõe `{}` no lugar do corpo ausente. Nada mais: corpo que veio
 * segue intacto para o validador.
 *
 * ## Por que ele confere o contrato em vez de confiar em quem o chamou
 *
 * Um gancho que repõe `{}` em rota de corpo **obrigatório** apaga a exigência
 * sem deixar rastro: o `required` do schema deixaria de acusar, e a rota
 * voltaria a aceitar a requisição vazia que a correção do `logout` existe para
 * recusar. Por isso ele lê o `required` da própria especificação e **recusa a
 * subida** quando a operação exige corpo. A porta que não se aplica não fica
 * aberta em silêncio: ela derruba a aplicação nomeando a operação.
 */
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
 *
 * @throws quando a operação não existe no contrato, não declara `requestBody`,
 * ou o declara **obrigatório** — os três casos são erro de fiação, e erro de
 * fiação derruba a subida em vez de virar comportamento silencioso.
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
