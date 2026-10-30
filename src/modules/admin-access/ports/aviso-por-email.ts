/**
 * O envio de e-mail de que o painel precisa: o aviso de sessao aberta (D46) e o
 * aviso aos administradores depois de um "nao fui eu" (D62).
 */
export interface MensagemDoPainel {
  readonly para: string;
  readonly assunto: string;
  /** Texto puro. */
  readonly corpo: string;
}

export interface AvisoPorEmail {
  enviar(mensagem: MensagemDoPainel): Promise<void>;
}
