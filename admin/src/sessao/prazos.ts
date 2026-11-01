export const AVISO_DE_INATIVIDADE_MS = 2 * 60_000;
export const AVISO_DO_TETO_MS = 10 * 60_000;
export const FOLGA_DA_RENOVACAO_MS = 60_000;

export interface Prazos {
  duracaoDaInatividadeMs: number;
  /** Estimativa atual do fim por inatividade (epoch ms). */
  fimPorInatividade: number;
  /** O teto de 12 h, que o uso nao empurra (epoch ms). */
  teto: number;
}

export function prazosDaResposta(
  sessao: { idle_expires_at: string; absolute_expires_at: string },
  agora: number,
): Prazos {
  const fimPorInatividade = Date.parse(sessao.idle_expires_at);
  const teto = Date.parse(sessao.absolute_expires_at);
  return {
    duracaoDaInatividadeMs: Math.max(0, fimPorInatividade - agora),
    fimPorInatividade: Math.min(fimPorInatividade, teto),
    teto,
  };
}

/**
 * Uma resposta da API chegou agora: a inatividade renova, descontada a folga, sem
 * passar do teto.
 */
export function renovarPorUso(prazos: Prazos, agora: number): Prazos {
  const estimado = agora - FOLGA_DA_RENOVACAO_MS + prazos.duracaoDaInatividadeMs;
  return { ...prazos, fimPorInatividade: Math.min(Math.max(estimado, prazos.fimPorInatividade), prazos.teto) };
}

export type SituacaoDosPrazos = 'normal' | 'aviso-de-inatividade' | 'aviso-do-teto' | 'vencida';

export interface LeituraDosPrazos {
  avisarInatividade: boolean;
  /** S.2: a 10 min do teto, o banner persistente. */
  avisarTeto: boolean;
  vencida: boolean;
  /** Quando olhar de novo (epoch ms): o proximo limiar que muda alguma coisa. */
  proximaMudanca: number;
}

export function lerPrazos(prazos: Prazos, agora: number): LeituraDosPrazos {
  const fim = Math.min(prazos.fimPorInatividade, prazos.teto);
  const vencida = agora >= fim;
  const avisarInatividade = !vencida && agora >= prazos.fimPorInatividade - AVISO_DE_INATIVIDADE_MS;
  const avisarTeto = !vencida && agora >= prazos.teto - AVISO_DO_TETO_MS;
  const limiares = [prazos.fimPorInatividade - AVISO_DE_INATIVIDADE_MS, prazos.teto - AVISO_DO_TETO_MS, fim].filter(
    (t) => t > agora,
  );
  return { avisarInatividade, avisarTeto, vencida, proximaMudanca: limiares.length ? Math.min(...limiares) : agora + 60_000 };
}
