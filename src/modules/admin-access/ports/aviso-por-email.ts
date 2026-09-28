/**
 * O envio de e-mail de que o painel precisa: o aviso de sessao aberta (D46) e
 * o aviso aos administradores depois de um "nao fui eu" (D62).
 *
 * Porta propria, e nao `identity/ports/mailer.ts`: `admin-access` so enxerga de
 * `identity` a porta de senha (ADR-0027 item 20.1). A forma e a mesma, e o
 * ponto de composicao passa o mesmo transporte; o adaptador continua sendo o
 * unico lugar que valida o destinatario contra a gramatica do transporte.
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
