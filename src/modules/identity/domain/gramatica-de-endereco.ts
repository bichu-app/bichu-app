/**
 * O que um endereço de e-mail não pode carregar — **uma definição só**, lida
 * pela borda e pelo fio.
 *
 * ## Por que este arquivo existe
 *
 * A regra estava dentro do `smtp-mailer`, e a validação de forma do cadastro
 * tinha a sua própria, mais frouxa (`/\s/`). O resultado era a ordem errada dos
 * acontecimentos: o cadastro aceitava `a@b.test;x`, **a conta nascia**, e só
 * então o envio recusava — a pessoa levava 500 depois de já existir, em vez de
 * 400 antes (BICHUS-198).
 *
 * Copiar a lista para a borda resolveria hoje e divergiria amanhã, porque duas
 * listas com o mesmo propósito sempre divergem: uma ganha um caractere, a outra
 * não. Então não há duas listas. Há esta, e os dois lados a importam.
 *
 * O lugar é o **domínio**, e não o adaptador, por direção de dependência:
 * adaptador conhece domínio, domínio não conhece adaptador. E porque a regra é
 * de negócio antes de ser de transporte — endereço para o qual o produto não
 * consegue mandar e-mail não é endereço utilizável, e o cadastro precisa saber
 * disso sem perguntar a um socket.
 *
 * ## Por que a lista é esta, e por que ela fecha
 *
 * O endereço é interpolado em dois contextos com gramática própria:
 * `To: ${para}` (campo de cabeçalho, RFC 5322) e `RCPT TO:<${para}>` (linha de
 * comando, RFC 5321). A lista abaixo é o conjunto de caracteres que têm
 * significado numa das duas gramáticas, e por isso é fechada **por construção**
 * e não por catálogo de ataques conhecidos:
 *
 * - `\u0000-\u0020` — os controles C0 e o espaço. CR e LF terminam linha nos
 *   dois protocolos, e é daí que sai cabeçalho novo ou comando novo. NUL trunca
 *   em MTA escrito em C. VT e FF são tratados como quebra por parte dos
 *   analisadores de cabeçalho. O espaço separa os argumentos do `RCPT TO:`, e é
 *   ele que permite enxertar parâmetro ESMTP (`NOTIFY=`, `ORCPT=`, RFC 3461)
 *   sem precisar de quebra de linha nenhuma.
 * - `\u007F-\u00A0` — DEL, os controles C1 (inclusive NEL, `U+0085`) e o espaço
 *   inquebrável. O `\s` do JavaScript não cobre `U+0085`, então quem confiasse
 *   nele deixaria passar um separador de linha. Era exatamente o caso da borda.
 * - `\u1680`, `\u2000-\u200D`, `\u202F`, `\u205F`, `\u3000`, `\uFEFF` — o resto
 *   do espaço em branco Unicode, mais os de largura zero, que escondem o
 *   emendado de quem lê o log.
 * - `\u2028` e `\u2029` — separador de linha e de parágrafo.
 * - `<`, `>` — delimitam o caminho no `RCPT TO:<…>`. Um `>` no meio do endereço
 *   fecha o caminho e o resto vira argumento do comando. É injeção de comando
 *   SMTP **sem uma quebra de linha sequer**, e era o furo que sobrava depois de
 *   BICHUS-131.
 * - `,`, `;` — separam endereços numa lista de cabeçalho.
 * - `:` — separa o nome do campo no cabeçalho, e é o que monta a rota de origem
 *   do RFC 821 (`<@relay:vitima@…>`), que faz a mensagem passar por um servidor
 *   escolhido por outra pessoa antes de chegar à vítima.
 * - `"`, `\` — abrem literal citado e par escapado. O adaptador não sabe emitir
 *   nenhum dos dois, então deixá-los passar é entregar um endereço que o
 *   servidor lê diferente do que nós lemos.
 *
 * ## Normalização Unicode: medida, e a decisão está no `ports/mailer.ts`
 *
 * A varredura dos 1.114.112 pontos de código sob NFC, NFD, NFKC e NFKD, mais
 * `toLowerCase` e `toUpperCase`, não encontra **nenhum** que produza CR ou LF —
 * o caso está versionado em `smtp-mailer.test.ts`. Normalizar antes de conferir
 * seria rito sem efeito contra quebra de linha.
 *
 * O que **existe** é outra coisa, e está medido em
 * `normalizacao-nao-pode-vir-depois.test.ts`: há pontos de código que passam
 * aqui e **viram caractere proibido** sob NFKC/NFKD — `U+037E`, a interrogação
 * grega, vira `U+003B`, que é o separador de lista de endereços. Não é
 * explorável porque nada normaliza depois desta conferência. A obrigação de
 * continuar assim é de quem escrever o próximo adaptador, e está escrita na
 * porta, que é o lugar onde ele vai olhar.
 *
 * Codificação percentual (`%0d%0a`) não é decodificada aqui, de propósito: `%`
 * é caractere legítimo de parte local (`atext`, RFC 5322), e decodificar
 * transformaria endereço válido em ataque. O texto que chega é o texto que vai
 * para o fio, e `%0d%0a` no fio é literal, não quebra.
 */
const CARACTERE_PROIBIDO_NO_ENDERECO =
  // eslint-disable-next-line no-control-regex -- os controles são exatamente o alvo
  /[\u0000-\u0020\u007F-\u00A0\u1680\u2000-\u200D\u2028\u2029\u202F\u205F\u3000\uFEFF<>,;:"\\]/u;

/**
 * O motivo, pronto para a mensagem de erro, ou `null` se o endereço passa.
 *
 * O endereço **NÃO** entra na mensagem: endereço de usuário é dado pessoal e
 * mensagem de erro vai para o log. O que sai é o ponto de código do caractere
 * recusado, que o operador precisa para entender o que aconteceu e que não
 * identifica ninguém — ele é sempre um controle ou um delimitador de protocolo.
 */
export function motivoDaRecusaDeEndereco(endereco: string): string | null {
  const achado = CARACTERE_PROIBIDO_NO_ENDERECO.exec(endereco);
  if (achado === null) return null;
  const codigo = achado[0].codePointAt(0) ?? 0;
  const ponto = `U+${codigo.toString(16).toUpperCase().padStart(4, '0')}`;
  return codigo === 0x0d || codigo === 0x0a
    ? `quebra de linha (${ponto})`
    : `caractere que o transporte não carrega (${ponto})`;
}
