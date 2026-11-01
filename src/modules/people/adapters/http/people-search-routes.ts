import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { problemas } from '../../../../shared/http/errors.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import type { AbsoluteUrl, UserId } from '../../../../shared/types/brands.js';
import type {
  BuscaDePessoas,
  PessoaEncontradaComEstado,
} from '../../application/busca-de-pessoas.js';

/**
 * **Os tetos são os do contrato, COPIADOS de lá**, e são DOIS — o mesmo arranjo de
 * `listDirectoryEntries`, pela mesma razão:
 */
export const rotaDaBuscaDePessoas = defineRoute({
  operationId: 'searchPeople',
  method: 'get',
  path: '/people',
  effects: ['expensive_query'],
  rateLimit: [
    { dimension: ['account'], limit: 120, window: '1h', onExceed: 'deny_429' },
    { dimension: ['account', 'q'], limit: 60, window: '1h', onExceed: 'deny_429' },
  ],
});

const PAGINA_INICIAL = 1;
const TAMANHO_PADRAO = 20;

const SEM_CACHE = 'private, no-store';

export interface Autenticador {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDeBusca {
  readonly busca: BuscaDePessoas;
  readonly autenticador: Autenticador;
  /** A raiz publica da midia, de onde a URL da foto e montada. */
  readonly baseDeMidia: AbsoluteUrl;
}

interface QueryDaBusca {
  readonly q?: string;
  readonly page?: number;
  readonly limit?: number;
}

function tokenDoCabecalho(request: FastifyRequest): string {
  const cabecalho = request.headers.authorization;
  const prefixo = 'Bearer ';
  if (cabecalho === undefined || !cabecalho.startsWith(prefixo)) throw problemas.naoAutenticado();
  return cabecalho.slice(prefixo.length);
}

async function chamador(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeBusca,
): Promise<UserId> {
  return memoDaRequisicao(request, 'people:busca:chamador', async () => {
    const { userId } = await deps.autenticador.autenticar(tokenDoCabecalho(request));
    return userId;
  });
}

/** Uma pessoa como `PersonSearchResult` a declara: **seis campos**. */
export function comoRespostaDaPessoa(
  pessoa: PessoaEncontradaComEstado,
  baseDeMidia: AbsoluteUrl,
): Record<string, unknown> {
  return {
    handle: pessoa.handle,
    display_name: pessoa.displayName,
    pets_count: pessoa.petsCount,
    connections_count: pessoa.connectionsCount,
    connection_state: pessoa.estadoDaConexao,
    photo_icon_url:
      pessoa.photoKey === null
        ? null
        : `${baseDeMidia.replace(/\/$/, '')}/${pessoa.photoKey}`,
  };
}

export function registrarRotasDeBuscaDePessoas(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDeBusca,
): void {
  registrarRota(
    app,
    rotaDaBuscaDePessoas,
    {
      resolvedores: {
        account: async (request: FastifyRequest) => chamador(request, deps),
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = (request.query ?? {}) as QueryDaBusca;
      const page = query.page ?? PAGINA_INICIAL;
      const limit = query.limit ?? TAMANHO_PADRAO;
      const pagina = await deps.busca.buscar(
        await chamador(request, deps),
        query.q,
        page,
        limit,
      );
      return reply
        .status(200)
        .header('Cache-Control', SEM_CACHE)
        .send({
          items: pagina.itens.map((pessoa) =>
            comoRespostaDaPessoa(pessoa, deps.baseDeMidia),
          ),
          total: pagina.total,
          page,
          limit,
        });
    },
  );
}
