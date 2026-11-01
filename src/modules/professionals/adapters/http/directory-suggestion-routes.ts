import type { FastifyReply, FastifyRequest } from 'fastify';

import { recusarCampoDesconhecido } from '../../../../shared/http/corpo-fechado.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import type { SugestaoDoDiretorio } from '../../application/sugestao-do-diretorio.js';
import type { CorpoDaSugestaoDoDiretorio } from '../../domain/sugestao-do-diretorio.js';
import type { RevisaoDaIndicacao } from '../../domain/fila-de-indicacoes.js';
import { chamadorAutenticado, contaDoTeto, type Autenticador } from './directory-routes.js';

/** O teto e o do contrato, COPIADO dele. */
export const rotaDaSugestaoDoDiretorio = defineRoute({
  operationId: 'suggestDirectoryEntry',
  method: 'post',
  path: '/directory/suggestions',
  effects: ['human_work'],
  rateLimit: [{ dimension: ['account'], limit: 5, window: '24h', onExceed: 'deny_429' }],
});

/** `GET /v1/directory/suggestions` — **Minhas indicacoes**. */
export const rotaDasMinhasIndicacoes = defineRoute({
  operationId: 'listMyDirectorySuggestions',
  method: 'get',
  path: '/directory/suggestions',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 300, window: '1h', onExceed: 'deny_429' }],
});

const SEM_CACHE = 'private, no-store';

const PAGINA_INICIAL = 1;
const TAMANHO_PADRAO = 20;

interface QueryDasMinhasIndicacoes {
  readonly state?: RevisaoDaIndicacao;
  readonly page?: number;
  readonly limit?: number;
}

export interface DependenciasDaRotaDeSugestao {
  readonly autenticador: Autenticador;
  readonly sugestoes: SugestaoDoDiretorio;
  /** De onde sai o esquema do corpo: a declaracao e a do contrato. */
  readonly contrato: Contrato;
}

export function registrarRotaDeSugestaoDoDiretorio(
  app: RegistradorDeRotas,
  deps: DependenciasDaRotaDeSugestao,
): void {
  const corpo = corpoDe(deps.contrato, rotaDaSugestaoDoDiretorio.operationId);
  registrarRota(
    app,
    rotaDaSugestaoDoDiretorio,
    {
      schema: { body: corpo },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
      preValidation: [recusarCampoDesconhecido(corpo, rotaDaSugestaoDoDiretorio.operationId)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const recibo = await deps.sugestoes.sugerir(
        {
          userId: chamador,
          correlationId: request.id,
          ip: request.ip,
        },
        request.body as CorpoDaSugestaoDoDiretorio,
      );
      return reply.status(201).header('Cache-Control', SEM_CACHE).send(recibo);
    },
  );
}

/** Registra o `GET`. */
export function registrarRotaDasMinhasIndicacoes(
  app: RegistradorDeRotas,
  deps: DependenciasDaRotaDeSugestao,
): void {
  registrarRota(
    app,
    rotaDasMinhasIndicacoes,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const query = (request.query ?? {}) as QueryDasMinhasIndicacoes;
      const pagina = await deps.sugestoes.minhasIndicacoes(chamador, {
        reviewStatus: query.state,
        page: query.page ?? PAGINA_INICIAL,
        limit: query.limit ?? TAMANHO_PADRAO,
      });
      return reply.header('Cache-Control', SEM_CACHE).send(pagina);
    },
  );
}
