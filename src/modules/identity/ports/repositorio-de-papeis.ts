/**
 * A persistencia do comando de papel (BICHUS-260, ADR-0027 D51).
 *
 * Toda operacao que muda estado grava o evento da trilha **na mesma
 * transacao** (D49): conceder papel sem autor gravado e exatamente o estado que
 * a trilha existe para impedir, entao falha da trilha desfaz a concessao.
 *
 * O ator e `system`, porque quem executa e um comando no servidor e nao uma
 * sessao de pessoa. Quem digitou vai em `metadata.operator`, que e texto livre
 * informado no terminal: nao e identidade autenticada, e a trilha diz isso pelo
 * `actor_kind`.
 */
import type { AuditAction, AuditEvent } from '../../audit/ports/audit-log.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';

export type EstadoDaConta = 'active' | 'suspended' | 'deletion_requested';

export interface ContaParaPapel {
  readonly id: UserId;
  readonly status: EstadoDaConta;
  readonly papeis: readonly string[];
}

export interface PedidoDeMudancaDePapel {
  readonly userId: UserId;
  readonly papel: string;
  readonly operador: string;
  readonly agora: Instant;
}

export interface ResultadoDaConcessao {
  /** `false` quando a conta ja tinha o papel: nada foi escrito, nem na trilha. */
  readonly mudou: boolean;
  /** Familias de refresh vivas no momento da concessao, derrubadas pela barreira. */
  readonly familiasMoveisDerrubadas: number;
}

export interface ResultadoDaRevogacao {
  readonly mudou: boolean;
  readonly sessoesAdministrativasRevogadas: number;
  /** Os papeis que sobraram. Sem `tutor`, a conta continua sem entrar pelo app. */
  readonly papeisRestantes: readonly string[];
}

export interface NovaContaAdministrativa {
  readonly email: string;
  readonly papel: string;
  /** PHC do mesmo esquema do login (`password.ts`). A senha em claro nunca chega aqui. */
  readonly passwordPhc: string;
  readonly operador: string;
  readonly agora: Instant;
}

export interface RepositorioDePapeis {
  /** Conta nao excluida com esse e-mail, ja normalizado. */
  buscarContaPorEmail(email: string): Promise<ContaParaPapel | undefined>;
  /**
   * Grava o papel e, se ele e novo, empurra `sessions_invalid_before` (D42:
   * conceder derruba as sessoes moveis) e grava `authz.role_granted`, tudo numa
   * transacao. Idempotente pelo estado.
   */
  conceder(pedido: PedidoDeMudancaDePapel): Promise<ResultadoDaConcessao>;
  /**
   * Apaga o papel, revoga as sessoes do painel com `role_removed` e grava
   * `authz.role_revoked`, numa transacao. Idempotente pelo estado.
   */
  revogar(pedido: PedidoDeMudancaDePapel): Promise<ResultadoDaRevogacao>;
  /**
   * Cria a conta dedicada (sem `tutor`: ela nao entra pelo app) com o papel,
   * e grava `auth.account_created` e `authz.role_granted` na mesma transacao.
   */
  criarContaAdministrativa(nova: NovaContaAdministrativa): Promise<UserId | 'email_em_uso'>;
}

export interface DadosDoEventoDePapel {
  readonly userId: UserId;
  readonly operador: string;
  readonly before?: Record<string, unknown> | undefined;
  readonly after?: Record<string, unknown> | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

/**
 * O evento do comando, montado de um jeito so. `surface` e `command` depois do
 * que veio de fora, como em `eventoAdministrativo`: quem monta os dados nao
 * consegue apagar de onde a escrita saiu.
 */
export function eventoDoComandoDePapel(action: AuditAction, dados: DadosDoEventoDePapel): AuditEvent {
  return {
    actorKind: 'system',
    action,
    resourceKind: 'user',
    resourceId: dados.userId,
    before: dados.before,
    after: dados.after,
    metadata: {
      ...dados.metadata,
      operator: dados.operador,
      surface: 'command',
      command: 'conceder-papel',
    },
  };
}
