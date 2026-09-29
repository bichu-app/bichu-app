import { comoData } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';

/**
 * O bloqueio da conta do painel por falhas de login (ADR-0027 item 5, D44).
 *
 * O contrato declara dois tetos por e-mail em `openAdminSession`: 5 falhas em
 * 15 minutos (balde, cai sozinho) e 10 em 24 horas. O segundo NAO e so balde:
 * ele grava `admin_accounts.blocked_reason = 'failed_logins'`, e o bloqueio so
 * cai com `conta-admin redefinir-senha` (item 20.3), nunca com o fim da janela.
 * Por isso a contagem e duravel: sai da trilha (`admin.session.denied` com
 * `reason = 'bad_password'` e a conta como recurso), e nao do balde em memoria,
 * que um reinicio do processo zeraria.
 *
 * So conta a SENHA ERRADA de conta que existe. E-mail sem conta nao tem o que
 * bloquear, e conta desativada ou ja bloqueada ja esta fechada.
 */

/** Dez falhas em vinte e quatro horas: o numero do contrato (`x-rate-limit`). */
export const FALHAS_QUE_BLOQUEIAM = 10;
export const JANELA_DAS_FALHAS_EM_MS = 24 * 60 * 60 * 1000;

/** O motivo gravado em `audit.events.metadata.reason` que a contagem soma. */
export const MOTIVO_DA_FALHA_QUE_CONTA = 'bad_password';

/**
 * A tentativa atual bloqueia a conta? `anteriores` sao as falhas ja gravadas na
 * janela, SEM a atual (a atual e gravada na mesma transacao, depois da
 * contagem). A decima falha e a que bloqueia.
 */
export function atingiuOBloqueio(anteriores: number): boolean {
  if (!Number.isInteger(anteriores) || anteriores < 0) {
    throw new RangeError(`contagem de falhas invalida: ${String(anteriores)}`);
  }
  return anteriores + 1 >= FALHAS_QUE_BLOQUEIAM;
}

/** O inicio da janela para a tentativa feita em `agora`. */
export function inicioDaJanela(agora: Instant): Date {
  return comoData((agora - JANELA_DAS_FALHAS_EM_MS) as Instant);
}
