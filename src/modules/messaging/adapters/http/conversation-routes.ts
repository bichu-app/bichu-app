/**
 * Rotas da conversa mediada, do lado de quem tem conta.
 *
 * `effects` e `rateLimit` **espelham** `api/openapi.yaml`: rota com efeito e
 * sem teto não compila (`shared/http/route-definition.ts`), e a declaração aqui
 * é o que `registrarRota` lê para instalar os ganchos.
 *
 * ## `bearerAuth` e apenas ele (critério 12)
 *
 * Nenhuma destas três rotas aceita `finderToken`, e a razão é de desenho e não
 * de configuração: as rotas do achador **não têm id no caminho**
 * (`/v1/finder/conversation`), porque o token dele é o próprio endereço. Com um
 * id no caminho e um token ao portador na outra mão, a classe inteira de BOLA
 * volta a existir e passa a depender de uma verificação de vínculo bem escrita.
 * Aqui ela não existe para ser verificada.
 *
 * ## O que ficou para a BICHUS-40 e para a BICHUS-41
 *
 * `POST /conversations/{id}/block` e `/report` são da **BICHUS-40** e não são
 * registrados aqui. O modelo de dados já os comporta (`blocked_at` e
 * `blocked_by_role` na migração), e o envio já respeita o bloqueio: quando
 * aquelas rotas escreverem a coluna, a conversa passa a modo leitura sem este
 * arquivo mudar uma linha.
 *
 * As quatro rotas `/v1/finder/conversation/*` são da **BICHUS-41**, que está
 * travada por decisão do cliente sobre onde moram as páginas públicas. O que
 * não depende daquela decisão está pronto: o token do achador já é emitido e já
 * é guardado como resumo (`found_reports.finder_token_hash`), a conversa já
 * nasce do aviso, e a redação já vale nos dois sentidos.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { defineRoute } from '../../../../shared/http/route-definition.js';
import {
  registrarRota,
  type RegistradorDeRotas,
} from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import {
  executarComIdempotencia,
  exigenciaDeIdempotencia,
  type Idempotencia,
} from '../../../../shared/http/idempotency.js';
import type { Contrato } from '../../../../shared/http/contract.js';
import type { Clock } from '../../../../shared/ports/index.js';
import type { ResolvedorDeDimensao } from '../../../../shared/http/aplicacao-de-teto.js';
import type {
  Chamador,
  ConversaVisivel,
  ConversationService,
} from '../../application/conversation-service.js';
import type { MensagemGravada, Pagina } from '../../ports/conversation-repository.js';
import { decodificarCursor, limiteEfetivo } from '../../domain/paginacao.js';
import type { ConversationId, UserId } from '../../../../shared/types/brands.js';

export const rotaDeListagemDeConversas = defineRoute({
  operationId: 'listConversations',
  method: 'get',
  path: '/conversations',
  effects: [],
});

export const rotaDeDetalheDaConversa = defineRoute({
  operationId: 'getConversation',
  method: 'get',
  path: '/conversations/:conversationId',
  effects: [],
});

/**
 * O envio, e os três tetos do contrato.
 *
 * O primeiro é o único que recusa: `deny_429` na 31ª mensagem da hora, aplicado
 * pela borda. Os outros dois são `hold_for_review`, que **não é recusa** —
 * reter uma conversa para revisão humana é escrita de domínio, e o serviço a
 * executa em `avaliarRetencao`. Eles estão declarados aqui mesmo assim, e
 * precisam estar: é a declaração que faz `inventariarNaoAplicaveis` listá-los
 * na subida com o motivo, em vez de o teto simplesmente não existir em silêncio.
 */
export const rotaDeEnvioDeMensagem = defineRoute({
  operationId: 'postConversationMessage',
  method: 'post',
  path: '/conversations/:conversationId/messages',
  effects: ['notifies', 'human_work'],
  rateLimit: [
    { dimension: ['conversation_participant'], limit: 30, window: '1h', onExceed: 'deny_429' },
    {
      dimension: ['conversation_participant'],
      limit: 200,
      window: '24h',
      onExceed: 'hold_for_review',
    },
    {
      dimension: ['account'],
      counts: 'distinct_cases',
      limit: 3,
      window: '24h',
      onExceed: 'hold_for_review',
    },
  ],
});

export interface Autenticador {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDeConversa {
  readonly conversas: ConversationService;
  readonly autenticador: Autenticador;
  readonly contrato: Contrato;
  readonly idempotencia: Idempotencia;
  readonly clock: Clock;
}

/**
 * MEMOIZADA por requisição: o teto por `conversation_participant` precisa do
 * chamador antes do handler, e o handler precisa do mesmo chamador. Sem a
 * memória, toda rota de conversa verificaria o token duas vezes.
 */
function chamadorAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeConversa,
): Promise<Chamador> {
  return memoDaRequisicao(request, 'conversas:chamador', async () => {
    const cabecalho = request.headers.authorization;
    if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
      throw problemas.naoAutenticado();
    }
    const token = cabecalho.slice('Bearer '.length).trim();
    if (token === '') throw problemas.naoAutenticado();
    const { userId } = await deps.autenticador.autenticar(token);
    return { userId, correlationId: request.id, ip: request.ip };
  });
}

function conversaDoCaminho(request: FastifyRequest): ConversationId {
  const { conversationId } = request.params as { conversationId?: string };
  if (typeof conversationId !== 'string' || conversationId === '') {
    throw problemas.naoEncontrado();
  }
  return conversationId as ConversationId;
}

function paginaDaQuery(request: FastifyRequest): Pagina {
  const { cursor, limit } = request.query as { cursor?: string; limit?: number };
  const posicao = decodificarCursor(cursor);
  return {
    limit: limiteEfetivo(limit),
    ...(posicao === undefined ? { depoisDe: undefined } : { depoisDe: posicao }),
  };
}

/**
 * O balde do teto: a conversa E o participante, nunca um dos dois.
 *
 * Só a conta seria o balde errado na direção cara: quem está combinando a
 * devolução de dois animais ao mesmo tempo gastaria um teto só. Só a conversa
 * seria errado na direção perigosa: as duas pessoas dividiriam o mesmo balde, e
 * o falso achador calaria o tutor gastando as 30 mensagens dele.
 *
 * Os dois valores são UUID interno, que é o que a tabela de trilha já guarda, e
 * `bucket_key` não sai em resposta nenhuma — a mesma exceção declarada para
 * `account` e `pet` em `aplicacao-de-teto.ts`.
 */
async function participanteDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeConversa,
): Promise<string | undefined> {
  const { conversationId } = request.params as { conversationId?: string };
  if (typeof conversationId !== 'string' || conversationId === '') return undefined;
  try {
    const chamador = await chamadorAutenticado(request, deps);
    return `${conversationId}:${chamador.userId}`;
  } catch {
    // Quem não apresentou credencial válida não tem balde. A recusa dele é o
    // 401 do handler, e não um 429 que esconderia o motivo verdadeiro.
    return undefined;
  }
}

/** `account`, para a dimensão de casos distintos. */
async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDeConversa,
): Promise<string | undefined> {
  try {
    return (await chamadorAutenticado(request, deps)).userId;
  } catch {
    return undefined;
  }
}

/**
 * Os resolvedores do envio, num lugar só.
 *
 * **Exportado para a bancada do teto usar ESTE, e não um dublê equivalente.**
 * A primeira versão de `teto-da-rota-de-envio.test.ts` declarava o seu próprio
 * resolvedor inline, e com isso provava que o mecanismo conta — não que a rota
 * conta o que deve. Medido: trocar `${conversa}:${conta}` por `${conta}` na
 * função de produção deixava a suíte inteira VERDE, 0 casos reprovados, com o
 * balde errado de pé. É a mesma forma de "o dublê recusou" que este repositório
 * já pagou duas vezes, uma camada acima.
 */
export function resolvedoresDoEnvio(deps: DependenciasDasRotasDeConversa): {
  conversation_participant: ResolvedorDeDimensao;
  account: ResolvedorDeDimensao;
} {
  return {
    conversation_participant: (request) => participanteDoTeto(request, deps),
    account: (request) => contaDoTeto(request, deps),
  };
}

function corpoDe(contrato: Contrato, operationId: string): Record<string, unknown> {
  const schema = contrato.requestBodySchema(operationId);
  if (schema === undefined) {
    throw new Error(
      `Operação ${operationId} não declara corpo de requisição em application/json ` +
        `no contrato, mas a rota espera um. Corrija a especificação, não o código.`,
    );
  }
  return schema;
}

/**
 * A conversa na forma do contrato, campo a campo.
 *
 * Lista explícita e não espalhamento: o objeto do serviço carrega o que o
 * domínio precisa, e um `...conversa` publicaria cada campo novo por omissão.
 * Aqui a decisão de expor é sempre uma decisão — que é exatamente o que uma
 * conversa desenhada para não entregar telefone nem endereço exige.
 */
function comoResposta(conversa: ConversaVisivel): Record<string, unknown> {
  return {
    id: conversa.id,
    case_id: conversa.caseId,
    pet_display_name: conversa.petDisplayName,
    status: conversa.status,
    participants: conversa.participants.map((p) => ({
      role: p.role,
      display_name: p.displayName,
    })),
    messages: conversa.messages.map(comoMensagem),
    next_cursor: conversa.nextCursor,
  };
}

function comoMensagem(mensagem: MensagemGravada): Record<string, unknown> {
  return {
    id: mensagem.id,
    sender_role: mensagem.senderRole,
    body: mensagem.body,
    redactions: mensagem.redactions.map((r) => ({ kind: r.kind, hint: r.hint })),
    // A foto entra com a mídia do achado; nulo é o valor verdadeiro hoje, e uma
    // URL inventada seria uma promessa que o cliente descobre quebrada na tela.
    photo_url: null,
    created_at: mensagem.createdAt.toISOString(),
  };
}

export function registrarRotasDeConversas(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDeConversa,
): void {
  registrarRota(
    app,
    rotaDeListagemDeConversas,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const pagina = paginaDaQuery(request);
      const pagina_ = await deps.conversas.listar(chamador, pagina);
      return reply.status(200).send({
        items: pagina_.items.map(comoResposta),
        next_cursor: pagina_.nextCursor,
      });
    },
  );

  registrarRota(
    app,
    rotaDeDetalheDaConversa,
    {},
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const conversa = await deps.conversas.buscar(
        conversaDoCaminho(request),
        chamador,
        paginaDaQuery(request),
      );
      return reply.status(200).send(comoResposta(conversa));
    },
  );

  registrarRota(
    app,
    rotaDeEnvioDeMensagem,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeEnvioDeMensagem.operationId) },
      config: { idempotencia: true },
      resolvedores: resolvedoresDoEnvio(deps),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const conversationId = conversaDoCaminho(request);
      const corpo = request.body as { body: string };

      const resposta = await executarComIdempotencia(
        deps.idempotencia,
        {
          exigencia: exigenciaDeIdempotencia(deps.contrato, rotaDeEnvioDeMensagem.operationId),
          chaveDoCabecalho: request.headers['idempotency-key'],
          // O dono da chave é a CONTA, e não a conversa: duas conversas da mesma
          // pessoa são pedidos diferentes com o MESMO dono. Quem as separa é
          // `parametrosDeCaminho`, logo abaixo.
          donoOuToken: chamador.userId,
          endpoint: `${rotaDeEnvioDeMensagem.method.toUpperCase()} ${rotaDeEnvioDeMensagem.path}`,
          // A CONVERSA ENTRA NA CHAVE, pelo mecanismo e nao a mao: `endpoint` e
          // o molde da rota, entao duas conversas da mesma conta com a mesma
          // chave sao pedidos diferentes que ele nao distingue.
          parametrosDeCaminho: { conversationId },
          corpo,
          agoraEmMilissegundos: deps.clock.now(),
        },
        async () => ({
          status: 201,
          body: comoMensagem(await deps.conversas.enviar(conversationId, corpo.body, chamador)),
        }),
      );

      return reply.status(resposta.status).send(resposta.body);
    },
  );
}
