/** As DUAS rotas dos contadores das abas `Pets` e `Rede` (BICHUS-278). */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import { problemas } from '../../../../shared/http/errors.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { recusarCampoDesconhecido } from '../../../../shared/http/corpo-fechado.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type {
  ChamadorDosContadores,
  ContadoresDeSecaoService,
} from '../../application/contadores-de-secao-service.js';
import type { ContadoresDeSecao } from '../../ports/contadores-de-secao.js';
import type { SecaoComContador } from '../../ports/marcadores-de-secao.js';

export const rotaDeContadoresDeSecao = defineRoute({
  operationId: 'getSectionCounters',
  method: 'get',
  path: '/me/section-counters',
  effects: [],
});

/**
 * `effects` vazio E teto declarado, como `markMyConversationsSeen`: a regra de
 * `x-effects` e piso e nao teto.
 */
export const rotaDeSecaoVista = defineRoute({
  operationId: 'markMySectionSeen',
  method: 'post',
  path: '/me/sections-seen',
  effects: [],
  rateLimit: [
    { dimension: ['account'], limit: 240, window: '1h', onExceed: 'accept_and_deduplicate' },
  ],
});

export interface AutenticadorDosContadores {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDosContadores {
  readonly contadores: ContadoresDeSecaoService;
  readonly autenticador: AutenticadorDosContadores;
  readonly contrato: Contrato;
}

/** A resposta, campo a campo e nunca por espalhamento. */
function comoResposta(contadores: ContadoresDeSecao): Record<string, unknown> {
  return {
    lost_pets_new: contadores.perdidosNovos,
    network_events_new: contadores.eventosNovos,
    network_directory_new: contadores.profissionaisNovos,
  };
}

/**
 * MEMOIZADA por requisicao, como nas rotas da caixa: o teto por `account` precisa
 * do dono antes do handler, e o handler precisa do mesmo dono.
 */
function chamadorAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDosContadores,
): Promise<ChamadorDosContadores> {
  return memoDaRequisicao(request, 'contadores:chamador', async () => {
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
  deps: DependenciasDasRotasDosContadores,
): Promise<string | undefined> {
  try {
    return (await chamadorAutenticado(request, deps)).userId;
  } catch {
    return undefined;
  }
}

interface BuscaDosContadores {
  city?: string;
}

interface CorpoDaSecaoVista {
  section: SecaoComContador;
  city?: string;
}

export function registrarRotasDosContadoresDeSecao(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDosContadores,
): void {
  registrarRota(app, rotaDeContadoresDeSecao, {}, async (request, reply: FastifyReply) => {
    const chamador = await chamadorAutenticado(request, deps);
    const busca = request.query as BuscaDosContadores;
    const contadores = await deps.contadores.contar(chamador, busca.city);
    return reply.status(200).send(comoResposta(contadores));
  });

  registrarRota(
    app,
    rotaDeSecaoVista,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeSecaoVista.operationId) },
      preValidation: [
        recusarCampoDesconhecido(
          corpoDe(deps.contrato, rotaDeSecaoVista.operationId),
          rotaDeSecaoVista.operationId,
        ),
      ],
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const corpo = request.body as CorpoDaSecaoVista;
      const contadores = await deps.contadores.marcarVista(chamador, corpo.section, corpo.city);
      return reply.status(200).send(comoResposta(contadores));
    },
  );
}
