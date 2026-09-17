/**
 * O que o módulo `identity` exige da persistência.
 *
 * A porta é declarada por quem a **exige**, nunca por quem a implementa (§6 e
 * §11.3 de docs/03-arquitetura.md). Por isso as assinaturas falam da linguagem
 * do domínio — conta, credencial, família de sessão — e não de tabela.
 */
import type { Instant, TokenHash, UserId } from '../../../shared/types/brands.js';

export interface Conta {
  readonly id: UserId;
  readonly email: string;
  readonly emailVerifiedAt: Date | null;
  readonly displayName: string | null;
  readonly phoneE164: string | null;
  readonly phoneVerifiedAt: Date | null;
  readonly referencePostalCode: string | null;
  readonly referenceNeighborhood: string | null;
  readonly referenceCity: string | null;
  readonly referenceState: string | null;
  readonly pendingEmail: string | null;
  readonly emailDeliverable: boolean;
  readonly status: 'active' | 'suspended' | 'deletion_requested';
  readonly sessionsInvalidBefore: Instant;
  readonly createdAt: Date;
}

export interface CredencialLocal {
  readonly identityId: string;
  readonly userId: UserId;
  readonly passwordPhc: string;
  readonly mustChange: boolean;
}

export interface NovaConta {
  readonly email: string;
  readonly displayName: string | undefined;
  readonly acceptedTermsVersion: string | undefined;
  readonly passwordPhc: string;
  readonly agora: Instant;
}

export type MotivoDeRevogacao =
  | 'rotation'
  | 'reuse_detected'
  | 'logout'
  | 'password_changed'
  | 'account_deleted';

export interface RefreshArmazenado {
  readonly id: string;
  readonly userId: UserId;
  readonly familyId: string;
  readonly expiresAt: Instant;
  readonly absoluteExpiresAt: Instant;
  readonly staySignedIn: boolean;
  readonly rotatedToId: string | null;
  readonly revokedAt: Date | null;
}

export interface NovoRefresh {
  readonly id: string;
  readonly userId: UserId;
  readonly familyId: string;
  readonly tokenHash: TokenHash;
  readonly expiresAt: Instant;
  readonly absoluteExpiresAt: Instant;
  readonly staySignedIn: boolean;
  readonly userAgent: string | undefined;
  readonly ipHmac: Buffer | null;
}

export interface IdentityRepository {
  /**
   * Cria conta, vínculo `provider = 'local'` e credencial numa transação só.
   * Devolve `undefined` quando o e-mail já tem conta viva — e devolver em vez de
   * lançar é de propósito: quem chama precisa decidir o que a resposta revela.
   */
  criarContaLocal(nova: NovaConta): Promise<Conta | undefined>;

  buscarContaPorId(id: UserId): Promise<Conta | undefined>;
  buscarContaPorEmail(email: string): Promise<Conta | undefined>;
  buscarCredencialLocalPorEmail(email: string): Promise<CredencialLocal | undefined>;

  /** Regrava o hash com os parâmetros vigentes (rehash transparente). */
  regravarCredencial(identityId: string, passwordPhc: string, agora: Instant): Promise<void>;
  registrarLogin(identityId: string, agora: Instant): Promise<void>;

  gravarRefresh(novo: NovoRefresh): Promise<void>;
  buscarRefreshPorHash(hash: TokenHash): Promise<RefreshArmazenado | undefined>;

  /**
   * Consome o token apresentado e grava o sucessor **na mesma transação**.
   * Devolve `false` quando o token já havia sido consumido ou revogado — ler e
   * depois atualizar em dois passos permitiria a dois pedidos simultâneos
   * rotacionarem o mesmo token.
   */
  rotacionar(tokenAtualId: string, sucessor: NovoRefresh, agora: Instant): Promise<boolean>;

  /** Revoga a família inteira. Usada no logout e na detecção de reuso. */
  revogarFamilia(familyId: string, motivo: MotivoDeRevogacao, agora: Instant): Promise<number>;

  /** SEC-006: empurra `sessions_invalid_before` para agora. */
  invalidarSessoes(userId: UserId, agora: Instant): Promise<void>;
}
