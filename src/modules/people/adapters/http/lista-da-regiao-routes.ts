import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { problemas } from '../../../../shared/http/errors.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type {
  ListaDaRegiao,
  PessoaDaRegiaoComEstado,
} from '../../application/lista-da-regiao.js';

/**
 * **O teto é o do contrato, COPIADO de lá**, e é UM e não dois: a busca tem o
 * segundo (`[account, q]`) porque ela tem um `q`; esta rota não aceita termo
 * nenhum, e um teto por dimensão que não existe não teria balde.
 *
 * **60/h, medido na RÉGUA da busca e não escolhido**: `searchPeople` tem 120/h
 * de rota por conta, e aquele número cobre a chamada POR TECLA (a tela busca a
 * cada 400 ms de pausa). Aqui não há tecla, e cada requisição entrega 20
 * registros GARANTIDOS.
 */
export const rotaDaListaDaRegiao = defineRoute({
  operationId: 'listPeopleInMyRegion',
  method: 'get',
  path: '/region/people',
  effects: ['expensive_query'],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

const PAGINA_INICIAL = 1;
const TAMANHO_PADRAO = 20;

/**
 * **`no-store`, e não é zelo**: a adesão é revogável e desligar vale na hora.
 * Uma resposta guardada em qualquer lugar manteria na tela de alguém uma pessoa
 * que acabou de sair da lista.
 */
const SEM_CACHE = 'private, no-store';

export interface Autenticador {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDaListaDaRegiao {
  readonly lista: ListaDaRegiao;
  readonly autenticador: Autenticador;
}

interface QueryDaLista {
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
  deps: DependenciasDaListaDaRegiao,
): Promise<UserId> {
  return memoDaRequisicao(request, 'people:regiao:chamador', async () => {
    const { userId } = await deps.autenticador.autenticar(tokenDoCabecalho(request));
    return userId;
  });
}

/**
 * Uma pessoa como `RegionPerson` a declara: **cinco campos**.
 *
 * **Não há `photo_icon_url` aqui, e nem haveria de onde tirá-lo**:
 * `PessoaDaRegiao` não carrega chave de foto nenhuma, então a ausência é
 * estrutural e não uma linha que alguém possa acrescentar sem mexer na porta.
 */
export function comoRespostaDaPessoaDaRegiao(
  pessoa: PessoaDaRegiaoComEstado,
): Record<string, unknown> {
  return {
    handle: pessoa.handle,
    display_name: pessoa.displayName,
    pets_count: pessoa.petsCount,
    connections_count: pessoa.connectionsCount,
    connection_state: pessoa.estadoDaConexao,
  };
}

export function registrarRotasDaListaDaRegiao(
  app: RegistradorDeRotas,
  deps: DependenciasDaListaDaRegiao,
): void {
  registrarRota(
    app,
    rotaDaListaDaRegiao,
    {
      resolvedores: {
        account: async (request: FastifyRequest) => chamador(request, deps),
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = (request.query ?? {}) as QueryDaLista;
      const page = query.page ?? PAGINA_INICIAL;
      const limit = query.limit ?? TAMANHO_PADRAO;
      const pagina = await deps.lista.listar(await chamador(request, deps), page, limit);
      return reply
        .status(200)
        .header('Cache-Control', SEM_CACHE)
        .send({
          items: pagina.itens.map(comoRespostaDaPessoaDaRegiao),
          total: pagina.total,
          page,
          limit,
        });
    },
  );
}
