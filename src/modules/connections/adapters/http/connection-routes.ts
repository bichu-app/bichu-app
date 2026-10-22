/**
 * As rotas da conexão entre pessoas (fatia F).
 *
 * ## Cinco operações, e a ausência de uma sexta é o desenho
 *
 * | | |
 * |---|---|
 * | `POST /connections` | pedir, **por convite ou por apelido** |
 * | `GET /connections/requests` | as duas caixas de pedidos |
 * | `GET /connections/summary` | os **números** da própria conta |
 * | `POST /connections/{ref}/acceptance` | aceitar |
 * | `DELETE /connections/{ref}` | recusar, cancelar ou desfazer |
 *
 * **Continuam sendo CINCO**, e isso não é coincidência: a decisão do cliente de
 * 20/10/2026 acrescentou um **caminho** a `requestConnection`, não uma operação.
 * `conexao-nao-expoe-lista-nem-identificador.test.ts` cobra o número exato, e as
 * operações do convite ficaram na etiqueta `connection-invites` justamente para
 * não afrouxá-lo.
 *
 * **Não existe `GET /connections`.** A lista de conexões não aparece a ninguém,
 * nem a quem é conectado (plano 4-B: *"Lista de conexões | nunca | nunca"*), e a
 * ausência é vigiada por `conexao-nao-expoe-lista-nem-identificador.test.ts` —
 * que lê o contrato e reprova qualquer operação nova com esta etiqueta.
 *
 * **O nome do portão estava errado neste cabeçalho até 20/10/2026**: ele citava
 * um `sem-lista-de-conexoes.test.ts` que **nunca existiu** em nenhuma ref deste
 * repositório (conferido em 20/10/2026 contra `70f4aa34`). O portão existe e
 * funciona, com outro nome; a citação errada é pior que nenhuma, porque mandava
 * quem fosse conferir procurar um arquivo ausente e concluir que não havia
 * portão. A emenda 2 do ADR-0010 repete o nome errado, e ela precisa da mesma
 * correção — está no relatório da entrega.
 *
 * **Não existe "seguir"**, e isso não mudou: timeline de quem se segue é a lista
 * de presença com hora, e o ADR-0025 já a recusou (`20261018000030`:
 * *"Encerrado, não se reabre"*).
 *
 * **A busca de pessoas PASSOU A EXISTIR** em 20/10/2026, por decisão do cliente,
 * e ela **não** está aqui: é `GET /v1/people`, da etiqueta `people`. Este
 * arquivo recebe um apelido já escolhido — ele não lista e não casa texto.
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
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
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
   * Pedir. **O corpo carrega UMA das duas credenciais**, e o guarda de corpo
   * fechado continua não sendo opcional.
   *
   * O Fastify monta o Ajv com `removeAdditional: true`, então
   * `additionalProperties: false` no contrato **apaga** o campo desconhecido em
   * silêncio em vez de recusar. O guarda recusa o campo desconhecido com nome, e
   * desde 20/10/2026 ele serve a um propósito diferente do de antes: antes ele
   * mantinha *"não existe caminho por apelido"* legível de fora; agora ele
   * mantém legível que existem **exatamente dois** caminhos e não um terceiro.
   *
   * **`oneOf` no contrato, e a escolha aqui é pelo campo presente.** Corpo com
   * os dois, ou com nenhum, é recusado pelo esquema antes de chegar ao
   * manipulador — então este `if` não tem um `else` de erro: ele não pode ser
   * alcançado com os dois ausentes.
   *
   * **Nenhum dos dois caminhos diz, na resposta, qual deles foi usado.** A
   * resposta é `Connection`, igual nos dois, e `origin` **não** sai nela: ele é
   * coluna de trilha e de procedência, não de resposta. Um corpo que dissesse
   * `origin: people_search` contaria a quem recebeu o pedido que a outra pessoa
   * o achou numa busca — e isso é informação sobre como alguém chegou até ela,
   * que ninguém pediu para dar.
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
      const corpo = request.body as {
        readonly invite_token?: string;
        readonly handle?: string;
      };
      const quem = await contexto(request, deps);
      const conexao =
        corpo.invite_token === undefined
          ? // O `oneOf` do contrato garante que, sem `invite_token`, `handle`
            // existe -- entao nao ha terceiro ramo a escrever aqui. O `?? ''`
            // nao e um valor de reserva com significado: ele existe porque o
            // tipo e opcional, e um apelido vazio nao casa nenhuma linha no
            // `WHERE` -- o mesmo 404 de inexistente.
            await deps.conexoes.pedirPorApelido(quem, corpo.handle ?? '')
          : await deps.conexoes.pedir(quem, corpo.invite_token);
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
