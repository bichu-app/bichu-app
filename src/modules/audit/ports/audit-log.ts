/** Porta da trilha de auditoria. */
import type { DbTransaction } from '../../../shared/db/pool.js';
import type { AdminAccountId, UserId } from '../../../shared/types/brands.js';

/**
 * Ações da trilha. União fechada pelo mesmo motivo de `ProblemType`: ação
 * inventada no meio do código não compila, e a lista de eventos obrigatórios fica
 * verificável em vez de depender de quem lembrou de chamar.
 */
export type AuditAction =
  | 'auth.account_created'
  | 'auth.login_succeeded'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.session_refreshed'
  | 'auth.refresh_reuse_detected'
  /** Refresh anterior a `sessions_invalid_before` (SEC-006). */
  | 'auth.refresh_rejected_revoked_session'
  | 'auth.sessions_revoked'
  | 'auth.password_changed'
  /** Tentativa de troca de senha recusada por senha atual errada (BICHUS-125). */
  | 'auth.password_change_refused'
  /** BICHUS-48. A janela de reautenticacao de 5 minutos. */
  | 'auth.reauth_granted'
  | 'auth.reauth_refused'
  | 'auth.reauth_window_used'
  | 'auth.reauth_window_refused'
  | 'auth.password_rehashed'
  | 'auth.password_reset_completed'
  | 'auth.email_verified'
  | 'auth.passkey_registered'
  | 'auth.passkey_revoked'
  /**
   * Contador de assinatura REPETIU ou RETROCEDEU: repeticao de uma assercao
   * capturada, ou autenticador clonado.
   */
  | 'auth.passkey_counter_regression'
  /**
   * Nasceu uma sessao a partir do link do e-mail, e NAO de uma senha (`POST
   * /v1/auth/email-verification/confirm`).
   */
  | 'auth.session_opened_by_email_link'
  /** Pediram a troca do e-mail da conta (BICHUS-42). */
  | 'auth.email_change_requested'
  /** A troca foi confirmada no endereço novo e `users.email` mudou. */
  | 'auth.email_changed'
  | 'authz.denied'
  /** ADR-0027 item 20.3 (D51). */
  | 'admin.account.created'
  | 'admin.account.password_reset'
  | 'admin.account.disabled'
  | 'admin.account.enabled'
  | 'admin.account.sessions_closed'
  | 'profile.updated'
  | 'pet.created'
  | 'pet.updated'
  | 'pet.deleted'
  | 'tag.issued'
  | 'tag.revoked'
  | 'lost_case.opened'
  /** O tutor corrigiu ONDE e QUANDO o pet foi visto (`PATCH /v1/lost-cases/{id}`). */
  | 'lost_case.updated'
  | 'lost_case.closed'
  /** O tutor REABRIU o caso que ele havia encerrado (`reopenLostCase`). */
  | 'lost_case.reopened'
  | 'lost_case.alert_dispatched'
  /** O tutor pediu o REENVIO do alerta (`POST /v1/lost-cases/{id}/alerts`). */
  | 'lost_case.alert_resent'
  | 'match.candidate_decided'
  /** BICHUS-43. A conversa nasceu de um aviso. */
  | 'conversation.opened'
  /** BICHUS-43, critérios 10 e 11. */
  | 'conversation.held_for_review'
  | 'conversation.reported'
  /** FATIA E da frente de comunidade: bloquear alguem. */
  | 'user_block.created'
  | 'user_block.removed'
  /** FATIA E: denuncia de perfil, de foto ou de publicacao. */
  | 'content_report.created'
  | 'conversation.blocked'
  | 'moderation.decided'
  /**
   * ADR-0025 emenda 3. Uma conta do app criou, editou ou cancelou um encontro da
   * `Rede`.
   */
  | 'network_event.submitted'
  | 'network_event.updated'
  | 'network_event.cancelled'
  /** `suggestDirectoryEntry`. */
  | 'directory_suggestion.submitted'
  | 'privacy.account_deletion_requested'
  /**
   * BICHUS-215. O expurgo definitivo de 30 dias concluiu e a linha de `users` deixou
   * de existir.
   */
  | 'privacy.account_purged'
  /** BICHUS-215, gatilho 4 do SEC-006. */
  | 'auth.session_disavowed'
  | 'privacy.data_export_requested'
  /** BICHUS-92. A conta entrou (ou atualizou) a localizacao de referencia. */
  | 'privacy.reference_location_set'
  /** A conta saiu do raio de alerta por `DELETE /v1/me/location`. */
  | 'privacy.reference_location_cleared'
  | 'device.registered'
  /** O aparelho deixou de existir, e o metadado diz por que (`reason`). */
  | 'device.revoked'
  | 'pet_transfer.started'
  | 'pet_transfer.accepted'
  /** Ator anonimo quando o cancelamento veio pelo link do e-mail, sem conta. */
  | 'pet_transfer.cancelled'
  /** A posse mudou e as tags cairam. */
  | 'pet_transfer.consummated'
  /** FATIA F (18/10/2026). A conexao entre pessoas, SIMETRICA, com aceite. */
  | 'connection.requested'
  | 'connection.accepted'
  | 'connection.declined'
  | 'connection.cancelled'
  | 'connection.undone'
  | 'connection.removed_by_block'
  /**
   * 20/10/2026, decisao do cliente: O CONVITE DO PROPRIO PERFIL, que alimenta o LINK
   * e o QR.
   */
  | 'connection.invite.issued'
  | 'connection.invite.revoked'
  | AcaoAdministrativa;

/** As acoes da superficie administrativa, como valor e como tipo. */
export const ACOES_ADMINISTRATIVAS = [
  'admin.session.opened',
  'admin.session.denied',
  'admin.session.closed',
  'admin.session.all_closed',
  'admin.session.reauthenticated',
  'admin.guard.denied',
  'admin.store_partner.created',
  'admin.store_partner.updated',
  'admin.store_item.created',
  'admin.store_item.updated',
  'admin.store_item.published',
  'admin.store_item.retired',
  'admin.store_tag.created',
  'admin.store_tag.updated',
  'admin.network_event.created',
  'admin.network_event.updated',
  'admin.network_event.relocated',
  'admin.network_event.cancelled',
  'admin.network_event.removed',
  'admin.network_event.access_changed',
  'admin.network_join_request.listed',
  'admin.network_join_request.approved',
  'admin.network_join_request.declined',
  'admin.help_request.attended',
  'admin.directory_entry.created',
  'admin.directory_entry.updated',
  'admin.directory_suggestion.approved',
  'admin.directory_suggestion.declined',

  'admin.directory_review.removed',
  'admin.collar_tag_request.fulfilled',
  'admin.collar_tag_request.declined',
  'admin.collar_tag_request.delivery_updated',
  'admin.moderation_report.content_removed',
  'admin.moderation_report.dismissed',
  'admin.broadcast.dispatched',
  'admin.catalog_image.intent_created',
  /** D62: alguem com a caixa de entrada do administrador respondeu "nao fui eu". */
  'admin.session.disavowed',
] as const;

export type AcaoAdministrativa = (typeof ACOES_ADMINISTRATIVAS)[number];

/**
 * Quem agiu. `admin` é a conta do PAINEL (`admin_accounts`, ADR-0027 item 20.2), e
 * vai em coluna própria: a trilha nunca mistura UUIDs de duas tabelas em
 * `actor_user_id`.
 */
export type ActorKind = 'user' | 'anonymous' | 'system' | 'admin';

/**
 * O ator, como união discriminada: `user` carrega `actorUserId`, `admin` carrega
 * `actorAdminId`, e os outros dois não carregam nenhum.
 */
export type AtorDaTrilha =
  | { readonly actorKind: 'user'; readonly actorUserId: UserId; readonly actorAdminId?: undefined }
  | { readonly actorKind: 'admin'; readonly actorAdminId: AdminAccountId; readonly actorUserId?: undefined }
  | {
      readonly actorKind: 'anonymous' | 'system';
      readonly actorUserId?: undefined;
      readonly actorAdminId?: undefined;
    };

export type AuditEvent = AtorDaTrilha & DadosDoEventoDeTrilha;

export interface DadosDoEventoDeTrilha {
  /** Endereço de origem em claro. */
  readonly actorIp?: string | undefined;
  readonly correlationId?: string | undefined;
  readonly action: AuditAction;
  readonly resourceKind: string;
  readonly resourceId?: string | undefined;
  readonly before?: Record<string, unknown> | undefined;
  readonly after?: Record<string, unknown> | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

/**
 * A trilha do app. `record` abre a PROPRIA transacao e, se falhar, avisa por
 * `onFailure` sem derrubar o pedido: um incidente no esquema de auditoria nao e
 * motivo para o tutor nao conseguir avisar que o pet sumiu.
 */
export interface AuditLog {
  record(event: AuditEvent): Promise<void>;
}

/** A transacao em que a escrita e a trilha acontecem juntas. */
export type TransacaoDeEscrita = DbTransaction;

/** A forma transacional da trilha (ADR-0027 item 8). */
export interface TrilhaTransacional {
  recordIn(trx: TransacaoDeEscrita, event: AuditEvent): Promise<void>;
}

/**
 * A soma de um campo numerico de `metadata` nos eventos de um ator, numa janela,
 * lida NA transacao de quem chama (D56).
 */
export interface ContagemNaTrilha {
  somarNaJanela(
    trx: TransacaoDeEscrita,
    consulta: {
      /**
       * A leitura auditada e do painel: a conta e de `admin_accounts` (ADR-0027 item
       * 20.2).
       */
      readonly actorAdminId: AdminAccountId;
      readonly action: AuditAction;
      readonly campo: string;
      readonly desde: Date;
    },
  ): Promise<{ readonly total: number; readonly maisAntigo: Date | null }>;

  /**
   * Quantos eventos de `action` sobre `resourceId`, com `metadata.reason = motivo`,
   * desde `desde`.
   */
  contarNaJanela(
    trx: TransacaoDeEscrita,
    consulta: {
      readonly action: AuditAction;
      readonly resourceId: string;
      readonly motivo: string;
      readonly desde: Date;
    },
  ): Promise<number>;
}

/** O que o trabalho de uma escrita auditada devolve: o resultado e o evento. */
export interface ResultadoAuditado<T> {
  readonly resultado: T;
  /**
   * O evento, montado DEPOIS da escrita (ja com o `id` que ela gerou e com o `after`
   * que ela produziu).
   */
  readonly evento: AuditEvent;
}

/**
 * **A interface que toda escrita administrativa usa.** Uma transacao, a escrita
 * dentro dela, o evento gravado na mesma transacao, e o `COMMIT` so depois dos
 * dois.
 */
export interface EscritaAuditada {
  executar<T>(trabalho: (trx: TransacaoDeEscrita) => Promise<ResultadoAuditado<T>>): Promise<T>;
}
