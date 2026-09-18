/**
 * Porta da trilha de auditoria.
 *
 * É a única coisa que outro módulo enxerga de `audit` (§6 de
 * docs/03-arquitetura.md). Quem grava um evento não sabe, e não precisa saber,
 * que existe um esquema separado e um papel de banco sem `UPDATE` nem `DELETE`
 * do outro lado.
 *
 * **O ator é sempre o UUID interno, nunca o e-mail** (BICHUS-56, critério 3), e
 * é por isso que `actorUserId` é `UserId` e não `string`: passar um e-mail aqui
 * não compila.
 *
 * **Nunca registrar** senha, token de qualquer espécie, código de tag em claro,
 * coordenada bruta nem conteúdo de mensagem (docs/04-seguranca.md 9).
 */
import type { UserId } from '../../../shared/types/brands.js';

/**
 * Ações da trilha. União fechada pelo mesmo motivo de `ProblemType`: ação
 * inventada no meio do código não compila, e a lista de eventos obrigatórios
 * fica verificável em vez de depender de quem lembrou de chamar.
 */
export type AuditAction =
  // Identidade e sessão
  | 'auth.account_created'
  | 'auth.login_succeeded'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.session_refreshed'
  | 'auth.refresh_reuse_detected'
  | 'auth.sessions_revoked'
  | 'auth.password_changed'
  | 'auth.password_rehashed'
  | 'auth.password_reset_completed'
  | 'auth.email_verified'
  // Autorização
  | 'authz.denied'
  // Cadastro do pet
  | 'pet.created'
  | 'pet.updated'
  | 'pet.deleted'
  // Tag, caso, conversa e moderação entram com as histórias que as criam.
  | 'tag.issued'
  | 'tag.revoked'
  | 'lost_case.opened'
  | 'lost_case.closed'
  | 'lost_case.alert_dispatched'
  | 'match.candidate_decided'
  | 'conversation.reported'
  | 'conversation.blocked'
  | 'moderation.decided'
  | 'privacy.account_deletion_requested'
  | 'privacy.data_export_requested';

export type ActorKind = 'user' | 'anonymous' | 'system';

export interface AuditEvent {
  readonly actorKind: ActorKind;
  /** Obrigatório quando `actorKind` é `user`, e proibido nos demais. */
  readonly actorUserId?: UserId | undefined;
  /** Endereço de origem em claro. A porta o transforma em HMAC; o domínio não. */
  readonly actorIp?: string | undefined;
  readonly correlationId?: string | undefined;
  readonly action: AuditAction;
  readonly resourceKind: string;
  readonly resourceId?: string | undefined;
  readonly before?: Record<string, unknown> | undefined;
  readonly after?: Record<string, unknown> | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface AuditLog {
  record(event: AuditEvent): Promise<void>;
}
