/**
 * Definição de rota.
 *
 * Este arquivo existe para transformar uma regra normativa em erro de
 * compilação. A regra (§5 de docs/03-arquitetura.md, predicado da §4.12 de
 * docs/04-seguranca.md):
 *
 *   > Toda operação declara `x-effects`. Operação cujo `x-effects` NÃO é vazio
 *   > declara também `x-rate-limit`.
 *
 * A esteira verifica isso na especificação. Aqui a verificação acontece antes:
 * **uma rota com efeito e sem teto não compila.** É o mesmo princípio aplicado
 * ao endereçamento sem id nas rotas do achador — eliminar o arranjo em vez de
 * depender de a checagem estar correta.
 *
 * Use sempre o auxiliar `defineRoute` do fim do arquivo: o modificador `const`
 * no parâmetro de tipo preserva a tupla, então `effects: ['notifies']` continua
 * sendo uma tupla não vazia e a checagem vale. Declarar o objeto solto, sem o
 * auxiliar, faz a tupla desabar em `Effect[]` e a garantia se perde em silêncio.
 *
 * Exige TypeScript 5.0 ou superior (modificador `const` de parâmetro de tipo).
 */

/** Efeito fora do processo. Os seis, e só estes. */
export type Effect =
  | 'notifies'
  | 'human_work'
  | 'expensive_query'
  | 'verifies_secret'
  | 'reveals_credential'
  | 'irreversible_write';

export type OnExceed =
  | 'serve_cache'
  | 'challenge'
  | 'log_and_alert'
  | 'group_notification'
  | 'notify_once_and_review'
  | 'notify_owner'
  | 'hold_for_review'
  | 'accept_and_deduplicate'
  | 'raise_queue_priority'
  | 'accept_and_defer_dispatch'
  | 'deny_429';

/**
 * As finalidades de `X-Reauth-Token`, como o contrato as enumera em
 * `POST /auth/reauth` e as exige em `x-reauth-scope`.
 *
 * `email_change` e `session_revocation` entraram na BICHUS-48. O primeiro
 * estava declarado em `POST /me/email-change` e ausente do enum de `scope`, o
 * que tornava aquela operacao inalcancavel: nenhum token podia ser emitido para
 * ela. O segundo e a exigencia nova de `POST /auth/logout-all`.
 *
 * **Trocar a senha nao esta aqui**, e a secao 7.5 de `docs/04-seguranca.md` a
 * lista entre as seis. `PUT /auth/password` confere `current_password` no
 * proprio corpo desde a BICHUS-77, entao exigir as duas coisas pediria a mesma
 * senha duas vezes na mesma requisicao. A divergencia esta registrada na
 * BICHUS-48 e na pauta de refinamento.
 */
export type ReauthScope =
  | 'account_deletion'
  | 'email_change'
  | 'data_export'
  | 'pet_transfer'
  | 'tag_revocation'
  | 'session_revocation';

export interface RateLimitEntry {
  readonly dimension: readonly string[];
  readonly counts?: 'requests' | 'distinct_identities' | 'distinct_cases' | 'distinct_emails';
  readonly appliesTo?: 'invalid_attempts';
  readonly when?: 'pet_lost' | 'pet_not_lost';
  readonly limit: number;
  readonly window: string;
  readonly onExceed: OnExceed;
}

type NonEmpty<T> = readonly [T, ...T[]];

interface RouteBase {
  /** Mesmo `operationId` da especificação. É a chave de rastreio entre os dois. */
  readonly operationId: string;
  readonly method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  readonly path: string;
  /**
   * `challenge` não pode ser usado aqui: não há quem responda ao desafio.
   * Espelha `x-no-challenge` da especificação.
   */
  readonly noChallenge?: true;
  readonly reauthScope?: ReauthScope;
}

/** Tem efeito fora do processo: teto é OBRIGATÓRIO. */
interface RouteWithEffects extends RouteBase {
  readonly effects: NonEmpty<Effect>;
  readonly rateLimit: NonEmpty<RateLimitEntry>;
}

/** Sem efeito: teto é opcional. A regra é piso, não teto (§5). */
interface RouteWithoutEffects extends RouteBase {
  readonly effects: readonly [];
  readonly rateLimit?: readonly RateLimitEntry[];
}

export type RouteDefinition = RouteWithEffects | RouteWithoutEffects;

/**
 * Declara uma rota.
 *
 *   export const route = defineRoute({
 *     operationId: 'openLostCase',
 *     method: 'post',
 *     path: '/pets/:petId/lost-cases',
 *     effects: ['notifies', 'expensive_query', 'human_work'],
 *     rateLimit: [{ dimension: ['account'], limit: 5, window: '24h',
 *                   onExceed: 'accept_and_defer_dispatch' }],
 *   });
 *
 * **Remover `rateLimit` do exemplo acima é erro de compilação**, não achado de
 * revisão: com `effects` não vazio, nenhuma das duas formas da união casa.
 */
export function defineRoute<const T extends RouteDefinition>(route: T): T {
  return route;
}
