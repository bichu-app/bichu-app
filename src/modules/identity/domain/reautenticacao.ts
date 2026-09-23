/**
 * Regras da janela de reautenticação. Puras: nada aqui conhece banco, HTTP nem
 * relógio do sistema.
 *
 * ## O que "reautenticado" quer dizer, por extenso
 *
 * Uma janela é um registro com quatro amarras, e **as quatro precisam valer no
 * instante em que a operação destrutiva chega**. Nenhuma substitui outra:
 *
 * 1. **Prazo.** 300 segundos contados de `emitidaEm`. Usar a janela não a
 *    prorroga — o prazo é escrito uma vez, na emissão.
 * 2. **Finalidade.** A janela nasce para **uma** operação e é recusada nas
 *    demais. Sem isso, quem reautentica para revogar uma plaquinha emite, sem
 *    saber, uma autorização para excluir a conta.
 * 3. **Sessão.** Presa ao `jti` do token de acesso que a pediu. Copiada para
 *    outro aparelho, ela não vale lá.
 * 4. **Uso único.** Consumida pela operação que a apresenta. A segunda
 *    apresentação do mesmo valor é recusada, inclusive dentro dos 5 minutos.
 *
 * E há uma quinta que não está na janela e sim na conta: a **barreira** do
 * SEC-006. Uma janela emitida antes de `users.sessions_invalid_before` não vale
 * mais. É isso que faz troca de senha, "sair de todos os aparelhos" e exclusão
 * de conta matarem a janela aberta antes delas, sem que nenhuma dessas
 * operações precise varrer a tabela — elas já empurram a barreira, e a barreira
 * é lida aqui.
 *
 * ## A recusa é uma só, de fora
 *
 * As cinco amarras têm motivos distintos e a resposta é a mesma: **401 com
 * `reauthentication-required`**. O motivo interno existe para a trilha e para o
 * log, e não para o corpo: dizer "o escopo era outro" ou "essa janela já foi
 * usada" a quem está do outro lado descreve a máquina para quem a está atacando,
 * e quem tem a senha certa nunca vê nenhuma dessas mensagens.
 */
import type { Instant } from '../../../shared/types/brands.js';
import type { ReauthScope } from '../../../shared/http/route-definition.js';

/**
 * 300 segundos, e o número vem do contrato (`expires_in` de
 * `POST /auth/reauth`) e do critério 10 da BICHUS-48. Ele está aqui uma vez
 * só: `expires_in` da resposta e `expires_at` da linha saem do mesmo lugar, e
 * dois lugares divergiriam no dia em que alguém mudasse um deles.
 */
export const JANELA_DE_REAUTENTICACAO_EM_SEGUNDOS = 300;

/** Quando a janela emitida agora deixa de valer. */
export function expiracaoDaJanela(emitidaEm: Instant): Instant {
  return (emitidaEm + JANELA_DE_REAUTENTICACAO_EM_SEGUNDOS * 1000) as Instant;
}

/** A linha, na linguagem do domínio. Sem `token_hash`: quem o confere é a busca. */
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

/**
 * Por que a janela não serve. Todos viram o MESMO 401 na borda; a distinção
 * existe para a trilha.
 */
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

/**
 * As cinco amarras, na ordem que não vaza nada.
 *
 * A ordem importa por um motivo só, e não é desempenho: `de_outra_conta` vem
 * primeiro porque uma janela de outra conta não deve nem ser comparada com o
 * escopo desta. Depois disso a ordem é indiferente de fora, porque a resposta
 * é a mesma nos cinco casos.
 */
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
  // SEC-006, e a comparação é `<` e não `<=` pelo mesmo motivo que
  // `tokenFoiRevogado`: a barreira alcança o que foi emitido ANTES dela.
  if (janela.emitidaEm < apresentacao.barreiraDaConta) {
    return { vale: false, motivo: 'anterior_a_barreira' };
  }
  return { vale: true };
}
