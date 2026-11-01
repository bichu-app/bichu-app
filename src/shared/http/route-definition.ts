/** Efeito fora do processo. */
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
 * As finalidades de `X-Reauth-Token`, como o contrato as enumera em `POST
 * /auth/reauth` e as exige em `x-reauth-scope`.
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
 * `AdminRole`.
 */
export type PapelAdministrativo = 'admin';

/**
 * As finalidades de `X-Admin-Reauth-Token` (D40), como o contrato as enumera em
 * `AdminReauthScope`.
 */
export type EscopoDeReautenticacaoAdministrativa =
  | 'store_item_retirement'
  | 'network_event_relocation'
  | 'network_event_cancellation'
  | 'network_event_removal'
  | 'network_event_access_change';

/**
 * O `x-audit` da operacao administrativa: a acao gravada em `audit.events` na
 * mesma transacao da escrita, e o tipo de recurso.
 */
export interface DeclaracaoDeTrilha {
  readonly action: `admin.${string}`;
  readonly resourceKind: string;
}

/**
 * Os baldes compartilhados do backoffice (ADR-0027 item 11, D52), como o contrato
 * os nomeia na `note` de `x-rate-limit`.
 */
export type BaldeCompartilhado =
  | 'admin_write'
  | 'admin_publication'
  /**
   * FATIA E da frente de comunidade: **20 denuncias por dia no total**, somadas as
   * tres operacoes (perfil, foto e publicacao).
   */
  | 'community_report';

export interface RateLimitEntry {
  /**
   * O balde compartilhado. Ausente, a chave e da propria operacao (o padrao de todo
   * o app).
   */
  readonly bucket?: BaldeCompartilhado;
  readonly dimension: readonly string[];
  /**
   * `rows_returned` (D56) conta LINHAS devolvidas, e nao requisicoes: a porta de
   * teto nao o aplica, e a subida o lista como nao aplicado.
   */
  readonly counts?: 'requests' | 'distinct_identities' | 'distinct_cases' | 'distinct_emails' | 'rows_returned';
  readonly appliesTo?: 'invalid_attempts';
  readonly when?: 'pet_lost' | 'pet_not_lost';
  readonly limit: number;
  readonly window: string;
  readonly onExceed: OnExceed;
}

type NonEmpty<T> = readonly [T, ...T[]];

interface RouteBase {
  readonly operationId: string;
  readonly method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  readonly path: string;
  readonly noChallenge?: true;
  readonly reauthScope?: ReauthScope;
  readonly adminRoles?: NonEmpty<PapelAdministrativo>;
  readonly adminPublic?: true;
  readonly audit?: DeclaracaoDeTrilha;
  readonly adminReauthScope?: EscopoDeReautenticacaoAdministrativa;
}

interface RouteWithEffects extends RouteBase {
  readonly effects: NonEmpty<Effect>;
  readonly rateLimit: NonEmpty<RateLimitEntry>;
}

interface RouteWithoutEffects extends RouteBase {
  readonly effects: readonly [];
  readonly rateLimit?: readonly RateLimitEntry[];
}

export type RouteDefinition = RouteWithEffects | RouteWithoutEffects;

/** Declara uma rota. */
export function defineRoute<const T extends RouteDefinition>(route: T): T {
  return route;
}
