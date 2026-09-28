/**
 * Persistencia da sessao do backoffice (ADR-0027 item 2, apendice A.1) e da
 * janela de reautenticacao administrativa (D40).
 *
 * As escritas recebem a transacao da escrita auditada: sessao aberta, sessao
 * encerrada, sessao rotacionada e janela aberta so existem junto com o evento
 * da trilha que as registra (D49). As leituras e a renovacao de uso nao sao
 * escrita administrativa e rodam fora dela.
 */
import type { TransacaoDeEscrita } from '../../audit/ports/audit-log.js';
import type { EscopoDeReautenticacaoAdministrativa } from '../../../shared/http/route-definition.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';

/** Os cinco motivos do apendice A.1. O conjunto exato esta em `conjunto-exato-dos-checks.test.ts`. */
export type MotivoDeRevogacaoAdministrativa =
  | 'logout'
  | 'rotated'
  | 'role_removed'
  | 'account_invalidated'
  | 'disavowed';

export interface SessaoAdministrativaArmazenada {
  readonly id: string;
  readonly userId: UserId;
  readonly tokenHash: Buffer;
  readonly csrfTokenHash: Buffer;
  readonly createdAt: Instant;
  readonly lastSeenAt: Instant;
  readonly idleExpiresAt: Instant;
  readonly absoluteExpiresAt: Instant;
  readonly revokedAt: Instant | null;
}

export interface NovaSessaoAdministrativa {
  readonly id: string;
  readonly userId: UserId;
  readonly tokenHash: Buffer;
  readonly csrfTokenHash: Buffer;
  readonly createdAt: Instant;
  readonly lastSeenAt: Instant;
  readonly idleExpiresAt: Instant;
  readonly absoluteExpiresAt: Instant;
  readonly userAgent: string | undefined;
  readonly ipHmac: Buffer | null;
}

export interface NovaJanelaAdministrativa {
  readonly id: string;
  readonly sessionId: string;
  readonly userId: UserId;
  readonly escopo: EscopoDeReautenticacaoAdministrativa;
  readonly tokenHash: Buffer;
  readonly emitidaEm: Instant;
  readonly expiraEm: Instant;
}

export interface ConsumoDaJanelaAdministrativa {
  readonly tokenHash: Buffer;
  readonly sessionId: string;
  readonly userId: UserId;
  readonly escopo: EscopoDeReautenticacaoAdministrativa;
  readonly agora: Instant;
}

export interface SessaoAdministrativaRepository {
  buscarPorHash(tokenHash: Buffer): Promise<SessaoAdministrativaArmazenada | undefined>;
  /** `user_roles` da conta, lido a cada requisicao (D37). */
  papeisDaConta(userId: UserId): Promise<readonly string[]>;
  renovarUso(id: string, agora: Instant, idleExpiresAt: Instant): Promise<void>;

  criar(trx: TransacaoDeEscrita, nova: NovaSessaoAdministrativa): Promise<void>;
  /** Revoga UMA sessao ainda viva. Devolve se revogou (falso: ja estava revogada). */
  revogar(trx: TransacaoDeEscrita, id: string, motivo: MotivoDeRevogacaoAdministrativa, agora: Instant): Promise<boolean>;
  revogarTodasDaConta(
    trx: TransacaoDeEscrita,
    userId: UserId,
    motivo: MotivoDeRevogacaoAdministrativa,
    agora: Instant,
  ): Promise<number>;
  /** Empurra `users.sessions_invalid_before`, sem nunca recua-la. */
  empurrarBarreira(trx: TransacaoDeEscrita, userId: UserId, barreira: Instant, agora: Instant): Promise<void>;

  criarJanela(trx: TransacaoDeEscrita, nova: NovaJanelaAdministrativa): Promise<void>;
  /**
   * Consome a janela: o `UPDATE` que confere e o que marca, na mesma clausula
   * (ADR-0021). Devolve se consumiu.
   */
  consumirJanela(consumo: ConsumoDaJanelaAdministrativa): Promise<boolean>;
}
