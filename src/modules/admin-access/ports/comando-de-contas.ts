/**
 * As escritas do comando `conta-admin` sobre `admin_accounts` (ADR-0027 item
 * 20.3). So o comando no servidor as usa: nenhuma rota HTTP define, redefine
 * nem reativa conta do painel (D61).
 *
 * Cada escrita e UMA transacao com o evento da trilha dentro dela (D49, regra
 * 4 do item 20.3): falha da trilha desfaz a escrita. O ator e `system`, e quem
 * digitou vai em `metadata.operator`.
 */
import type { AdminAccountId, Instant } from '../../../shared/types/brands.js';
import type { EstadoDaContaAdministrativa, MotivoDoBloqueio } from './repositorio-de-contas-administrativas.js';

export interface ContaNoComando {
  readonly id: AdminAccountId;
  readonly email: string;
  readonly displayName: string;
  readonly status: EstadoDaContaAdministrativa;
  readonly blockedReason: MotivoDoBloqueio | null;
}

/** Uma linha de `listar`: nunca o hash. */
export interface ContaListada {
  readonly email: string;
  readonly displayName: string;
  readonly status: EstadoDaContaAdministrativa;
  readonly blockedReason: MotivoDoBloqueio | null;
  readonly lastLoginAt: Date | null;
}

interface Escrita {
  readonly operador: string;
  readonly agora: Instant;
}

export interface NovaContaDoPainel extends Escrita {
  readonly email: string;
  readonly nome: string;
  readonly passwordPhc: string;
}

export interface TrocaDeSenha extends Escrita {
  readonly id: AdminAccountId;
  readonly passwordPhc: string;
}

export interface MudancaDeConta extends Escrita {
  readonly id: AdminAccountId;
}

export interface ComandoDeContas {
  /** Pelo e-mail JA normalizado, inclusive conta desativada. */
  buscarPorEmail(email: string): Promise<ContaNoComando | undefined>;
  listar(): Promise<readonly ContaListada[]>;
  /** Cria a conta `admin`, com trilha `admin.account.created`. */
  criar(nova: NovaContaDoPainel): Promise<AdminAccountId | 'email_em_uso'>;
  /**
   * Troca a senha, empurra a barreira, revoga as sessoes (`password_reset`) e
   * limpa `blocked_*`, com trilha `admin.account.password_reset`.
   */
  redefinirSenha(troca: TrocaDeSenha): Promise<{ readonly sessoesRevogadas: number }>;
  /**
   * `status = 'disabled'` e revoga as sessoes (`account_disabled`), com trilha
   * `admin.account.disabled`. `mudou` falso quando a conta ja estava desativada.
   */
  desativar(mudanca: MudancaDeConta): Promise<{ readonly mudou: boolean; readonly sessoesRevogadas: number }>;
  /**
   * Volta a `active` COM senha nova no mesmo passo, empurra a barreira e limpa
   * `blocked_*`, com trilha `admin.account.enabled`. `mudou` falso quando a
   * conta ja estava ativa.
   */
  reativar(troca: TrocaDeSenha): Promise<{ readonly mudou: boolean }>;
  /**
   * Empurra a barreira e revoga as sessoes (`account_invalidated`), sem mexer
   * na senha, com trilha `admin.account.sessions_closed`.
   */
  encerrarSessoes(mudanca: MudancaDeConta): Promise<{ readonly sessoesRevogadas: number }>;
}
