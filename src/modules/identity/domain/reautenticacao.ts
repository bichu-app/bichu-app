/** Regras da janela de reautenticação. */
import type { Instant } from '../../../shared/types/brands.js';
import type { ReauthScope } from '../../../shared/http/route-definition.js';

/**
 * 300 segundos, e o número vem do contrato (`expires_in` de `POST /auth/reauth`) e
 * do critério 10 da BICHUS-48.
 */
export const JANELA_DE_REAUTENTICACAO_EM_SEGUNDOS = 300;

/** Quando a janela emitida agora deixa de valer. */
export function expiracaoDaJanela(emitidaEm: Instant): Instant {
  return (emitidaEm + JANELA_DE_REAUTENTICACAO_EM_SEGUNDOS * 1000) as Instant;
}

/** A linha, na linguagem do domínio. */
export interface JanelaDeReautenticacao {
  readonly id: string;
  readonly userId: string;
  readonly escopo: ReauthScope;
  /** `jti` do token de acesso que pediu a janela. */
  readonly acessoJti: string;
  readonly emitidaEm: Instant;
  readonly expiraEm: Instant;
  readonly consumidaEm: Instant | null;
}

/** Por que a janela não serve. */
export type MotivoDaRecusa =
  | 'expirada'
  | 'escopo_diferente'
  | 'outra_sessao'
  | 'ja_consumida'
  | 'anterior_a_barreira'
  | 'de_outra_conta';

export type VeredictoDaJanela =
  | { readonly vale: true }
  | { readonly vale: false; readonly motivo: MotivoDaRecusa };

export interface ApresentacaoDaJanela {
  readonly userId: string;
  readonly escopoExigido: ReauthScope;
  readonly acessoJti: string;
  /** `users.sessions_invalid_before` da conta que apresenta. */
  readonly barreiraDaConta: Instant;
  readonly agora: Instant;
}

/** As cinco amarras, na ordem que não vaza nada. */
export function conferirJanela(
  janela: JanelaDeReautenticacao,
  apresentacao: ApresentacaoDaJanela,
): VeredictoDaJanela {
  if (janela.userId !== apresentacao.userId) {
    return { vale: false, motivo: 'de_outra_conta' };
  }
  if (janela.consumidaEm !== null) {
    return { vale: false, motivo: 'ja_consumida' };
  }
  if (janela.expiraEm <= apresentacao.agora) {
    return { vale: false, motivo: 'expirada' };
  }
  if (janela.escopo !== apresentacao.escopoExigido) {
    return { vale: false, motivo: 'escopo_diferente' };
  }
  if (janela.acessoJti !== apresentacao.acessoJti) {
    return { vale: false, motivo: 'outra_sessao' };
  }
  if (janela.emitidaEm < apresentacao.barreiraDaConta) {
    return { vale: false, motivo: 'anterior_a_barreira' };
  }
  return { vale: true };
}
