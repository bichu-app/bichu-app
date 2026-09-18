/**
 * Porta de envio de e-mail transacional.
 *
 * ## Por que o envio é síncrono, e não pela fila
 *
 * A fila (`jobs`) existe e seria o lugar natural — mas o payload dela **é
 * gravado**, e o que precisa chegar ao e-mail é o token **em claro**. Os
 * critérios 6 de `BICHUS-79` e 4 de `BICHUS-77` são explícitos: o token é
 * *"guardado apenas como SHA-256"*. Enfileirar colocaria o valor em claro numa
 * linha de banco que sobrevive ao envio, esperando alguém consultar a tabela de
 * trabalhos para investigar outra coisa.
 *
 * O custo é latência num caminho raro, e ela é aceitável: quem pede um link de
 * recuperação está numa tela que já diz "o link chega em instantes".
 *
 * ## O que esta porta não faz
 *
 * Não monta corpo de mensagem a partir de dado do usuário sem escapar, e não
 * aceita HTML de fora. O conteúdo é montado por quem chama, a partir de
 * modelos nossos — e-mail com HTML de terceiro é a mesma classe de problema que
 * mídia servida na origem da aplicação.
 */

export interface Mensagem {
  readonly para: string;
  readonly assunto: string;
  /** Texto puro. O produto não manda HTML no MVP. */
  readonly corpo: string;
}

export interface Mailer {
  enviar(mensagem: Mensagem): Promise<void>;
}
