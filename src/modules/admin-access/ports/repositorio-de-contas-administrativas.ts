/**
 * O cadastro do painel, `admin_accounts` (ADR-0027 item 20.1).
 *
 * Nada aqui le `users`, `user_identities`, `local_credentials` nem
 * `user_roles`: o login do painel nao acha conta do app, e essa e a D42 na
 * forma de 28/09. `cadastros-separados` (P21) vigia o codigo deste modulo.
 *
 * As escritas que acompanham um evento de trilha recebem a transacao da
 * escrita auditada (D49). O registro do login e o rehash transparente nao sao
 * escrita administrativa: rodam fora dela, como no app.
 */
import type { TransacaoDeEscrita } from '../../audit/ports/audit-log.js';
import type { PapelAdministrativo } from '../../../shared/http/route-definition.js';
import type { AdminAccountId, Instant } from '../../../shared/types/brands.js';

export type EstadoDaContaAdministrativa = 'active' | 'disabled';
export type MotivoDoBloqueio = 'failed_logins' | 'disavowed';

export interface ContaAdministrativa {
  readonly id: AdminAccountId;
  readonly email: string;
  readonly displayName: string;
  readonly papel: PapelAdministrativo;
  readonly passwordPhc: string;
  readonly status: EstadoDaContaAdministrativa;
  readonly blockedReason: MotivoDoBloqueio | null;
  /** `sessions_invalid_before`: sessao criada antes dela nao vale. */
  readonly sessionsInvalidBefore: Instant;
}

export interface RepositorioDeContasAdministrativas {
  /** Pelo e-mail JA normalizado. So `admin_accounts`. */
  buscarPorEmail(email: string): Promise<ContaAdministrativa | undefined>;
  buscarPorId(id: AdminAccountId): Promise<ContaAdministrativa | undefined>;
  /** As contas ativas, para os avisos que vao a TODOS os administradores (D46, D61). */
  listarAtivas(): Promise<readonly ContaAdministrativa[]>;
  registrarLogin(id: AdminAccountId, agora: Instant): Promise<void>;
  /** Rehash transparente (D19): mesmos parametros vigentes do app. */
  regravarSenha(id: AdminAccountId, passwordPhc: string, agora: Instant): Promise<void>;
  /** Empurra `sessions_invalid_before`, sem nunca recua-la. */
  empurrarBarreira(trx: TransacaoDeEscrita, id: AdminAccountId, barreira: Instant): Promise<void>;
  /** Grava o bloqueio que so `conta-admin redefinir-senha` desfaz. Nao sobrescreve bloqueio anterior. */
  bloquear(trx: TransacaoDeEscrita, id: AdminAccountId, motivo: MotivoDoBloqueio, agora: Instant): Promise<void>;
}
