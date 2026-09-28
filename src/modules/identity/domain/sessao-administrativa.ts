/**
 * As regras da sessao do backoffice (ADR-0027 item 2; D35, D37, D38 e D42 de
 * `docs/04-seguranca.md`), sem banco, sem HTTP e sem relogio proprio.
 *
 * Os quatro numeros de D38 moram aqui e so aqui:
 *
 * | | valor | por que |
 * |---|---|---|
 * | inatividade | 30 min | estacao largada aberta; cobre reuniao, nao cobre almoco |
 * | teto absoluto | 12 h desde a senha | o uso nao o empurra, e a reautenticacao nao o faz renascer |
 * | janela de reautenticacao | 5 min, uso unico, um escopo | D40 |
 * | renovacao de `last_seen_at` | no maximo 1 por minuto | uma escrita por clique seria o banco pagando a navegacao |
 */
import { createHmac } from 'node:crypto';

import type { Instant } from '../../../shared/types/brands.js';

export const INATIVIDADE_EM_MS = 30 * 60 * 1000;
export const TETO_ABSOLUTO_EM_MS = 12 * 60 * 60 * 1000;
export const JANELA_DE_REAUTENTICACAO_ADMINISTRATIVA_EM_MS = 5 * 60 * 1000;
export const INTERVALO_MINIMO_DE_RENOVACAO_EM_MS = 60 * 1000;

/**
 * Os papeis que abrem sessao administrativa. Na v1 so `admin` (decisao do
 * cliente de 23/09). E o mesmo conjunto de `AdminRole` no contrato.
 */
export const PAPEIS_QUE_ABREM_SESSAO_ADMINISTRATIVA: readonly string[] = ['admin'];

/**
 * Os papeis que tornam a conta DEDICADA (D42): recusada no login e na renovacao
 * do app, com o mesmo 401 de credencial invalida. `moderator` esta aqui mesmo
 * sem entrar no painel da v1: a porta do tutor, frouxa por decisao (ADR-0020),
 * nao pode servir de oraculo da senha de nenhuma conta com papel.
 */
export const PAPEIS_DE_CONTA_DEDICADA: readonly string[] = ['admin', 'moderator'];

export function abreSessaoAdministrativa(papeis: readonly string[]): boolean {
  return papeis.some((papel) => PAPEIS_QUE_ABREM_SESSAO_ADMINISTRATIVA.includes(papel));
}

export function ehContaDedicada(papeis: readonly string[]): boolean {
  return papeis.some((papel) => PAPEIS_DE_CONTA_DEDICADA.includes(papel));
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

/**
 * O instante da senha de uma sessao nova, nunca anterior a barreira da conta.
 *
 * `sessions_invalid_before` pode estar ate um segundo a frente do relogio
 * (`instanteDeRevogacao`, em `session.ts`). Uma sessao gravada com
 * `created_at = agora` logo depois de um "sair de todas" nasceria do lado
 * revogado e cairia na primeira requisicao. Quem acabou de digitar a senha
 * certa nasce do lado que vale; o teto de 12 horas conta a partir dali.
 */
export function instanteDaSenha(agora: Instant, barreira: Instant): Instant {
  return Math.max(agora, barreira) as Instant;
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

/**
 * A conferencia de toda requisicao (ADR-0027 item 2). O papel e a conta ativa
 * sao conferidos por quem chama; aqui sao os prazos e a revogacao.
 *
 * A barreira compara em milissegundo, estrita, como `refreshFoiRevogado`: os
 * dois instantes sao gravados pelo mesmo relogio, e nao ha `iat` truncado a
 * compensar.
 */
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

/**
 * O token anti-CSRF da sessao, DERIVADO do valor do cookie (D39).
 *
 * O contrato manda devolver o `csrf_token` em `GET /v1/admin/session`, depois
 * de um F5, e o apendice A.1 guarda so o hash dele. As duas coisas cabem juntas
 * porque o token e HMAC-SHA256 do rotulo com o proprio valor do cookie como
 * chave: o servidor o recalcula a partir do cookie que chega em toda
 * requisicao, sem guardar nada em claro, e quem nao le o cookie (`HttpOnly`)
 * nao consegue calcula-lo. Troca junto com o identificador, como D39 exige.
 */
export function derivarTokenAntiCsrf(valorDoCookie: string): string {
  return createHmac('sha256', valorDoCookie).update(ROTULO_DO_ANTI_CSRF).digest('base64url');
}

/** Os oito primeiros bytes do hash da sessao, em hexadecimal: o que vai na trilha. */
export function etiquetaDaSessao(tokenHash: Buffer): string {
  return tokenHash.subarray(0, 8).toString('hex');
}
