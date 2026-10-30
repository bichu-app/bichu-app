/**
 * Persistencia da sessao do backoffice (ADR-0027 item 2, apendice A.1), da janela
 * de reautenticacao administrativa (D40) e do "nao fui eu" (D62).
 */
import type { TransacaoDeEscrita } from '../../audit/ports/audit-log.js';
import type { EscopoDeReautenticacaoAdministrativa } from '../../../shared/http/route-definition.js';
import type { AdminAccountId, Instant } from '../../../shared/types/brands.js';
import type { ContaAdministrativa } from './repositorio-de-contas-administrativas.js';

/** Os seis motivos do apendice A.1. */
export type MotivoDeRevogacaoAdministrativa =
  | 'logout'
  | 'rotated'
  | 'account_disabled'
  | 'account_invalidated'
  | 'disavowed'
  | 'password_reset';

export interface SessaoAdministrativaArmazenada {
  readonly id: string;
  readonly adminAccountId: AdminAccountId;
  readonly tokenHash: Buffer;
  readonly csrfTokenHash: Buffer;
  readonly createdAt: Instant;
  readonly lastSeenAt: Instant;
  readonly idleExpiresAt: Instant;
  readonly absoluteExpiresAt: Instant;
  readonly revokedAt: Instant | null;
}

/** A sessao e a conta dona dela, lidas numa consulta so a cada requisicao (D37). */
export interface SessaoComConta {
  readonly sessao: SessaoAdministrativaArmazenada;
  readonly conta: ContaAdministrativa;
}

export interface NovaSessaoAdministrativa {
  readonly id: string;
  readonly adminAccountId: AdminAccountId;
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
  readonly adminAccountId: AdminAccountId;
  readonly escopo: EscopoDeReautenticacaoAdministrativa;
  readonly tokenHash: Buffer;
  readonly emitidaEm: Instant;
  readonly expiraEm: Instant;
}

export interface ConsumoDaJanelaAdministrativa {
  readonly tokenHash: Buffer;
  readonly sessionId: string;
  readonly adminAccountId: AdminAccountId;
  readonly escopo: EscopoDeReautenticacaoAdministrativa;
  readonly agora: Instant;
}

export interface NovoAvisoDeSessao {
  readonly id: string;
  readonly adminAccountId: AdminAccountId;
  readonly sessionId: string;
  readonly tokenHash: Buffer;
  readonly expiraEm: Instant;
}

export interface AvisoDeSessaoValido {
  readonly id: string;
  readonly adminAccountId: AdminAccountId;
}

export interface SessaoAdministrativaRepository {
  /**
   * A sessao pelo hash do cookie, JUNTO com a conta dona dela: uma consulta so por
   * requisicao.
   */
  contaParaAGuarda(tokenHash: Buffer): Promise<SessaoComConta | undefined>;
  renovarUso(id: string, agora: Instant, idleExpiresAt: Instant): Promise<void>;

  criar(trx: TransacaoDeEscrita, nova: NovaSessaoAdministrativa): Promise<void>;
  /** Revoga UMA sessao ainda viva. */
  revogar(trx: TransacaoDeEscrita, id: string, motivo: MotivoDeRevogacaoAdministrativa, agora: Instant): Promise<boolean>;
  revogarTodasDaConta(
    trx: TransacaoDeEscrita,
    adminAccountId: AdminAccountId,
    motivo: MotivoDeRevogacaoAdministrativa,
    agora: Instant,
  ): Promise<number>;

  criarJanela(trx: TransacaoDeEscrita, nova: NovaJanelaAdministrativa): Promise<void>;
  /**
   * Consome a janela: o `UPDATE` que confere e o que marca, na mesma clausula
   * (ADR-0021).
   */
  consumirJanela(consumo: ConsumoDaJanelaAdministrativa): Promise<string | undefined>;
  /**
   * Desfaz UM consumo (QA bug 4): a janela `id`, da sessao, consumida exatamente em
   * `consumidaEm` (o instante que ESTA requisicao gravou) e ainda no prazo, volta a
   * valer.
   */
  devolverJanela(devolucao: {
    readonly id: string;
    readonly sessionId: string;
    readonly consumidaEm: Instant;
    readonly agora: Instant;
  }): Promise<boolean>;

  /** Grava o hash do token "nao fui eu" que vai no e-mail de sessao aberta (D62). */
  criarAviso(novo: NovoAvisoDeSessao): Promise<void>;
  /**
   * O aviso pelo hash, se ainda vale (nao consumido, nao vencido), TRAVADO ate o fim
   * da transacao (`FOR UPDATE`): dois cliques simultaneos nao revogam duas vezes nem
   * gastam o mesmo token duas vezes.
   */
  travarAvisoValido(trx: TransacaoDeEscrita, tokenHash: Buffer, agora: Instant): Promise<AvisoDeSessaoValido | undefined>;
  consumirAviso(trx: TransacaoDeEscrita, id: string, agora: Instant): Promise<void>;
}
