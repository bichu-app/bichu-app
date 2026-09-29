/**
 * As defesas de cabeçalho de e-mail, num lugar só, porque agora há **dois**
 * transportes que entregam.
 *
 * Elas nasceram dentro de `smtp-mailer.ts` e saíram para cá quando o adaptador
 * do Postmark entrou (ADR-0009). O motivo é o mesmo que tirou a classe de
 * caractere recusada para `domain/gramatica-de-endereco.ts` na BICHUS-198:
 * enquanto a regra viveu em um só dos dois lados, o outro tinha a sua própria,
 * mais frouxa, e a divergência só apareceu quando alguém mediu. Uma cópia aqui
 * resolveria hoje e divergiria amanhã.
 *
 * ## Por que elas valem também no transporte que fala HTTP
 *
 * Porque o que o Postmark recebe em JSON ele escreve num cabeçalho RFC 5322.
 * O campo `To` dele é uma lista de endereços separada por vírgula: uma `,`
 * dentro do valor **acrescenta destinatário**, e nenhum `\r\n` precisa existir
 * para isso. O JSON escapa a quebra de linha e **não** escapa a vírgula, o ponto
 * e vírgula, os dois pontos nem os delimitadores do `angle-addr` — então o
 * transporte que parece imune por falar JSON é imune a um caso só dos sete que
 * `motivoDaRecusaDeEndereco` fecha.
 *
 * ## A ordem continua sendo a regra: normalizar ANTES de conferir
 *
 * `ports/mailer.ts` explica por quê, com a medição: há 82 pontos de código que
 * passam na conferência e viram caractere proibido depois de normalizados, e
 * `U+037E` vira `;` já sob NFC. Nenhuma das duas funções deste arquivo
 * normaliza, e nenhuma das duas pode passar a normalizar depois de conferir.
 *
 * `smtp-mailer.ts` continua **reexportando** `conferirDestinatario` e
 * `conferirRemetente`: eles são importados de lá por
 * `domain/borda-e-fio-recusam-a-mesma-classe.test.ts` e por
 * `smtp-mailer.test.ts`, e mover o caminho do import quebraria as duas provas
 * sem mudar uma linha de comportamento.
 */
import type { MailConfig } from '../../../../shared/config/app-config.js';
import { motivoDaRecusaDeEndereco } from '../../domain/gramatica-de-endereco.js';

/**
 * Recusa o destinatário perigoso, em vez de limpá-lo.
 *
 * **Recusa, e não limpeza** — aqui a decisão é o contrário da do assunto, de
 * propósito. Assunto com quebra continua sendo o assunto que a pessoa escreveu,
 * só que numa linha; endereço com CRLF não é endereço mal formatado, é
 * tentativa. Limpar entregaria a mensagem, em silêncio, a um endereço que
 * ninguém escreveu, e o remetente continuaria achando que ela chegou a quem
 * devia. Um `Bcc:` enxertado assim entrega ao atacante cópia integral do aviso
 * de segurança da vítima, com o link de redefinição de senha dentro.
 *
 * A classe recusada mora em `domain/gramatica-de-endereco.ts`, e este arquivo a
 * **importa** em vez de repeti-la: o arquivo do domínio explica por que a lista
 * é aquela e por que ela fecha.
 *
 * A mensagem de erro **não** carrega o endereço: ele é dado pessoal e acaba em
 * log.
 */
export function conferirDestinatario(para: string): void {
  const motivo = motivoDaRecusaDeEndereco(para);
  if (motivo !== null) {
    throw new Error(`destinatário recusado: endereço com ${motivo}`);
  }
}

/**
 * Tudo que fecha uma linha de cabeçalho. Ao contrário do destinatário, aqui a
 * decisão é **limpar**: o assunto é texto que a pessoa vai ler, e um assunto com
 * quebra continua sendo o assunto que alguém escreveu, só que numa linha só.
 *
 * Por ponto de código, e não por classe de expressão regular: quatro destes são
 * invisíveis no editor, e escritos como literal uma cópia descuidada do arquivo
 * apaga a defesa sem que a linha pareça ter mudado.
 */
const QUEBRAS_DE_LINHA_NO_ASSUNTO = new Set([
  0x0a, // LF
  0x0d, // CR
  0x0b, // VT, lido como quebra por parte dos analisadores de cabeçalho
  0x0c, // FF, idem
  0x85, // NEL. O `\s` do JavaScript NAO cobre este.
  0x2028, // LINE SEPARATOR
  0x2029, // PARAGRAPH SEPARATOR
]);

/** Toda sequência de quebra vira um espaço só, como o `[\r\n]+` que veio antes. */
export function limparAssunto(assunto: string): string {
  let saida = '';
  let quebrou = false;
  for (const ch of assunto) {
    if (QUEBRAS_DE_LINHA_NO_ASSUNTO.has(ch.codePointAt(0) ?? 0)) {
      quebrou = true;
      continue;
    }
    if (quebrou) {
      saida += ' ';
      quebrou = false;
    }
    saida += ch;
  }
  return quebrou ? `${saida} ` : saida;
}

/**
 * O remetente vem da configuração, e a configuração também é entrada.
 *
 * `From: ${fromName} <${from}>` e `MAIL FROM:<${from}>` interpolam três valores
 * de `MailConfig` com a mesma falta de cerimônia que o destinatário tinha. A
 * origem é variável de ambiente, não formulário, o que baixa a probabilidade e
 * não muda o efeito: um `\r\n` em `MAIL_FROM_NAME` injeta cabeçalho em **todo**
 * e-mail que o produto manda, e ninguém percebe, porque falha de escape não
 * levanta erro.
 *
 * A recusa é na criação do mailer, e não no envio, para o processo **não subir**
 * com uma configuração dessas — do mesmo jeito que rota sem `security`
 * declarado não sobe. Descobrir no primeiro envio significa descobrir em
 * produção, com a mensagem já entregue. E ela vale para os dois transportes,
 * porque `criarMailer` a chama antes de escolher qual deles devolver.
 *
 * `fromName` é nome de exibição e pode ter espaço; o que ele não pode ter é
 * quebra de linha nem os delimitadores do `angle-addr`.
 */
export function conferirRemetente(config: MailConfig): void {
  for (const [variavel, valor] of [
    ['MAIL_FROM', config.from],
    ['MAIL_REPLY_TO', config.replyTo],
  ] as const) {
    const motivo = motivoDaRecusaDeEndereco(valor);
    if (motivo !== null) {
      throw new Error(`remetente recusado: ${variavel} com ${motivo}`);
    }
  }
  // O nome de exibição pode ter espaço; o que ele não pode é fechar a linha do
  // cabeçalho ou os delimitadores do `angle-addr` que o cercam.
  const nomeQuebra = [...config.fromName].some((ch) => {
    const cp = ch.codePointAt(0) ?? 0;
    return QUEBRAS_DE_LINHA_NO_ASSUNTO.has(cp) || cp === 0x3c || cp === 0x3e;
  });
  if (nomeQuebra) {
    throw new Error('remetente recusado: MAIL_FROM_NAME com quebra de linha ou delimitador');
  }
}
