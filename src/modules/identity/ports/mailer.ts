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
 *
 * ## O que a porta EXIGE do adaptador: recusar `para` com quebra de linha
 *
 * Quem implementar esta porta tem que **recusar** `para` que contenha `\r` ou
 * `\n`, em vez de limpar ou de confiar. O endereço acaba interpolado em
 * cabeçalho (`To:`) e em comando de protocolo (`RCPT TO:<…>`), e uma quebra no
 * meio dele fecha a linha: o que vem depois vira cabeçalho novo — um `Bcc:`
 * escolhido por outra pessoa — ou comando novo. O resultado é o atacante
 * recebendo cópia integral do aviso de segurança da vítima, com o link de
 * redefinição de senha dentro. Recusa, e não limpeza: endereço com CRLF não é
 * endereço mal formatado, é tentativa, e limpar entregaria a mensagem em
 * silêncio a um endereço que ninguém escreveu.
 *
 * Isto está escrito **aqui**, e não deixado por conta de quem chama, porque a
 * validação de forma do domínio (`emailTemFormaValida`, que recusa espaço em
 * branco) roda em **um único lugar**: o cadastro. Verificação, redefinição,
 * aviso de troca e aviso de reuso mandam o endereço que veio do banco, já
 * confiado. A garantia inteira depende de todo endereço ter entrado pelo
 * cadastro e de aquela validação nunca afrouxar — e nenhuma das duas coisas é
 * visível de dentro do adaptador. Quem escrever o transporte do provedor
 * (ADR-0009, Postmark) ou acrescentar um caminho que monte endereço de outra
 * fonte — importação, migração, campo administrativo — precisa nascer sabendo.
 */

export interface Mensagem {
  /**
   * Destinatário. O adaptador **recusa** este valor se ele tiver `\r` ou `\n`
   * — veja a exigência no cabeçalho deste arquivo. Não presuma que alguém já
   * validou antes: o único lugar que valida forma é o cadastro.
   */
  readonly para: string;
  readonly assunto: string;
  /** Texto puro. O produto não manda HTML no MVP. */
  readonly corpo: string;
}

export interface Mailer {
  enviar(mensagem: Mensagem): Promise<void>;
}
