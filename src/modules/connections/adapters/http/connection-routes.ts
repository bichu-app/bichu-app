/**
 * As rotas da conexão entre pessoas (fatia F).
 *
 * ## SEIS operações desde 22/10/2026, e a sexta é a lista do próprio dono
 *
 * | | |
 * |---|---|
 * | `POST /connections` | pedir, **por convite ou por apelido** |
 * | `GET /connections` | **as PRÓPRIAS conexões aceitas** (22/10/2026) |
 * | `GET /connections/requests` | as duas caixas de pedidos |
 * | `GET /connections/summary` | os **números** da própria conta |
 * | `POST /connections/{ref}/acceptance` | aceitar |
 * | `DELETE /connections/{ref}` | recusar, cancelar ou desfazer |
 *
 * **`GET /connections` EXISTE DESDE 22/10/2026**, e este cabeçalho afirmava o
 * contrário: ele dizia *"Não existe `GET /connections`. A lista de conexões não
 * aparece a ninguém, nem a quem é conectado"*. **O cliente emendou a própria
 * decisão de 18/10/2026**, literal:
 *
 * > *"o usuário pode abrir a lista de usuários que é sua conexão"*
 *
 * **A emenda é exata, e a metade não emendada continua valendo inteira:**
 *
 * | | antes | agora |
 * |---|---|---|
 * | a própria lista, para o próprio dono | nunca | **PODE** |
 * | a lista de **TERCEIRO** | nunca | **continua NUNCA** |
 *
 * Não há rota de lista endereçada a uma pessoa neste arquivo, e não pode haver:
 * `listMyConnections` não tem parâmetro de caminho, e quem chama vem do
 * `bearerAuth`. `conexao-nao-expoe-lista-nem-identificador.test.ts` foi
 * **ajustado pelo nome** — ele abriu `listMyConnections` e passou a cobrar três
 * coisas novas: nenhuma operação de conexão endereçada por pessoa,
 * `ConnectedPersonPage` com uma porta só, e o recorte da lista igual ao da
 * busca. O número exato de operações continua cobrado, agora em seis.
 *
 * **As operações do convite continuam na etiqueta `connection-invites`**, e a
 * busca de pessoas em `people`: o número desta etiqueta é um mecanismo, e a
 * forma de respeitá-lo nunca foi afrouxá-lo.
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
 * `bearerAuth` **sem alternativa vazia** nas seis. A coluna "sem conta" da
 * tabela 4-B é vazia inteira, e isso é arquitetura e não escolha de tela: não
 * existe rota de conexão alcançável sem conta, em estado nenhum — e a lista das
 * próprias conexões é o caso mais óbvio disso, porque sem conta não existe "as
 * próprias".
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

/**
 * **A lista das PRÓPRIAS conexões** (cliente, 22/10/2026).
 *
 * O teto é o das duas leituras irmãs — 600/h por conta —, e é o mesmo por uma
 * razão e não por simetria: as três são leitura da própria conta, numa tela que
 * a pessoa reabre. **Não há dimensão `q`** porque não há busca aqui: a lista não
 * recebe termo, e sem termo não há varredura a limitar.
 *
 * **Efeitos vazios**: é leitura. E **não há parâmetro de caminho**, que é o que
 * torna a lista de terceiro inexprimível nesta rota.
 */
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
  /**
   * A raiz pública da mídia, de onde a URL da foto é montada — **entrou em
   * 22/10/2026 com `listMyConnections`**, que é a primeira resposta de conexão
   * a carregar foto. A mesma dependência, com o mesmo nome, de
   * `DependenciasDasRotasDeBusca`.
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

/** A paginação da lista das próprias conexões. **Sem direção e sem pessoa.** */
interface PaginacaoSimples {
  readonly page?: number;
  readonly limit?: number;
}

/**
 * Uma conexão como `ConnectedPerson` a declara: **os CINCO campos de
 * `PersonSearchResult`** (cliente, 22/10/2026).
 *
 * **Ser conexão aceita não abre campo aqui**, e a igualdade com o recorte da
 * busca é medida no contrato pelo portão. Sem `public_ref` (esta lista não
 * hospeda denunciar nem bloquear), sem `connection_ref` (desfazer mora no
 * perfil), sem `connection_state` (seria a constante `connected` em toda linha)
 * e sem UUID (ADR-0010 item 6).
 *
 * **Exportada para a isca**, como `comoRespostaDaPessoa` da busca: nenhum portão
 * deste repositório confere o CORPO da resposta, então a única forma de medir o
 * conjunto de chaves em suíte é chamar a projeção.
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
    // A URL e montada na BORDA, com o dominio de midia do ambiente -- o banco
    // guarda chave de objeto e nunca endereco. A chave vem SEMPRE, com nulo
    // quando nao ha foto pronta: chave que aparece e desaparece faria o cliente
    // distinguir ausencia de nulo sem que a diferenca significasse algo.
    photo_icon_url:
      pessoa.photoKey === null ? null : `${baseDeMidia.replace(/\/$/, '')}/${pessoa.photoKey}`,
  };
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

  /**
   * **As PRÓPRIAS conexões aceitas** (cliente, 22/10/2026).
   *
   * **Nenhum parâmetro de caminho e nenhum filtro de pessoa**: só `page` e
   * `limit`. Quem chama vem do `bearerAuth`, e é ele que entra na cláusula
   * `WHERE` do repositório — não há nesta borda um valor de pessoa que alguém
   * pudesse mandar, e é isso que mantém a lista de terceiro inexprimível.
   *
   * **A URL da foto é montada AQUI**, com a base de mídia do ambiente: o banco
   * guarda chave de objeto e nunca endereço (§11.1 proibição 9). A mesma divisão
   * da busca de pessoas, e a projeção é exportada pela mesma razão que a dela —
   * nenhum portão deste repositório confere o CORPO da resposta, então a única
   * forma de medir o conjunto de chaves em suíte é chamar a projeção.
   */
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

  /** Só números, e só da própria conta. É o que a tela mostra ao lado da lista. */
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
