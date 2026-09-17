/**
 * Sonda de saúde.
 *
 * Única operação pública sem teto de chamadas, e a ausência é deliberada: quem
 * chama é a sonda do balanceador e do orquestrador, e limitar a sonda faz o
 * serviço ser tirado de rotação justamente sob carga, que é quando ele precisa
 * continuar respondendo.
 *
 * A proteção aqui é **não expor nada**: sem versão de dependência, sem nome de
 * host, sem string de conexão, sem contagem de registro. E a sonda toca o banco
 * de verdade — sonda que não sonda nada sempre responde que está tudo bem.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from './route-definition.js';
import { problemas } from './errors.js';
import { responderProblema } from './server.js';
import type { AbsoluteUrl } from '../types/brands.js';

export const rotaDeSaude = defineRoute({
  operationId: 'health',
  method: 'get',
  path: '/health',
  effects: [],
});

export interface DependenciasDaSaude {
  readonly version: string;
  readonly problemBaseUrl: AbsoluteUrl;
  readonly verificacoes: Readonly<Record<string, () => Promise<void>>>;
}

export function registrarSaude(app: FastifyInstance, deps: DependenciasDaSaude): void {
  app.get(rotaDeSaude.path, async (request: FastifyRequest, reply: FastifyReply) => {
    const checks: Record<string, 'ok' | 'fail'> = {};
    let saudavel = true;

    for (const [nome, verificar] of Object.entries(deps.verificacoes)) {
      try {
        await verificar();
        checks[nome] = 'ok';
      } catch (erro) {
        checks[nome] = 'fail';
        saudavel = false;
        // O motivo vai para o log, nunca para a resposta.
        request.log.error({ err: erro, check: nome }, 'verificação de saúde falhou');
      }
    }

    if (!saudavel) {
      return responderProblema(
        request,
        reply,
        problemas.sondaIndisponivel(),
        deps.problemBaseUrl,
      );
    }
    return reply.send({ status: 'ok', version: deps.version, checks });
  });
}
