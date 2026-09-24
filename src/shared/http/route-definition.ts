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

/**
 * Os papeis que abrem sessao administrativa, como o contrato os enumera em
 * `AdminRole`. Na v1 so `admin` (decisao do cliente de 23/09); `moderator`
 * entra como valor novo quando a moderacao entrar, pelo caminho de lista
 * fechada do ADR-0023 secao 3.
 */
export type PapelAdministrativo = 'admin';

/**
 * As finalidades de `X-Admin-Reauth-Token` (D40), como o contrato as enumera em
 * `AdminReauthScope`. Nao se misturam com `ReauthScope`: o token do app e preso
 * ao `jti` do JWT movel, e este a sessao administrativa (ADR-0027 item 5).
 */
export type EscopoDeReautenticacaoAdministrativa =
  | 'store_item_retirement'
  | 'network_event_relocation'
  | 'network_event_cancellation'
  | 'network_event_removal';

/**
 * O `x-audit` da operacao administrativa: a acao gravada em `audit.events` na
 * mesma transacao da escrita, e o tipo de recurso. A acao e so uma cadeia aqui
 * porque `shared/` nao conhece o modulo `audit`; quem a transforma em
 * `AuditAction` e `eventoAdministrativo`, que recusa acao fora da lista.
 */
export interface DeclaracaoDeTrilha {
  readonly action: `admin.${string}`;
  readonly resourceKind: string;
}

/**
 * Os baldes compartilhados do backoffice (ADR-0027 item 11, D52), como o
 * contrato os nomeia na `note` de `x-rate-limit`. O teto e da CONTA, somadas as
 * operacoes, e nao de cada operacao: 120 escritas em 10 minutos no total, e
 * nao 120 por operacao.
 */
export type BaldeCompartilhado = 'admin_write' | 'admin_publication';

export interface RateLimitEntry {
  /**
   * O balde compartilhado. Ausente, a chave e da propria operacao (o padrao de
   * todo o app). Presente, operacoes diferentes somam no mesmo contador.
   */
  readonly bucket?: BaldeCompartilhado;
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
  /**
   * `x-admin-roles` do contrato: o papel minimo da operacao administrativa.
   * Quem confere e a guarda do prefixo `/v1/admin` (`superficie-administrativa.ts`),
   * uma vez so, lendo esta declaracao; nao ha verificacao de papel dentro de
   * caso de uso (ADR-0027 item 7). Rota com esta declaracao fora do prefixo
   * administrativo nao sobe, e rota do prefixo sem ela tambem nao.
   */
  readonly adminRoles?: NonEmpty<PapelAdministrativo>;
  /**
   * A unica rota do prefixo administrativo que dispensa sessao: o login
   * (`security: []` no contrato). Ela continua passando pela guarda de
   * superficie, pela recusa do Bearer e pela conferencia de `Origin`.
   */
  readonly adminPublic?: true;
  /** `x-audit` do contrato. Obrigatorio em toda escrita administrativa. */
  readonly audit?: DeclaracaoDeTrilha;
  /** `x-admin-reauth-scope` do contrato. */
  readonly adminReauthScope?: EscopoDeReautenticacaoAdministrativa;
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
