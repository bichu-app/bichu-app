import type { Instant } from '../../../shared/types/brands.js';

/** O estado guardado na coluna. */
export type EstadoGuardado = 'pending' | 'accepted' | 'declined';

/** O estado no vocabulário do app. */
export type EstadoNoApp = 'pending_sent' | 'pending_received' | 'connected';

/** De onde o pedido nasceu. */
export type OrigemDoPedido =
  | 'anchored_case'
  | 'anchored_event'
  | 'presence_code'
  | 'invite_link'
  | 'people_search';

/** Como a outra pessoa é NOMEADA numa aresta. */
export interface PessoaDaAresta {
  readonly apelido: string | null;
  readonly nomeDeExibicao: string | null;
  /**
   * **O SELO DE VALIDADO** (emenda do ADR-0010, 21/10/2026, decisão do cliente): a
   * outra ponta tem um canal de contato confirmado.
   */
  readonly canalVerificado: boolean;
}

/** A aresta como o repositório a devolve, já recortada por conta habilitada. */
export interface ArestaGuardada {
  readonly ref: string;
  readonly estado: EstadoGuardado;
  /** Verdadeiro quando quem chama é `requester_user_id`. */
  readonly souQuemPediu: boolean;
  readonly pedidoEm: Instant;
  readonly expiraEm: Instant;
  /** O descanso de 90 dias, não nulo exatamente quando o estado é `declined`. */
  readonly descansoAte: Instant | null;
  readonly outraPessoa: PessoaDaAresta;
}

/** O que sai em resposta. Sem `UserId`, sem `id`, sem contagem de ninguém. */
export interface ConexaoProjetada {
  readonly ref: string;
  readonly state: EstadoNoApp;
  readonly requested_at: string;
  readonly person: {
    readonly handle: string | null;
    readonly display_name: string | null;
    /** O selo de validado. Ver [PessoaDaAresta.canalVerificado]. */
    readonly contact_channel_verified: boolean;
  };
}

/** A aresta já pode ser substituída por um pedido novo? */
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

/** O estado que o app vê, ou `undefined` quando a aresta **não se projeta**. */
export function estadoNoApp(aresta: ArestaGuardada, agora: Instant): EstadoNoApp | undefined {
  if (aresta.estado === 'accepted') return 'connected';
  if (!pendenteVivo(aresta, agora)) return undefined;
  if (aresta.estado === 'declined') return aresta.souQuemPediu ? 'pending_sent' : undefined;
  return aresta.souQuemPediu ? 'pending_sent' : 'pending_received';
}

/** **O predicado que todo dado de conectado atravessa.** */
export function habilitaDadoDeConectado(
  aresta: ArestaGuardada | undefined,
  agora: Instant,
): boolean {
  return aresta !== undefined && estadoNoApp(aresta, agora) === 'connected';
}

/** Como a pessoa é escrita na tela quando o apelido é nulo. */
export function nomeParaLer(pessoa: PessoaDaAresta): string | null {
  if (pessoa.apelido !== null && pessoa.apelido !== '') return `@${pessoa.apelido}`;
  return pessoa.nomeDeExibicao;
}

/** A projeção de uma aresta, ou `undefined` quando ela não se projeta. */
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
      contact_channel_verified: aresta.outraPessoa.canalVerificado,
    },
  };
}
