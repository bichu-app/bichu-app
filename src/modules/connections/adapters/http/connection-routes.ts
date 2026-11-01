import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { problemas } from '../../../../shared/http/errors.js';
import { recusarCampoDesconhecido } from '../../../../shared/http/corpo-fechado.js';
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import type { AbsoluteUrl, UserId } from '../../../../shared/types/brands.js';
import type { ConexaoEntrePessoas } from '../../application/conexao-entre-pessoas.js';
import type {
  DirecaoDoPedido,
  PessoaConectada,
} from '../../ports/connections-repository.js';

/** Os tetos são os do contrato, COPIADOS de lá. */
export const rotaDoPedidoDeConexao = defineRoute({
  operationId: 'requestConnection',
  method: 'post',
  path: '/connections',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDasCaixasDePedidos = defineRoute({
  operationId: 'listMyConnectionRequests',
  method: 'get',
  path: '/connections/requests',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 600, window: '1h', onExceed: 'deny_429' }],
});

/** **A lista das PRÓPRIAS conexões** (cliente, 22/10/2026). */
export const rotaDasPropriasConexoes = defineRoute({
  operationId: 'listMyConnections',
  method: 'get',
  path: '/connections',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 600, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDoResumoDeConexoes = defineRoute({
  operationId: 'getMyConnectionSummary',
  method: 'get',
  path: '/connections/summary',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 600, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDoAceiteDeConexao = defineRoute({
  operationId: 'acceptConnection',
  method: 'post',
  path: '/connections/:connectionRef/acceptance',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

/**
 * **`irreversible_write`**, e as três semânticas que ela serve justificam a marca:
 * desfazer não volta (desbloquear também não devolve a conexão) e a recusa guarda
 * o descanso de 90 dias.
 */
export const rotaDoEncerramentoDeConexao = defineRoute({
  operationId: 'endConnection',
  method: 'delete',
  path: '/connections/:connectionRef',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

const PAGINA_INICIAL = 1;
const TAMANHO_PADRAO = 20;
const DIRECAO_PADRAO: DirecaoDoPedido = 'received';
const SEM_CACHE = 'private, no-store';

export interface Autenticador {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDeConexao {
  readonly conexoes: ConexaoEntrePessoas;
  readonly autenticador: Autenticador;
  readonly contrato: Contrato;
  /**
   * A raiz pública da mídia, de onde a URL da foto é montada — **entrou em
   * 22/10/2026 com `listMyConnections`**, que é a primeira resposta de conexão a
   * carregar foto.
   */
  readonly baseDeMidia: AbsoluteUrl;
}

interface CaminhoDaConexao {
  readonly connectionRef: string;
}

interface QueryDasCaixas {
  readonly direction?: DirecaoDoPedido;
  readonly page?: number;
  readonly limit?: number;
}

interface PaginacaoSimples {
  readonly page?: number;
  readonly limit?: number;
}

/**
 * Uma conexão como `ConnectedPerson` a declara: **os CINCO campos de
 * `PersonSearchResult`** (cliente, 22/10/2026).
 */
export function comoRespostaDaConexao(
  pessoa: PessoaConectada,
  baseDeMidia: AbsoluteUrl,
): Record<string, unknown> {
  return {
    handle: pessoa.apelido,
    display_name: pessoa.nomeDeExibicao,
    pets_count: pessoa.petsCount,
    connections_count: pessoa.connectionsCount,
    photo_icon_url:
      pessoa.photoKey === null ? null : `${baseDeMidia.replace(/\/$/, '')}/${pessoa.photoKey}`,
  };
}

function tokenDoCabecalho(request: FastifyRequest): string {
  const cabecalho = request.headers.authorization;
  const prefixo = 'Bearer ';
  if (cabecalho === undefined || !cabecalho.startsWith(prefixo)) throw problemas.naoAutenticado();
  return cabecalho.slice(prefixo.length);
}

async function chamador(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeConexao,
): Promise<UserId> {
  const { userId } = await deps.autenticador.autenticar(tokenDoCabecalho(request));
  return userId;
}

async function contexto(request: FastifyRequest, deps: DependenciasDasRotasDeConexao) {
  return {
    userId: await chamador(request, deps),
    correlationId: request.id,
    ip: request.ip,
  };
}

export function registrarRotasDeConexao(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDeConexao,
): void {
  const porConta = {
    account: async (request: FastifyRequest) => chamador(request, deps),
  };

  const corpoDoPedido = corpoDe(deps.contrato, rotaDoPedidoDeConexao.operationId);
  registrarRota(
    app,
    rotaDoPedidoDeConexao,
    {
      schema: { body: corpoDoPedido },
      resolvedores: porConta,
      preValidation: [recusarCampoDesconhecido(corpoDoPedido, rotaDoPedidoDeConexao.operationId)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corpo = request.body as {
        readonly invite_token?: string;
        readonly handle?: string;
      };
      const quem = await contexto(request, deps);
      const conexao =
        corpo.invite_token === undefined
          ?
            await deps.conexoes.pedirPorApelido(quem, corpo.handle ?? '')
          : await deps.conexoes.pedir(quem, corpo.invite_token);
      return reply.status(201).header('Cache-Control', SEM_CACHE).send(conexao);
    },
  );

  registrarRota(
    app,
    rotaDasCaixasDePedidos,
    { resolvedores: porConta },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = (request.query ?? {}) as QueryDasCaixas;
      const page = query.page ?? PAGINA_INICIAL;
      const limit = query.limit ?? TAMANHO_PADRAO;
      const direction = query.direction ?? DIRECAO_PADRAO;
      const pagina = await deps.conexoes.pedidos(
        await contexto(request, deps),
        direction,
        page,
        limit,
      );
      return reply
        .header('Cache-Control', SEM_CACHE)
        .send({ items: pagina.itens, total: pagina.total, page, limit });
    },
  );

  registrarRota(
    app,
    rotaDasPropriasConexoes,
    { resolvedores: porConta },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = (request.query ?? {}) as PaginacaoSimples;
      const page = query.page ?? PAGINA_INICIAL;
      const limit = query.limit ?? TAMANHO_PADRAO;
      const pagina = await deps.conexoes.conexoes(await contexto(request, deps), page, limit);
      return reply.header('Cache-Control', SEM_CACHE).send({
        items: pagina.itens.map((pessoa) => comoRespostaDaConexao(pessoa, deps.baseDeMidia)),
        total: pagina.total,
        page,
        limit,
      });
    },
  );

  registrarRota(
    app,
    rotaDoResumoDeConexoes,
    { resolvedores: porConta },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const resumo = await deps.conexoes.resumo(await contexto(request, deps));
      return reply.header('Cache-Control', SEM_CACHE).send(resumo);
    },
  );

  registrarRota(
    app,
    rotaDoAceiteDeConexao,
    { resolvedores: porConta },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { connectionRef } = (request.params ?? {}) as CaminhoDaConexao;
      const conexao = await deps.conexoes.aceitar(await contexto(request, deps), connectionRef);
      return reply.header('Cache-Control', SEM_CACHE).send(conexao);
    },
  );

  registrarRota(
    app,
    rotaDoEncerramentoDeConexao,
    { resolvedores: porConta },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { connectionRef } = (request.params ?? {}) as CaminhoDaConexao;
      await deps.conexoes.encerrar(await contexto(request, deps), connectionRef);
      return reply.status(204).header('Cache-Control', SEM_CACHE).send();
    },
  );
}
