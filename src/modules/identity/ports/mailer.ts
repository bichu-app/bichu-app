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
 * ## O que a porta EXIGE do adaptador: recusar `para` que quebre a gramática
 *
 * Quem implementar esta porta tem que **recusar** `para` que carregue qualquer
 * caractere com significado na gramática do transporte, em vez de limpar ou de
 * confiar. O endereço acaba interpolado em cabeçalho (`To:`, RFC 5322) e em
 * comando de protocolo (`RCPT TO:<…>`, RFC 5321), e o conjunto perigoso é maior
 * que o CRLF:
 *
 * 1. **`\r` e `\n`** fecham a linha nos dois protocolos: o que vem depois vira
 *    cabeçalho novo — um `Bcc:` escolhido por outra pessoa — ou comando novo.
 * 2. **`>`** fecha o caminho do `RCPT TO:<…>` sem quebra de linha nenhuma, e o
 *    resto do endereço vira argumento do comando: parâmetro ESMTP de aviso de
 *    entrega (`NOTIFY=`, `ORCPT=`, RFC 3461) apontado para onde o atacante
 *    quiser. Uma conferência que só procurasse CRLF passaria este inteiro, e foi
 *    o que ficou aberto entre BICHUS-131 e BICHUS-130.
 * 3. **Espaço** separa os argumentos do comando, e é o que torna o item 2 útil.
 * 4. **Controles C0 e C1** — NUL trunca em MTA escrito em C; VT, FF e NEL
 *    (`U+0085`) são lidos como quebra por parte dos analisadores de cabeçalho.
 *    O `\s` do JavaScript não cobre `U+0085`: quem confiar nele erra.
 * 5. **`U+2028` e `U+2029`**, os separadores de linha e de parágrafo do Unicode.
 * 6. **`,`, `;`, `:`** separam endereços numa lista de cabeçalho, e o `:` monta
 *    a rota de origem do RFC 821 (`<@relay:vitima@…>`), que faz a mensagem
 *    passar por um servidor escolhido por outra pessoa.
 * 7. **`"` e `\`** abrem literal citado e par escapado, que um adaptador que não
 *    saiba emitir os dois vai entregar com sentido diferente do que leu.
 *
 * O resultado de qualquer um deles é o atacante recebendo cópia integral do
 * aviso de segurança da vítima, com o link de redefinição de senha dentro.
 *
 * **Recusa, e não limpeza**: endereço com CRLF não é endereço mal formatado, é
 * tentativa, e limpar entregaria a mensagem em silêncio a um endereço que
 * ninguém escreveu. A mensagem de erro **não** carrega o endereço, que é dado
 * pessoal e acaba em log.
 *
 * O mesmo vale para o remetente que o adaptador tirar da configuração: ele é
 * interpolado nos mesmos dois lugares, e a origem ser variável de ambiente baixa
 * a probabilidade sem mudar o efeito.
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
