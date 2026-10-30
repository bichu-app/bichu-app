/** Por que a conversa foi retida. */
export type MotivoDeRetencao = 'message_volume' | 'serial_finder';

/** Limites do contrato, num lugar só. */
export const TETO_DE_MENSAGENS_EM_24H = 200;
export const TETO_DE_CASOS_DISTINTOS_EM_24H = 3;

export interface ContagensDe24h {
  /**
   * Mensagens que ESTE participante mandou NESTA conversa nas últimas 24 h,
   * **incluindo a que está entrando**.
   */
  readonly mensagensDoParticipante: number;
  /**
   * Casos DISTINTOS em que esta conta escreveu nas últimas 24 h, **incluindo o desta
   * mensagem**.
   */
  readonly casosDistintosDaConta: number | undefined;
}

/** Decide se esta mensagem retém a conversa. */
export function retencaoDestaMensagem(contagens: ContagensDe24h): MotivoDeRetencao | null {
  const casos = contagens.casosDistintosDaConta;
  if (casos !== undefined && casos >= TETO_DE_CASOS_DISTINTOS_EM_24H) return 'serial_finder';
  if (contagens.mensagensDoParticipante > TETO_DE_MENSAGENS_EM_24H) return 'message_volume';
  return null;
}
