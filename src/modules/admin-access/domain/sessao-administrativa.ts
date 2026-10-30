/**
 * As regras da sessao do backoffice (ADR-0027 itens 2 e 20; D35, D37, D38 e D62 de
 * `docs/04-seguranca.md`), sem banco, sem HTTP e sem relogio proprio.
 */
import { createHmac } from 'node:crypto';

import type { Instant } from '../../../shared/types/brands.js';

export const INATIVIDADE_EM_MS = 30 * 60 * 1000;
export const TETO_ABSOLUTO_EM_MS = 12 * 60 * 60 * 1000;
export const JANELA_DE_REAUTENTICACAO_ADMINISTRATIVA_EM_MS = 5 * 60 * 1000;
export const INTERVALO_MINIMO_DE_RENOVACAO_EM_MS = 60 * 1000;
/** Validade do link "nao fui eu" do aviso de sessao aberta (D62). */
export const VALIDADE_DO_NAO_FUI_EU_EM_MS = 7 * 24 * 60 * 60 * 1000;

/** Os papeis que abrem sessao administrativa. */
export const PAPEIS_QUE_ABREM_SESSAO_ADMINISTRATIVA: readonly string[] = ['admin'];

export function abreSessaoAdministrativa(papeis: readonly string[]): boolean {
  return papeis.some((papel) => PAPEIS_QUE_ABREM_SESSAO_ADMINISTRATIVA.includes(papel));
}

/** Os papeis administrativos da conta, na forma que `AdminSession.roles` declara. */
export function papeisDoPainel(papeis: readonly string[]): string[] {
  return papeis.filter((papel) => PAPEIS_QUE_ABREM_SESSAO_ADMINISTRATIVA.includes(papel));
}

export interface PrazosDaSessao {
  /** O instante da senha. E dele que o teto de 12 horas conta. */
  readonly createdAt: Instant;
  readonly idleExpiresAt: Instant;
  readonly absoluteExpiresAt: Instant;
}

/** O instante da senha de uma sessao nova, nunca anterior a barreira da conta. */
export function instanteDaSenha(agora: Instant, barreira: Instant): Instant {
  return Math.max(agora, barreira) as Instant;
}

/**
 * O instante que `sessions_invalid_before` recebe ao derrubar as sessoes da conta:
 * nunca antes da barreira atual e sempre no segundo seguinte a ela.
 */
export function instanteDaBarreira(agora: Instant, barreiraAtual: Instant): Instant {
  return Math.max(agora, Math.ceil(barreiraAtual / 1000) * 1000 + 1) as Instant;
}

export function prazosDeNovaSessao(instante: Instant): PrazosDaSessao {
  const absoluteExpiresAt = (instante + TETO_ABSOLUTO_EM_MS) as Instant;
  return {
    createdAt: instante,
    idleExpiresAt: Math.min(instante + INATIVIDADE_EM_MS, absoluteExpiresAt) as Instant,
    absoluteExpiresAt,
  };
}

/** A inatividade renovada pelo uso, sem nunca passar do teto. */
export function inatividadeRenovada(agora: Instant, absoluteExpiresAt: Instant): Instant {
  return Math.min(agora + INATIVIDADE_EM_MS, absoluteExpiresAt) as Instant;
}

export function precisaRenovarUso(ultimoUso: Instant, agora: Instant): boolean {
  return agora - ultimoUso >= INTERVALO_MINIMO_DE_RENOVACAO_EM_MS;
}

export interface EstadoArmazenado {
  readonly createdAt: Instant;
  readonly idleExpiresAt: Instant;
  readonly absoluteExpiresAt: Instant;
  readonly revokedAt: Instant | null;
}

export type VeredictoDaSessao = 'valida' | 'revogada' | 'inativa' | 'vencida' | 'anterior_a_barreira';

/** A conferencia de toda requisicao (ADR-0027 item 2). */
export function avaliarSessao(
  sessao: EstadoArmazenado,
  barreira: Instant,
  agora: Instant,
): VeredictoDaSessao {
  if (sessao.revokedAt !== null) return 'revogada';
  if (agora >= sessao.absoluteExpiresAt) return 'vencida';
  if (agora >= sessao.idleExpiresAt) return 'inativa';
  if (sessao.createdAt < barreira) return 'anterior_a_barreira';
  return 'valida';
}

const ROTULO_DO_ANTI_CSRF = 'bichu-admin-csrf-v1';

/** O token anti-CSRF da sessao, DERIVADO do valor do cookie (D39). */
export function derivarTokenAntiCsrf(valorDoCookie: string): string {
  return createHmac('sha256', valorDoCookie).update(ROTULO_DO_ANTI_CSRF).digest('base64url');
}

/** Os oito primeiros bytes do hash da sessao, em hexadecimal: o que vai na trilha. */
export function etiquetaDaSessao(tokenHash: Buffer): string {
  return tokenHash.subarray(0, 8).toString('hex');
}
