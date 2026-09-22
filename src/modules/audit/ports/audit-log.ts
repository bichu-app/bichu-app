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
  /** Refresh anterior a `sessions_invalid_before` (SEC-006). Tentativa negada. */
  | 'auth.refresh_rejected_revoked_session'
  | 'auth.sessions_revoked'
  | 'auth.password_changed'
  /** Tentativa de troca de senha recusada por senha atual errada (BICHUS-125). */
  | 'auth.password_change_refused'
  /**
   * BICHUS-48. A janela de reautenticacao de 5 minutos.
   *
   * Sao quatro eventos e nao dois, porque as duas metades respondem perguntas
   * diferentes numa investigacao de tomada de conta: `reauth_refused` em
   * sequencia e alguem testando senhas de dentro de uma sessao tomada;
   * `reauth_window_refused` em sequencia e alguem tentando reaproveitar,
   * mover de aparelho ou trocar o escopo de uma janela. O `metadata` carrega o
   * escopo e o motivo interno da recusa -- que nunca sai no corpo da resposta.
   */
  | 'auth.reauth_granted'
  | 'auth.reauth_refused'
  | 'auth.reauth_window_used'
  | 'auth.reauth_window_refused'
  | 'auth.password_rehashed'
  | 'auth.password_reset_completed'
  | 'auth.email_verified'
  // Autorização
  | 'authz.denied'
  | 'profile.updated'
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
  /** BICHUS-43. A conversa nasceu de um aviso. Ator anônimo quando o achador não tem conta. */
  | 'conversation.opened'
  /**
   * BICHUS-43, critérios 10 e 11. A conversa foi retida para revisão humana.
   * O metadado carrega o MOTIVO, e nunca o texto das mensagens.
   */
  | 'conversation.held_for_review'
  | 'conversation.reported'
  | 'conversation.blocked'
  | 'moderation.decided'
  | 'privacy.account_deletion_requested'
  | 'privacy.data_export_requested'
  /**
   * BICHUS-92. A conta entrou (ou atualizou) a localizacao de referencia.
   * O metadado carrega a ORIGEM e a PRECISAO; a coordenada nao entra aqui,
   * pela regra do cabecalho deste arquivo e porque a trilha sobrevive a
   * exclusao da conta de proposito.
   */
  | 'privacy.reference_location_set'
  /** A conta saiu do raio de alerta por `DELETE /v1/me/location`. */
  | 'privacy.reference_location_cleared'
  // Aparelho e token de push (BICHUS-91)
  /**
   * `POST /v1/me/devices`. O metadado carrega plataforma e permissao; **o token
   * nao entra**, pela regra do cabecalho deste arquivo ("nunca registrar ...
   * token de qualquer especie") e porque a trilha sobrevive a exclusao da conta.
   */
  | 'device.registered'
  /**
   * O aparelho deixou de existir, e o metadado diz por que (`reason`). E a
   * UNICA memoria da revogacao: a linha e apagada, e a trilha nao referencia
   * `users`, entao ela responde "por que este aparelho parou de receber?"
   * inclusive depois de a conta ter sido apagada.
   */
  | 'device.revoked';

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
