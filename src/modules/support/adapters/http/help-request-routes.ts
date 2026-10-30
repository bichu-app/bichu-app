/** A rota do botao `Ajuda` do menu do usuario (29/10/2026). */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import { recusarCampoDesconhecido } from '../../../../shared/http/corpo-fechado.js';
import { problemas } from '../../../../shared/http/errors.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type {
  ChamadorDaAjuda,
  DuvidaDeAjudaService,
} from '../../application/duvida-de-ajuda-service.js';

export const rotaDeDuvidaDeAjuda = defineRoute({
  operationId: 'createMyHelpRequest',
  method: 'post',
  path: '/me/help-requests',
  effects: ['human_work'],
  rateLimit: [{ dimension: ['account'], limit: 10, window: '24h', onExceed: 'deny_429' }],
});

export interface AutenticadorDaAjuda {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDeAjuda {
  readonly duvidas: DuvidaDeAjudaService;
  readonly autenticador: AutenticadorDaAjuda;
  readonly contrato: Contrato;
}

/**
 * MEMOIZADA por requisicao, como nas rotas dos contadores: o teto por `account`
 * precisa do dono ANTES do handler, e o handler precisa do mesmo dono.
 */
function chamadorAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeAjuda,
): Promise<ChamadorDaAjuda> {
  return memoDaRequisicao(request, 'ajuda:chamador', async () => {
    const cabecalho = request.headers.authorization;
    if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
      throw problemas.naoAutenticado();
    }
    const token = cabecalho.slice('Bearer '.length).trim();
    if (token === '') throw problemas.naoAutenticado();
    const { userId } = await deps.autenticador.autenticar(token);
    return { userId };
  });
}

async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeAjuda,
): Promise<string | undefined> {
  try {
    return (await chamadorAutenticado(request, deps)).userId;
  } catch {
    return undefined;
  }
}

interface CorpoDaDuvida {
  subject: string;
  body: string;
}

export function registrarRotasDeAjuda(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDeAjuda,
): void {
  registrarRota(
    app,
    rotaDeDuvidaDeAjuda,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeDuvidaDeAjuda.operationId) },
      preValidation: [
        recusarCampoDesconhecido(
          corpoDe(deps.contrato, rotaDeDuvidaDeAjuda.operationId),
          rotaDeDuvidaDeAjuda.operationId,
        ),
      ],
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const corpo = request.body as CorpoDaDuvida;
      await deps.duvidas.registrar(chamador, corpo.subject, corpo.body);
      return reply.status(202).send({ status: 'accepted' });
    },
  );
}
