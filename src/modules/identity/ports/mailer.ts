export interface Mensagem {
  /**
   * Destinatário. O adaptador **recusa** este valor se ele carregar qualquer
   * caractere com significado na gramática do transporte — a classe é bem maior que
   * `\r` e `\n`, e está no cabeçalho deste arquivo.
   */
  readonly para: string;
  readonly assunto: string;
  /** Texto puro. O produto não manda HTML no MVP. */
  readonly corpo: string;
}

export interface Mailer {
  enviar(mensagem: Mensagem): Promise<void>;
}
