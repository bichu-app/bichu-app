/**
 * As rotas da conexão entre pessoas (fatia F).
 *
 * ## Cinco operações, e a ausência de uma sexta é o desenho
 *
 * | | |
 * |---|---|
 * | `POST /connections` | pedir, **a partir de um convite** |
 * | `GET /connections/requests` | as duas caixas de pedidos |
 * | `GET /connections/summary` | os **números** da própria conta |
 * | `POST /connections/{ref}/acceptance` | aceitar |
 * | `DELETE /connections/{ref}` | recusar, cancelar ou desfazer |
 *
 * **Não existe `GET /connections`.** A lista de conexões não aparece a ninguém,
 * nem a quem é conectado (plano 4-B: *"Lista de conexões | nunca | nunca"*), e a
 * ausência é vigiada por `sem-lista-de-conexoes.test.ts` — que lê o contrato e
 * reprova qualquer operação nova que devolva pessoas conectadas.
 *
 * **Não existe busca de pessoas, nem "seguir", nem descoberta por link.** As
 * três foram recusadas por decisão escrita, e nenhuma delas tem rota, parâmetro
 * ou campo neste arquivo.
 *
 * ## Todas exigem conta, e o 401 vem antes de qualquer consulta
 *
 * `bearerAuth` **sem alternativa vazia** nas cinco. A coluna "sem conta" da
 * tabela 4-B é vazia inteira, e isso é arquitetura e não escolha de tela: não
 * existe rota de conexão alcançável sem conta, em estado nenhum.
 *
 * ## O que este arquivo NÃO decide
 *
 * Quem pode ver o quê é decidido na cláusula `WHERE` do repositório (ADR-0021), e
 * não aqui: não há um `if` nesta borda que escolha entre 404 e 403, e não há um
 * caminho em que 403 seja produzido. `ref` de aresta alheia, conta desabilitada
 * e par bloqueado são o mesmo 404 que `ref` inexistente.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { problemas } from '../../../../shared/http/errors.js';
import { recusarCampoDesconhecido } from '../../../../shared/http/corpo-fechado.js';
import type { Contrato } from '../../../../shared/http/contract.js';
import type { UserId } from '../../../../shared/types/brands.js';
import type { ConexaoEntrePessoas } from '../../application/conexao-entre-pessoas.js';
import type { DirecaoDoPedido } from '../../ports/connections-repository.js';

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
 * **`irreversible_write`**, e as três semânticas que ela serve justificam a
 * marca: desfazer não volta (desbloquear também não devolve a conexão) e a
 * recusa guarda o descanso de 90 dias. Com efeito não vazio, `defineRoute`
 * torna a ausência de `rateLimit` erro de compilação (ADR-0016).
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
/** Aresta é dado de duas pessoas: nada daqui entra em cache compartilhado. */
const SEM_CACHE = 'private, no-store';

export interface Autenticador {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDeConexao {
  readonly conexoes: ConexaoEntrePessoas;
  readonly autenticador: Autenticador;
  readonly contrato: Contrato;
}

interface CaminhoDaConexao {
  readonly connectionRef: string;
}

interface QueryDasCaixas {
  readonly direction?: DirecaoDoPedido;
  readonly page?: number;
  readonly limit?: number;
}

function corpoDe(contrato: Contrato, operationId: string): Record<string, unknown> {
  const schema = contrato.requestBodySchema(operationId);
  if (schema === undefined) {
    throw new Error(
      `Operação ${operationId} não declara corpo de requisição em application/json ` +
        'no contrato, mas a rota espera um. Corrija a especificação, não o código.',
    );
  }
  return schema;
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

  /**
   * Pedir. **O corpo é um convite, e o guarda de corpo fechado não é opcional.**
   *
   * O Fastify monta o Ajv com `removeAdditional: true`, então
   * `additionalProperties: false` no contrato **apaga** o campo desconhecido em
   * silêncio em vez de recusar. Aqui isso seria o pior caso possível: quem
   * mandasse `{ handle: "maria" }` receberia uma recusa genérica — ou, pior, um
   * dia receberia 201 se alguém acrescentasse um segundo campo — e acreditaria
   * que endereçar pessoa por apelido é uma coisa que este produto faz. O guarda
   * recusa o campo desconhecido com nome, e é ele que mantém "não existe caminho
   * por apelido" legível de fora.
   */
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
      const { invite_token: token } = request.body as { readonly invite_token: string };
      const conexao = await deps.conexoes.pedir(await contexto(request, deps), token);
      return reply.status(201).header('Cache-Control', SEM_CACHE).send(conexao);
    },
  );

  /** As duas caixas. `received` é o default: a tela abre no que espera decisão. */
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

  /** Só números, e só da própria conta. É o que existe no lugar da lista. */
  registrarRota(
    app,
    rotaDoResumoDeConexoes,
    { resolvedores: porConta },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const resumo = await deps.conexoes.resumo(await contexto(request, deps));
      return reply.header('Cache-Control', SEM_CACHE).send(resumo);
    },
  );

  /** Aceitar. **Sem aceite não há conexão**, e este é o único caminho que a cria. */
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

  /**
   * Recusar, cancelar ou desfazer. **204 sem corpo nas três.**
   *
   * A resposta vazia é o mecanismo, não economia: um corpo que dissesse
   * "recusado" seria o *"ela recusou você"* que o desenho recusa. Qual das três
   * aconteceu vai para a trilha.
   */
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
