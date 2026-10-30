/** Sonda de saúde. */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from './route-definition.js';
import { registrarRota, type RegistradorDeRotas } from './registrar-rota.js';
import { problemas } from './errors.js';
import { responderProblema } from './server.js';
import type { AbsoluteUrl } from '../types/brands.js';
import type { IdentidadeDoArtefato } from '../artefato/identidade-do-artefato.js';

export const rotaDeSaude = defineRoute({
  operationId: 'health',
  method: 'get',
  path: '/health',
  effects: [],
});

export interface DependenciasDaSaude {
  readonly version: string;
  /**
   * Identidade do artefato, calculada UMA VEZ na subida e não por requisição: ela
   * resume arquivos em disco, e o disco não muda debaixo de um processo em execução.
   */
  readonly build: IdentidadeDoArtefato;
  readonly problemBaseUrl: AbsoluteUrl;
  readonly verificacoes: Readonly<Record<string, () => Promise<void>>>;
}

export function registrarSaude(app: RegistradorDeRotas, deps: DependenciasDaSaude): void {
  registrarRota(app, rotaDeSaude, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const checks: Record<string, 'ok' | 'fail'> = {};
    let saudavel = true;

    for (const [nome, verificar] of Object.entries(deps.verificacoes)) {
      try {
        await verificar();
        checks[nome] = 'ok';
      } catch (erro) {
        checks[nome] = 'fail';
        saudavel = false;
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
    return reply.send({ status: 'ok', version: deps.version, build: deps.build, checks });
  });
}
