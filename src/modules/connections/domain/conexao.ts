/**
 * A conexão entre pessoas: os estados, quem vê o quê, e a projeção para o app.
 *
 * **UM GRAFO SÓ, amizade SIMÉTRICA, com aceite. Não existe "seguir"** (decisão
 * do cliente de 18/10/2026: *"se elas forem amigas não tem problema, o que não
 * pode é ser público, sem ter nenhum relacionamento"*). O argumento que fechou
 * isso: uma timeline de quem você segue **é** a lista de presença com hora — diz
 * onde a pessoa vai estar e quando, para alguém que só apertou um botão. O
 * ADR-0025 já recusou a lista de presença por dizer *quem* esteve; a linha do
 * tempo é estritamente pior.
 *
 * ## Os quatro estados do produto, e quem vê o quê
 *
 * | Estado | Quem vê | Como sai dele |
 * |---|---|---|
 * | `nenhum` | os dois, igual (ausência de linha) | pedido |
 * | `pendente` | quem pediu vê `pending_sent`; quem recebeu vê `pending_received` | aceite, recusa, cancelamento, ou **expira em 30 dias** |
 * | `conectado` | os dois, igual (`connected`) | desfazer (qualquer um), ou bloqueio |
 * | `recusado` | **ninguém** — só o descanso de 90 dias | decai sozinho |
 * | `bloqueado` | só quem bloqueou; o outro recebe **404** | desbloquear (não devolve a conexão) |
 *
 * **`recusado` não tem projeção.** Para quem pediu, a linha recusada se projeta
 * como `pending_sent` até `expires_at`, e depois desaparece — indistinguível de
 * um pedido que ninguém respondeu. É o item 5 do plano item 4: *"a recusa é
 * silenciosa e o pedido expira para quem pediu. Nenhum 'ela recusou você', que é
 * o que faz as pessoas aceitarem estranhos para não criar atrito."* O mesmo
 * desenho que `requestToJoinNetworkEvent` já aplica ao pedido do encontro
 * privado, onde recusado e pendente respondem o mesmo corpo.
 *
 * **`bloqueado` não é estado desta aresta.** Ele é `user_blocks`, da fatia E,
 * construída por outro agente. Aqui ele entra por uma porta
 * (`LeitorDeBloqueio`) e o efeito é um 404, nunca um 403 (ADR-0021).
 *
 * ## O que este arquivo NÃO tem, e não pode ganhar
 *
 * - **Nenhuma projeção de LISTA de conexões.** A lista de conexões não aparece a
 *   ninguém, nem a quem é conectado (plano 4-B: *"Lista de conexões | nunca |
 *   nunca"*). O que existe é contagem, para o próprio dono.
 * - **Nenhum identificador interno.** O que sai é `ref` (128 bits, por aresta),
 *   nome de exibição e apelido — nunca `UserId` (ADR-0010 item 6).
 * - **Nenhum caminho de descoberta.** Quem chega a um pedido chegou por pedido
 *   recebido, contexto em comum ou código presencial, e os três já são relação.
 */
import type { Instant } from '../../../shared/types/brands.js';

/** O estado guardado na coluna. `bloqueado` não está aqui, de propósito. */
export type EstadoGuardado = 'pending' | 'accepted' | 'declined';

/**
 * O estado no vocabulário do app. **Não há `declined`**, pela mesma razão que
 * `JoinRequestAppState` não tem: a recusa é silenciosa.
 */
export type EstadoNoApp = 'pending_sent' | 'pending_received' | 'connected';

/**
 * De onde o pedido nasceu. Lista fechada em **cinco**; ver a migração
 * `20261020000012`, que é onde a decisão do cliente está escrita.
 *
 * Os três primeiros são de 18/10/2026 e **nenhum deles foi construído**
 * (fatias H′ e H″). Os dois últimos entraram em 20/10/2026 e **são os que
 * existem**: `invite_link` (o convite emitido pelo dono, que alimenta o link
 * **e** o QR — os dois carregam o mesmo token) e `people_search` (a busca por
 * nome ou apelido).
 *
 * Cada valor corresponde a qual **credencial** a requisição carregou, e é só por
 * isso que ele é verificável pelo servidor em vez de palpite.
 */
export type OrigemDoPedido =
  | 'anchored_case'
  | 'anchored_event'
  | 'presence_code'
  | 'invite_link'
  | 'people_search';

/**
 * Como a outra pessoa é NOMEADA numa aresta.
 *
 * **O apelido é a chave de leitura** (`users.handle`, faixa 5–20, único global),
 * e é ele que se usa para referir uma pessoa — nunca o identificador interno.
 * Ele é **opcional**, então nada quebra com nulo: a leitura cai para o nome de
 * exibição, e `nomeParaLer` é o único lugar onde essa queda acontece.
 *
 * Não há avatar aqui: o avatar da fatia D/C não está no ar, e a lista fechada de
 * onde ele pode aparecer (plano 2.6) é decisão daquela fatia, não desta.
 */
export interface PessoaDaAresta {
  readonly apelido: string | null;
  readonly nomeDeExibicao: string | null;
}

/** A aresta como o repositório a devolve, já recortada por conta habilitada. */
export interface ArestaGuardada {
  readonly ref: string;
  readonly estado: EstadoGuardado;
  /** Verdadeiro quando quem chama é `requester_user_id`. */
  readonly souQuemPediu: boolean;
  readonly pedidoEm: Instant;
  readonly expiraEm: Instant;
  /**
   * O descanso de 90 dias, não nulo exatamente quando o estado é `declined`.
   *
   * **Nunca é projetado.** Ele existe para uma decisão só — se um pedido novo
   * pode nascer sobre este par — e dizer "descansando até" a quem pediu seria
   * contar a recusa com data.
   */
  readonly descansoAte: Instant | null;
  readonly outraPessoa: PessoaDaAresta;
}

/** O que sai em resposta. Sem `UserId`, sem `id`, sem contagem de ninguém. */
export interface ConexaoProjetada {
  readonly ref: string;
  readonly state: EstadoNoApp;
  readonly requested_at: string;
  readonly person: { readonly handle: string | null; readonly display_name: string | null };
}

/**
 * A aresta já pode ser substituída por um pedido novo?
 *
 * Verdadeiro em dois casos, e só nestes: pendente que **expirou** sem resposta,
 * e recusada cujo **descanso de 90 dias** passou. Nos dois a relação anterior
 * acabou sem deixar nada a preservar, e a linha é reaproveitada pelo `INSERT ...
 * ON CONFLICT DO UPDATE` — reaproveitar e não criar outra é o que mantém **uma
 * linha por par**.
 */
export function arestaMorta(aresta: ArestaGuardada, agora: Instant): boolean {
  if (aresta.estado === 'accepted') return false;
  if (aresta.estado === 'declined') {
    return aresta.descansoAte === null || Number(aresta.descansoAte) <= Number(agora);
  }
  return !pendenteVivo(aresta, agora);
}

/** O pendente ainda vale? Expiração preguiçosa: comparação, não tarefa. */
export function pendenteVivo(aresta: ArestaGuardada, agora: Instant): boolean {
  return Number(aresta.expiraEm) > Number(agora);
}

/**
 * O estado que o app vê, ou `undefined` quando a aresta **não se projeta**.
 *
 * Os três casos de `undefined`, e cada um é uma decisão:
 *
 * 1. **recusado, para quem recebeu**: ele decidiu, não precisa de lembrete, e
 *    guardar a recusa visível seria convidar a desfazê-la por culpa.
 * 2. **recusado, depois de `expires_at`, para quem pediu**: o pedido "expirou",
 *    que é o que ele teria visto se ninguém respondesse.
 * 3. **pendente expirado**, para os dois.
 *
 * O caso que **não** é `undefined` e é o que faz a recusa ser silenciosa:
 * recusado, antes de `expires_at`, para quem pediu, projeta `pending_sent`.
 */
export function estadoNoApp(aresta: ArestaGuardada, agora: Instant): EstadoNoApp | undefined {
  if (aresta.estado === 'accepted') return 'connected';
  if (!pendenteVivo(aresta, agora)) return undefined;
  if (aresta.estado === 'declined') return aresta.souQuemPediu ? 'pending_sent' : undefined;
  return aresta.souQuemPediu ? 'pending_sent' : 'pending_received';
}

/**
 * **O predicado que todo dado de conectado atravessa.**
 *
 * `pedido exige aceite`: enquanto a aresta é `pending`, isto é falso, e nenhuma
 * superfície de conectado (pets nomeados, vitrine, timeline, bairro) tem por
 * onde aparecer. Depois do aceite é verdadeiro. É a porta que as fatias G e J
 * consomem, e é de propósito que ela devolve `boolean` e não a aresta: quem
 * pergunta "podemos nos ver?" não precisa de `ref`, de instante nem de direção.
 */
export function habilitaDadoDeConectado(
  aresta: ArestaGuardada | undefined,
  agora: Instant,
): boolean {
  return aresta !== undefined && estadoNoApp(aresta, agora) === 'connected';
}

/**
 * Como a pessoa é escrita na tela quando o apelido é nulo.
 *
 * Nulo é o caso comum hoje: a coluna nasceu anulável porque as contas que já
 * existem nasceram sem ela, e **nenhum fluxo obriga a escolher apelido**. Com
 * nulo cai para o nome de exibição; com os dois nulos devolve `null`, e quem
 * desenha decide o texto — inventar aqui um "Alguém" faria o servidor escrever
 * na tela.
 */
export function nomeParaLer(pessoa: PessoaDaAresta): string | null {
  if (pessoa.apelido !== null && pessoa.apelido !== '') return `@${pessoa.apelido}`;
  return pessoa.nomeDeExibicao;
}

/**
 * A projeção de uma aresta, ou `undefined` quando ela não se projeta.
 *
 * `person` sai **sempre que a aresta se projeta**, e isso inclui o pendente
 * recebido: sem saber quem pediu não se decide nada, e "pedido recebido" é um
 * dos três caminhos que o próprio desenho reconhece como relação (plano 4-B).
 * O que `person` **não** carrega é qualquer coisa de conectado — nem bairro, nem
 * pets, nem contagem, nem foto.
 */
export function projetarConexao(
  aresta: ArestaGuardada,
  agora: Instant,
  comoIso: (instante: Instant) => string,
): ConexaoProjetada | undefined {
  const state = estadoNoApp(aresta, agora);
  if (state === undefined) return undefined;
  return {
    ref: aresta.ref,
    state,
    requested_at: comoIso(aresta.pedidoEm),
    person: {
      handle: aresta.outraPessoa.apelido,
      display_name: aresta.outraPessoa.nomeDeExibicao,
    },
  };
}
