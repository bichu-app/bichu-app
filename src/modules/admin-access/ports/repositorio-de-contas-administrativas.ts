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
  /** Pelo e-mail JA normalizado. */
  buscarPorEmail(email: string): Promise<ContaAdministrativa | undefined>;
  buscarPorId(id: AdminAccountId): Promise<ContaAdministrativa | undefined>;
  /** As contas ativas, para os avisos que vao a TODOS os administradores (D46, D61). */
  listarAtivas(): Promise<readonly ContaAdministrativa[]>;
  registrarLogin(id: AdminAccountId, agora: Instant): Promise<void>;
  /** Rehash transparente (D19): mesmos parametros vigentes do app. */
  regravarSenha(id: AdminAccountId, passwordPhc: string, agora: Instant): Promise<void>;
  /** Empurra `sessions_invalid_before`, sem nunca recua-la. */
  empurrarBarreira(trx: TransacaoDeEscrita, id: AdminAccountId, barreira: Instant): Promise<void>;
  /**
   * `SELECT ... FOR UPDATE` na conta: serializa as falhas de login concorrentes da
   * mesma conta, para que duas tentativas simultaneas nao contem nove cada e nenhuma
   * bloqueie (D44).
   */
  travarParaContarFalhas(trx: TransacaoDeEscrita, id: AdminAccountId): Promise<void>;
  /** Grava o bloqueio que so `conta-admin redefinir-senha` desfaz. */
  bloquear(trx: TransacaoDeEscrita, id: AdminAccountId, motivo: MotivoDoBloqueio, agora: Instant): Promise<void>;
}
