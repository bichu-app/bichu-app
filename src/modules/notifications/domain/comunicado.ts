/** Quantos comunicados cabem por dia. */
export const TETO_DIARIO_DE_COMUNICADOS = 3;

export interface Comunicado {
  /** Identificador opaco. Nao e UUID (ADR-0010). */
  readonly ref: string;
  readonly titulo: string;
  readonly corpo: string;
  readonly disparadoEm: Date;
  /** O NOME DE EXIBICAO da conta de painel que disparou. */
  readonly disparadoPor: string;
  /** Quantas caixas ele alcancou NO INSTANTE do disparo. */
  readonly destinatarios: number;
}

export interface PaginaDeComunicados {
  readonly itens: readonly Comunicado[];
  readonly pagina: number;
  readonly limite: number;
  readonly total: number;
}

/** O que o SERVIDOR contribui para a pre-visualizacao. */
export interface JanelaDeDisparo {
  /** Quantas contas habilitadas o disparo alcancaria AGORA. */
  readonly alcancaria: number;
  /** Quantos ainda cabem hoje. */
  readonly restamHoje: number;
  /**
   * O teto diario. Sai na resposta em vez de ser constante do painel: duas copias do
   * mesmo numero divergem, e a que diverge e a que diz "resta 1" sobre um teto que o
   * banco ja fechou.
   */
  readonly tetoDiario: number;
}

/** O rascunho que o painel manda, ja conferido pelo schema do contrato. */
export interface RascunhoDeComunicado {
  readonly titulo: string;
  readonly corpo: string;
}
