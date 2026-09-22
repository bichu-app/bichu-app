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
 * ## E a conferência é o ÚLTIMO passo: normalizar depois dela reabre o furo
 *
 * Esta é a parte que não se deduz da lista acima, e ela é a que vai pegar quem
 * escrever o próximo transporte.
 *
 * A conferência olha o texto que recebeu. Se o adaptador **transformar** o
 * endereço depois de conferir — e normalizar Unicode é uma transformação —, o
 * que vai para o fio não é o que foi conferido. Há **82 pontos de código** que
 * passam na conferência e viram caractere proibido depois de normalizados; o
 * mais afiado é `U+037E`, a interrogação grega, que vira `U+003B`, o ponto e
 * vírgula que separa endereços numa lista de cabeçalho.
 *
 * E ele não precisa de NFKC: `U+037E` vira `;` já sob **NFC**, a forma
 * canônica, que é a que um sistema bem-comportado aplica sem avisar. Um
 * `JSON.stringify` não normaliza, mas uma biblioteca de IDNA no domínio, uma
 * coluna de banco que normaliza na gravação ou um `.normalize('NFC')` posto
 * para "limpar a entrada" fazem exatamente isso.
 *
 * A regra, então, é de ordem e é curta: **normalize antes de conferir, nunca
 * depois.** Se o seu transporte precisa normalizar, normalize primeiro e
 * confira o resultado — a conferência é barata e pode rodar de novo.
 *
 * Hoje o produto está a salvo porque o único tratamento é `normalizarEmail`
 * (`trim` + `toLowerCase`), ele roda **antes** da validação, e nenhuma das duas
 * conversões de caixa produz caractere proibido a partir de um aceito. Isso
 * está medido, e não afirmado, em
 * `domain/normalizacao-nao-pode-vir-depois.test.ts`, que recalcula os 82 a cada
 * execução em vez de guardar a lista — no dia em que a medição mudar, ela
 * acusa, e este parágrafo não vira folclore.
 *
 * O mesmo vale para o remetente que o adaptador tirar da configuração: ele é
 * interpolado nos mesmos dois lugares, e a origem ser variável de ambiente baixa
 * a probabilidade sem mudar o efeito.
 *
 * Isto está escrito **aqui**, e não deixado por conta de quem chama, porque a
 * validação de forma do domínio (`emailTemFormaValida`) roda em **um único
 * lugar**: o cadastro. Verificação, redefinição, aviso de troca e aviso de
 * reuso mandam o endereço que veio do banco, já confiado. A garantia inteira
 * depende de todo endereço ter entrado pelo cadastro — e isso não é visível de
 * dentro do adaptador.
 *
 * Desde a BICHUS-198 aquela validação **não é mais mais frouxa que esta**: as
 * duas leem a mesma definição, `motivoDaRecusaDeEndereco` em
 * `domain/gramatica-de-endereco.ts`, e `borda-e-fio-recusam-a-mesma-classe.test.ts`
 * compara as duas em runtime, ponto de código a ponto de código. Antes disso a
 * borda recusava só `/\s/`, e o efeito não era endereço entregue errado — era a
 * conta nascendo e só então o envio falhando, com 500 no lugar de 400. Quem escrever o transporte do provedor
 * (ADR-0009, Postmark) ou acrescentar um caminho que monte endereço de outra
 * fonte — importação, migração, campo administrativo — precisa nascer sabendo.
 */

export interface Mensagem {
  /**
   * Destinatário. O adaptador **recusa** este valor se ele carregar qualquer
   * caractere com significado na gramática do transporte — a classe é bem maior
   * que `\r` e `\n`, e está no cabeçalho deste arquivo. Não presuma que alguém
   * já validou antes: o único lugar que valida forma é o cadastro.
   */
  readonly para: string;
  readonly assunto: string;
  /** Texto puro. O produto não manda HTML no MVP. */
  readonly corpo: string;
}

export interface Mailer {
  enviar(mensagem: Mensagem): Promise<void>;
}
