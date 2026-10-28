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
 * ## O bloqueio e a denúncia do lado COM CONTA
 *
 * `POST /conversations/{id}/block` e `/report` **são registrados aqui**, e com
 * isso a assimetria de segurança fecha: o achador sem conta tinha as duas no ar
 * e o lado autenticado não tinha nenhuma — um tutor sendo extorquido no canal
 * mediado não tinha saída.
 *
 * Nada de desenho novo: a coluna (`blocked_at`, `blocked_by_role`) já existia, o
 * envio já recusa conversa bloqueada, e o índice parcial de denúncia aberta por
 * lado já deduplicava. O que faltava eram as duas escritas e estas duas rotas.
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
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
import type { Clock } from '../../../../shared/ports/index.js';
import type { ResolvedorDeDimensao } from '../../../../shared/http/aplicacao-de-teto.js';
import type {
  Chamador,
  ConversaVisivel,
  ConversationService,
} from '../../application/conversation-service.js';
import type {
  MensagemGravada,
  MotivoDaDenuncia,
  Pagina,
  PaginaDaLista,
} from '../../ports/conversation-repository.js';
import { decodificarCursor, limiteEfetivo } from '../../domain/paginacao.js';
import type { AbsoluteUrl, ConversationId, UserId } from '../../../../shared/types/brands.js';
import type { AssinadorDeFoto } from '../../ports/assinador-de-foto.js';

export const rotaDeListagemDeConversas = defineRoute({
  operationId: 'listConversations',
  method: 'get',
  path: '/conversations',
  effects: [],
});

/**
 * `POST /v1/me/conversations-seen` -- a area de mensagens foi VISTA.
 *
 * **`effects` vazio E teto declarado**, como `blockConversation`: a regra de
 * `x-effects` e piso e nao teto (secao 5 do contrato). Esta rota escreve, e nao
 * notifica ninguem nem gera trabalho humano.
 *
 * `accept_and_deduplicate` e **nao** `deny_429`, e isso e de produto: a tela
 * chama isto a cada abertura da area, e trocar de aba e voltar e normal. Um 429
 * aqui deixaria o sino ACESO para quem acabou de ler -- que e exatamente a
 * mentira que este contador existe para evitar.
 *
 * **Em `/me` e nao em `/conversations/seen`**: `conversationId` e um `uuid` no
 * caminho irmao, e depender da precedencia do roteador para `seen` nao ser lido
 * como id e uma garantia que nao se escreve no contrato.
 */
export const rotaDeListaVista = defineRoute({
  operationId: 'markMyConversationsSeen',
  method: 'post',
  path: '/me/conversations-seen',
  effects: [],
  rateLimit: [
    { dimension: ['account'], limit: 240, window: '1h', onExceed: 'accept_and_deduplicate' },
  ],
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

/**
 * O bloqueio (`blockConversation`).
 *
 * **`effects` é vazio e o teto existe**, e as duas coisas vêm do contrato: a
 * regra de `x-effects` é piso, não teto (§5). Bloquear não notifica ninguém — a
 * outra pessoa descobre quando tenta escrever —, e o teto de 20/24 h está lá
 * para o caso degenerado, não para recusar.
 *
 * **`accept_and_deduplicate` NÃO recusa** (`aplicacao-de-teto.ts`: só `deny_429`
 * recusa). É deliberado: bloquear é a ação que a pessoa executa com medo, e
 * responder com texto sobre limite de chamadas a quem está se protegendo não
 * protege nada. A idempotência verdadeira é do `WHERE` da escrita
 * (`blocked_at IS NULL`), e não deste contador.
 *
 * A dimensão é `account` e não `conversation_participant`: quem bloqueia bloqueia
 * uma vez por conversa, e um teto por participante nunca encostaria em nada.
 */
export const rotaDeBloqueioDaConversa = defineRoute({
  operationId: 'blockConversation',
  method: 'post',
  path: '/conversations/:conversationId/block',
  effects: [],
  rateLimit: [
    { dimension: ['account'], limit: 20, window: '24h', onExceed: 'accept_and_deduplicate' },
  ],
});

/**
 * A denúncia (`reportConversation`).
 *
 * **Os dois tetos são os do contrato, e nenhum dos dois recusa.**
 *
 * - `account 3/24h accept_and_deduplicate`: a denúncia carrega a conversa
 *   inteira, então a quarta não acrescenta prova — mas RECUSAR é inaceitável.
 *   Quem toca em Denunciar a cada mensagem está com medo. A deduplicação de
 *   verdade acontece no banco, no índice parcial de denúncia aberta por lado.
 * - `report_target` com `counts: distinct_identities`: é a dimensão que pega
 *   denúncia em laço, que é o ataque do concorrente — muitos denunciantes contra
 *   o mesmo alvo. `raise_queue_priority` eleva a prioridade na fila e **NUNCA
 *   age sobre o alvo**. Esta porta não aplica `distinct_identities`, e a subida a
 *   lista no inventário com o motivo; o resolvedor existe para a declaração ter
 *   dono, como no lado do achador.
 *
 * `human_work` é verdade e precisa estar declarado: alguém vai ler isso.
 */
export const rotaDeDenunciaDaConversa = defineRoute({
  operationId: 'reportConversation',
  method: 'post',
  path: '/conversations/:conversationId/report',
  effects: ['human_work'],
  rateLimit: [
    { dimension: ['account'], limit: 3, window: '24h', onExceed: 'accept_and_deduplicate' },
    {
      dimension: ['report_target'],
      counts: 'distinct_identities',
      limit: 3,
      window: '24h',
      onExceed: 'raise_queue_priority',
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
  /**
   * O dominio das derivadas publicas. **A URL e montada aqui, nunca gravada**
   * (§11.1 proibicao 9): gravar URL absoluta amarraria cada linha ao provedor
   * do dia em que ela foi escrita.
   *
   * Entrou com a emenda 3 do ADR-0010 (19/10/2026), que e a primeira vez que
   * esta superficie serve uma imagem. Mesma dependencia, com o mesmo nome, de
   * `person-profile-routes.ts`.
   */
  readonly baseDeMidia: AbsoluteUrl;
  /**
   * O assinador da foto da MENSAGEM (BICHUS-35). Separado de `baseDeMidia`,
   * que monta URL de derivada PUBLICA: esta foto esta em balde privado e sai
   * assinada, com validade curta (criterio 9 -- ela e vista pelo tutor dentro
   * da conversa mediada, e so).
   */
  readonly assinarFoto: AssinadorDeFoto;
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
 * A janela da LISTA: a de [paginaDaQuery], mais o `q` do contrato.
 *
 * O termo chega **sem espaço nas pontas**, e vazio vira `undefined`: `q=` e `q`
 * ausente querem a mesma resposta (a lista inteira), e deixar a string vazia
 * descer faria o repositório montar um `ILIKE '%%'` que casa tudo — mesma
 * resposta por um caminho mais caro, e um `total` calculado por um predicado
 * que ninguém pediu.
 *
 * **O piso de 2 caracteres é do contrato** (`ConversationSearch.minLength`) e é
 * a validação da rota que o cobra. Repeti-lo aqui seria um segundo lugar com o
 * mesmo número.
 */
function paginaDaListaDaQuery(request: FastifyRequest): PaginaDaLista {
  const { q } = request.query as { q?: string };
  const termo = typeof q === 'string' ? q.trim() : '';
  return {
    ...paginaDaQuery(request),
    termo: termo === '' ? undefined : termo,
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

/**
 * A conversa na forma do contrato, campo a campo.
 *
 * Lista explícita e não espalhamento: o objeto do serviço carrega o que o
 * domínio precisa, e um `...conversa` publicaria cada campo novo por omissão.
 * Aqui a decisão de expor é sempre uma decisão — que é exatamente o que uma
 * conversa desenhada para não entregar telefone nem endereço exige.
 */
/**
 * Exportada para a bancada que confere o CORPO da resposta
 * (`o-aviso-sai-para-quem-tem-conta.test.ts`). Nenhum portao deste repositorio
 * confere corpo de RESPOSTA -- o validador de contrato confere o da requisicao
 * --, entao a unica forma de provar o que sai e montar e ler.
 */
export async function comoResposta(
  conversa: ConversaVisivel,
  baseDeMidia: AbsoluteUrl,
  assinar: AssinadorDeFoto,
): Promise<Record<string, unknown>> {
  const base = baseDeMidia.replace(/\/$/, '');
  return {
    id: conversa.id,
    // O AVISO desta conversa. **So na vista autenticada** -- ela ja entrega
    // `id` e `case_id` como UUID, e este e mais um id da PROPRIA conversa de
    // quem chamou. `FinderConversation` nao tem e nao pode ganhar: o token do
    // achador ja endereca o aviso, e entregar UUIDv7 a quem nao tem conta e o
    // que o SEC-001 proibe.
    //
    // Sem este campo o tutor nao consegue pedir intencao de foto: o corpo de
    // `createFoundReportPhotoUploadIntent` EXIGE `found_report_id`, e o tutor
    // nao e o relator -- o aviso nao aparece na lista dele, e `case_id` e o
    // caso de perdido, nao o aviso.
    found_report_id: conversa.foundReportId,
    // O ALCANCE DA FOTO, e ele e informacao de EXPECTATIVA e nao de
    // permissao: hoje a foto do tutor nao e lida pelo achador SEM conta
    // (guarda de SEC-001 em `domain/leitura-da-foto.ts`), e sem este campo o
    // tutor manda a foto e fica esperando resposta de quem nao viu nada. O
    // servidor e o unico que sabe disso.
    //
    // **So na vista autenticada**, como `found_report_id`.
    photo_reaches_other_side: conversa.fotoAlcancaOutroLado,
    case_id: conversa.caseId,
    pet_display_name: conversa.petDisplayName,
    status: conversa.status,
    // QUAL DOS DOIS LADOS E O CHAMADOR, e **so** isso.
    //
    // Sem este campo o cliente adivinha, e a adivinhacao nao decide: medido em
    // 27/10/2026 sobre `participantesVisiveis`, sem conexao aceita os DOIS
    // participantes saem com `handle` e `photo_icon_url` nulos, e o corpo fica
    // identico para o chamador tutor e para o chamador achador. O app assumia
    // `tutor` fixo por isso, e para o achador COM conta -- que o `WHERE` da
    // leitura atende -- a bolha do outro lado ia para a direita e a linha da
    // lista mostrava o proprio nome sem foto.
    //
    // **So na vista autenticada**, como `found_report_id` e
    // `photo_reaches_other_side`. `FinderConversation` nao o ganha: o papel
    // daquele chamador e `finder` por definicao do token, e nao ha o que dizer.
    //
    // Nao e identificador e nao liga a conversa a uma conta (ADR-0010 itens 6
    // e 7): `'tutor'` ou `'finder'`, e nada sobre a outra pessoa.
    viewer_role: conversa.papelDoChamador,
    participants: conversa.participants.map((p) => ({
      role: p.role,
      display_name: p.displayName,
      // O APELIDO E A FOTO DO OUTRO LADO (emenda 3 do ADR-0010, 19/10/2026).
      //
      // **As duas chaves vem SEMPRE na resposta**, com nulo quando nao ha. A
      // escolha e deliberada e e o contrario da de `PersonProfile.showcase`,
      // que e OMITIDA: lista vazia afirmaria "ela nao tem foto", mas um
      // `null` escalar nao afirma nada alem de "nao ha foto aqui" -- e chave
      // que aparece e desaparece faz o cliente distinguir ausencia de nulo
      // sem que a diferenca signifique algo.
      //
      // **Nenhum `if` de autorizacao nesta borda.** O recorte ja aconteceu na
      // clausula `WHERE` da consulta (ADR-0021): o que chega aqui e nulo ou e
      // de uma conexao aceita, e esta funcao nao tem como saber a diferenca --
      // nem precisa.
      handle: p.handle,
      photo_icon_url: p.photoKey === null ? null : `${base}/${p.photoKey}`,
    })),
    // `Promise.all` e nao um laco: as assinaturas sao locais (HMAC, sem rede
    // no adaptador S3) e independentes entre si, e serializa-las faria a
      // pagina de 20 mensagens pagar 20 esperas por nada.
    messages: await Promise.all(conversa.messages.map((m) => comoMensagem(m, assinar))),
    // A LEITURA (BICHUS-278). Os tres saem do servico, que os leu do banco:
    // nenhum deles e calculado aqui, e nenhum e calculado no cliente.
    unread: conversa.naoLida,
    last_message_preview: conversa.previaDaUltima,
    last_message_at:
      conversa.ultimaMensagemEm === null ? null : conversa.ultimaMensagemEm.toISOString(),
    next_cursor: conversa.nextCursor,
  };
}

/**
 * A URL ASSINADA da foto da mensagem, ou `null`.
 *
 * **Nenhuma consulta de estado aqui, e isso e consequencia da invariante da
 * escrita** (`ports/foto-da-conversa.ts`): o que esta em `photo_object_key` ja
 * e a derivada higienizada, sem EXIF. Chave presente significa chave limpa, e
 * por isso a leitura nao precisa perguntar a `upload_intents` se pode servir.
 * Se a escrita pudesse gravar o original, esta funcao teria de fazer um `JOIN`
 * -- e a leitura que esquecesse o `JOIN` serviria a coordenada de GPS sem nada
 * acusar.
 *
 * **Assinada e nao publica**: o balde e privado (criterio 9). A validade e o
 * motivo dela estao em `domain/leitura-da-foto.ts`.
 */
async function urlDaFoto(
  mensagem: MensagemGravada,
  assinar: AssinadorDeFoto,
): Promise<string | null> {
  if (mensagem.photoObjectKey === null) return null;
  return assinar(mensagem.photoObjectKey);
}

async function comoMensagem(
  mensagem: MensagemGravada,
  assinar: AssinadorDeFoto,
): Promise<Record<string, unknown>> {
  return {
    id: mensagem.id,
    sender_role: mensagem.senderRole,
    body: mensagem.body,
    redactions: mensagem.redactions.map((r) => ({ kind: r.kind, hint: r.hint })),
    photo_url: await urlDaFoto(mensagem, assinar),
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
      const pagina = paginaDaListaDaQuery(request);
      const pagina_ = await deps.conversas.listar(chamador, pagina);
      return reply.status(200).send({
        items: await Promise.all(
          pagina_.items.map((c) => comoResposta(c, deps.baseDeMidia, deps.assinarFoto)),
        ),
        // O TOTAL DO RECORTE, e nao o tamanho da pagina: a linha de resumo da
        // listagem no aplicativo diz quantas conversas existem, e `items.length`
        // diria `10` a quem tem 57.
        total: pagina_.total,
        // O CONTADOR DO SINO, da conta INTEIRA e nao desta pagina: somar a
        // pagina faria o sino mostrar 20 para quem tem 57. O numero vai SEM
        // teto; o corte em `9+` e de apresentacao e mora no app.
        unread_count: pagina_.naoLidas,
        next_cursor: pagina_.nextCursor,
      });
    },
  );

  /**
   * `POST /v1/me/conversations-seen` — 204. **A rota estava DECLARADA e NÃO
   * REGISTRADA, e isso foi medido em homologação em 20/10/2026.**
   *
   * `rotaDeListaVista` existe desde que o contador do sino existe, o serviço
   * (`marcarListaVista`) existe, o repositório existe e o aplicativo CHAMA
   * (`app/lib/api/conversas_api.dart`, de `area_de_mensagens.dart`). Só a
   * chamada de `registrarRota` faltava, e o efeito era inteiro: medido contra
   * `https://hml.bichu.app` em `fb3a0fba`,
   * `POST /v1/me/conversations-seen` respondia **404** com
   * `"type": ".../problems/not-found"`. Ou seja: **o contador de mensagens não
   * zerava por nenhum caminho** — o app engole a falha de propósito (está
   * escrito em `marcarListaVista`, no cliente Dart), então ninguém via erro e
   * o número ficava aceso para quem acabou de ler.
   *
   * **Por que nenhum portão pegou:**
   * `rotas-registradas-contra-o-contrato.test.ts` compara os `defineRoute`
   * **exportados** com o contrato, e não as chamadas de `registrarRota` — a
   * rota exportada bastava para ele ficar verde. E `markMyConversationsSeen`
   * não estava em `OPERACOES_AINDA_SEM_ROTA`, que é a lista onde uma ausência
   * DELIBERADA tem de estar declarada com motivo. A operação não estava nem
   * registrada nem declarada como ausente: estava no vão entre as duas.
   *
   * Isto **não é mudança de contrato**: a operação, o `x-effects`, o teto de
   * 240/h por conta e o 204 já estavam escritos em `api/openapi.yaml`. O que
   * entra aqui é o handler que faltava para a operação declarada ser real.
   */
  registrarRota(
    app,
    rotaDeListaVista,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      await deps.conversas.marcarListaVista(chamador);
      return reply.status(204).send();
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
      return reply.status(200).send(await comoResposta(conversa, deps.baseDeMidia, deps.assinarFoto));
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
      // `photo_upload_id` e OPCIONAL no contrato. O corpo desta operacao nao e
      // fechado (`additionalProperties: false` nao esta declarado), e o Fastify
      // monta o Ajv com `removeAdditional: true`: um campo que NAO estivesse no
      // schema seria apagado em silencio antes de chegar aqui, e o envio
      // gravaria a mensagem sem a foto sem nada acusar. E por isso que o campo
      // ter entrado no contrato e condicao, e nao documentacao.
      const corpo = request.body as { body: string; photo_upload_id?: string };

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
          body: await comoMensagem(
            await deps.conversas.enviar(
              conversationId,
              corpo.body,
              chamador,
              corpo.photo_upload_id,
            ),
            deps.assinarFoto,
          ),
        }),
      );

      return reply.status(resposta.status).send(resposta.body);
    },
  );

  /**
   * `POST /v1/conversations/:conversationId/block` — 204, sem corpo.
   *
   * O contrato declara `204`, e ele está certo: não há nada de útil para
   * devolver. Devolver a conversa em `blocked` convidaria a tela a decidir pelo
   * corpo em vez de recarregar, e a próxima leitura já diz a verdade.
   *
   * **Sem corpo de requisição**, porque o contrato não declara nenhum: quem
   * bloqueia bloqueia a outra parte, e não há segunda escolha a fazer.
   */
  registrarRota(
    app,
    rotaDeBloqueioDaConversa,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      await deps.conversas.bloquear(conversaDoCaminho(request), chamador);
      return reply.status(204).send();
    },
  );

  /**
   * `POST /v1/conversations/:conversationId/report` — 202 `Accepted`.
   *
   * 202 e não 200 porque nada foi decidido: a denúncia entrou na fila de quem
   * modera. O corpo é o `Accepted` do contrato (`status: accepted`), igual ao do
   * lado do achador.
   *
   * O resolvedor de `report_target` engole a falha e devolve `undefined` pelo
   * mesmo motivo do lado do achador: conversa que não é do chamador não conta
   * ninguém no teto, e a recusa dela é o 404 do handler — não um 429 que
   * esconderia o motivo verdadeiro.
   */
  registrarRota(
    app,
    rotaDeDenunciaDaConversa,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeDenunciaDaConversa.operationId) },
      resolvedores: {
        account: (request) => contaDoTeto(request, deps),
        report_target: async (request) => {
          const { conversationId } = request.params as { conversationId?: string };
          if (typeof conversationId !== 'string' || conversationId === '') return undefined;
          try {
            return await deps.conversas.alvoDaDenuncia(
              conversationId as ConversationId,
              await chamadorAutenticado(request, deps),
            );
          } catch {
            return undefined;
          }
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await chamadorAutenticado(request, deps);
      const corpo = request.body as { reason: MotivoDaDenuncia; detail?: string };
      await deps.conversas.denunciar(
        conversaDoCaminho(request),
        corpo.reason,
        corpo.detail,
        chamador,
      );
      return reply.status(202).send({ status: 'accepted' });
    },
  );
}
