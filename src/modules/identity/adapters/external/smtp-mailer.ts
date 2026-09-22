/**
 * Envio por SMTP, escrito à mão, e o transporte `log`.
 *
 * ## Por que sem biblioteca
 *
 * O mesmo motivo da assinatura V4 em `media`: o ADR-0009 escolhe **Postmark**,
 * cuja entrega em produção é uma chamada HTTP — não SMTP. O SMTP aqui existe
 * para o receptor **local** (mailpit), que não pede autenticação nem TLS. Trazer
 * uma biblioteca de e-mail inteira para falar com um contêiner de teste seria
 * pagar uma dependência de produção por uma conveniência de desenvolvimento.
 *
 * São ~70 linhas de um protocolo de 1982 que não muda. Quando o Postmark entrar,
 * ele entra como **outro transporte** ao lado deste, atrás da mesma porta.
 *
 * ## O que este arquivo deliberadamente não implementa
 *
 * Autenticação, STARTTLS e pipelining. Não por simplificação: um SMTP com
 * autenticação apontando para fora seria um caminho de envio em produção que o
 * ADR-0009 não escolheu, e que passaria sem SPF, DKIM e sem lista de supressão.
 * Se alguém precisar disso, a resposta é o transporte do provedor, não este.
 */
import { createConnection, type Socket } from 'node:net';
import type { Mailer, Mensagem } from '../../ports/mailer.js';
import type { MailConfig } from '../../../../shared/config/app-config.js';

/** Uma troca do protocolo: manda a linha, espera o código esperado. */
async function dizer(
  socket: Socket,
  linha: string | null,
  esperado: number,
  ler: () => Promise<string>,
): Promise<void> {
  if (linha !== null) socket.write(`${linha}\r\n`);
  const resposta = await ler();
  const codigo = Number.parseInt(resposta.slice(0, 3), 10);
  if (codigo !== esperado) {
    // A linha enviada NÃO entra na mensagem de erro: ela pode ser o
    // `RCPT TO:<endereco>`, e endereço de usuário em log é dado pessoal.
    throw new Error(`SMTP respondeu ${String(codigo)} onde ${String(esperado)} era esperado`);
  }
}

/**
 * Escapa o ponto no início da linha.
 *
 * Uma linha com um ponto sozinho **encerra os dados** no SMTP. Sem este escape,
 * um corpo que contivesse `\n.\n` terminaria a mensagem ali e o resto viraria
 * comandos de protocolo — que é injeção de SMTP, a versão de 1982 da injeção de
 * cabeçalho.
 *
 * Exportada só para o teste: ela é pura e é a defesa inteira. Enquanto ficou
 * privada, ninguém conseguia provar que ela existe — e uma refatoração que a
 * apagasse não deixaria nenhuma linha vermelha, só e-mails cortados ao meio.
 */
export function escaparPontos(corpo: string): string {
  return corpo.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
}

/**
 * Tudo que um endereço não pode carregar, e por que a lista é esta e fecha.
 *
 * O endereço é interpolado em dois contextos com gramática própria:
 * `To: ${para}` (campo de cabeçalho, RFC 5322) e `RCPT TO:<${para}>` (linha de
 * comando, RFC 5321). A lista abaixo é o conjunto de caracteres que têm
 * significado numa das duas gramáticas, e por isso é fechada por construção e
 * não por catálogo de ataques conhecidos:
 *
 * - `\u0000-\u0020` — os controles C0 e o espaço. CR e LF terminam linha nos
 *   dois protocolos, e é daí que sai cabeçalho novo ou comando novo. NUL trunca
 *   em MTA escrito em C. VT e FF são tratados como quebra por parte dos
 *   analisadores de cabeçalho. O espaço separa os argumentos do `RCPT TO:`, e é
 *   ele que permite enxertar parâmetro ESMTP (`NOTIFY=`, `ORCPT=`, RFC 3461)
 *   sem precisar de quebra de linha nenhuma.
 * - `\u007F-\u00A0` — DEL, os controles C1 (inclusive NEL, `U+0085`) e o espaço
 *   inquebrável. O `\s` do JavaScript não cobre `U+0085`, então quem confiasse
 *   nele deixaria passar um separador de linha.
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
 * - `"`, `\` — abrem literal citado e par escapado. Este adaptador não sabe
 *   emitir nenhum dos dois, então deixá-los passar é entregar um endereço que
 *   o servidor lê diferente do que nós lemos.
 *
 * **Normalização Unicode não entra aqui, e isso é medida e não descuido.** A
 * varredura dos 1.114.112 pontos de código sob NFC, NFD, NFKC e NFKD, mais
 * `toLowerCase` e `toUpperCase`, não encontra **nenhum** que produza CR ou LF
 * (o caso está versionado em `smtp-mailer.test.ts` e roda em 90 ms, então ele
 * acusa se uma versão futura do Unicode mudar isso). Acrescentar um passo de
 * normalização antes da conferência seria rito sem efeito; o que existe de
 * verdade são os separadores de linha do Unicode, e eles estão recusados acima
 * pelo que são, não pelo que viram.
 *
 * Codificação percentual (`%0d%0a`) também não é decodificada aqui, de
 * propósito: `%` é caractere legítimo de parte local (`atext`, RFC 5322), e
 * decodificar transformaria endereço válido em ataque. O que a conferência
 * garante é o que importa — o texto que chega é o texto que vai para o fio, e
 * `%0d%0a` no fio é literal, não quebra. Quem decodificar antes de chamar cai
 * na recusa, que é onde tem de cair.
 */
const CARACTERE_PROIBIDO_NO_ENDERECO =
  // eslint-disable-next-line no-control-regex -- os controles são exatamente o alvo
  /[\u0000-\u0020\u007F-\u00A0\u1680\u2000-\u200D\u2028\u2029\u202F\u205F\u3000\uFEFF<>,;:"\\]/u;

/**
 * O motivo, pronto para a mensagem de erro, ou `null` se o endereço passa.
 *
 * O endereço NÃO entra na mensagem, pelo mesmo motivo do `dizer` acima:
 * endereço de usuário é dado pessoal e mensagem de erro vai para o log. O que
 * sai é o ponto de código do caractere recusado, que o operador precisa para
 * entender o que aconteceu e que não identifica ninguém: ele é sempre um
 * controle ou um delimitador de protocolo.
 */
function motivoDaRecusa(endereco: string): string | null {
  const achado = CARACTERE_PROIBIDO_NO_ENDERECO.exec(endereco);
  if (achado === null) return null;
  const codigo = achado[0].codePointAt(0) ?? 0;
  const ponto = `U+${codigo.toString(16).toUpperCase().padStart(4, '0')}`;
  return codigo === 0x0d || codigo === 0x0a
    ? `quebra de linha (${ponto})`
    : `caractere que o transporte não carrega (${ponto})`;
}

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
 * Exportada pelo mesmo motivo de `escaparPontos`: é a defesa inteira, e defesa
 * que não dá para olhar de fora é defesa que uma refatoração apaga sem deixar
 * linha vermelha.
 */
export function conferirDestinatario(para: string): void {
  const motivo = motivoDaRecusa(para);
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
function limparAssunto(assunto: string): string {
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
 * Monta o bloco de DATA inteiro: cabeçalhos, corpo escapado e o terminador.
 *
 * Exportada pelo mesmo motivo de `escaparPontos`: a limpeza do assunto aqui
 * dentro é o que impede injeção de cabeçalho, e falha de escape **não levanta
 * erro** — ela entrega com sucesso a mensagem errada. Sem poder olhar o texto
 * montado, o teste só conseguiria afirmar que o envio não explodiu, que é
 * exatamente o que um atacante que recebeu cópia do aviso de segurança da
 * vítima também observaria.
 */
export function montarMensagem(config: MailConfig, m: Mensagem): string {
  conferirDestinatario(m.para);
  // `\r\n` em todo lugar: o protocolo exige, e um `\n` solitário faz servidores
  // estritos recusarem a mensagem inteira.
  const cabecalhos = [
    `From: ${config.fromName} <${config.from}>`,
    `To: ${m.para}`,
    `Reply-To: ${config.replyTo}`,
    // Sem quebra de linha no assunto: `\r\n` aqui injetaria cabeçalho, e é por
    // isso que ele é limpo em vez de confiado. A classe é maior que `\r\n`
    // porque VT, FF, NEL e os separadores do Unicode também são lidos como
    // quebra por parte dos analisadores de cabeçalho.
    `Subject: ${limparAssunto(m.assunto)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
  ].join('\r\n');
  return `${cabecalhos}\r\n${escaparPontos(m.corpo)}\r\n.`;
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
 * produção, com a mensagem já entregue.
 *
 * `fromName` é nome de exibição e pode ter espaço; o que ele não pode ter é
 * quebra de linha nem os delimitadores do `angle-addr`.
 */
export function conferirRemetente(config: MailConfig): void {
  for (const [variavel, valor] of [
    ['MAIL_FROM', config.from],
    ['MAIL_REPLY_TO', config.replyTo],
  ] as const) {
    const motivo = motivoDaRecusa(valor);
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

export function criarMailer(config: MailConfig): Mailer {
  conferirRemetente(config);

  if (config.transport === 'log') {
    return {
      enviar(m: Mensagem): Promise<void> {
        return new Promise<void>((resolver) => {
          // Recusa igual à do transporte de produção: um transporte de
          // desenvolvimento que aceitasse o que o outro recusa ensinaria a
          // regra errada a quem testa contra ele.
          conferirDestinatario(m.para);
          // Prova o DISPARO, não a entrega — e o corpo sai junto porque em
          // desenvolvimento é assim que se pega o link. Este transporte nunca
          // pode ser o de produção, e o nome dele diz isso.
          console.info(JSON.stringify({ evento: 'email.send', para: m.para, assunto: m.assunto, corpo: m.corpo }));
          resolver();
        });
      },
    };
  }

  return {
    enviar(m: Mensagem): Promise<void> {
      return new Promise<void>((resolver, recusar) => {
        // Antes do socket, e não dentro do diálogo: `RCPT TO:` vai para a rede
        // ANTES de `montarMensagem` ser chamado, então a conferência lá dentro
        // chegaria tarde — o comando enxertado já teria sido escrito.
        //
        // Dentro do executor, e não acima dele, para a recusa sair como
        // promessa REJEITADA: a porta promete `Promise<void>`, e um `throw`
        // síncrono aqui escaparia de qualquer `.catch()` de quem chama.
        conferirDestinatario(m.para);
        const socket = createConnection({ host: config.host, port: config.port });
        socket.setEncoding('utf8');
        socket.setTimeout(10_000);

        let pendente: ((linha: string) => void) | null = null;
        let acumulado = '';

        const ler = (): Promise<string> =>
          new Promise<string>((ok) => {
            pendente = ok;
          });

        socket.on('data', (pedaco: string) => {
          acumulado += pedaco;
          // Última linha completa: respostas de várias linhas usam `250-` nas
          // intermediárias e `250 ` na final.
          if (!/\r\n$/.test(acumulado)) return;
          const linhas = acumulado.trimEnd().split('\r\n');
          const ultima = linhas[linhas.length - 1]!;
          if (/^\d{3}-/.test(ultima)) return;
          const resposta = acumulado;
          acumulado = '';
          const entregar = pendente;
          pendente = null;
          entregar?.(resposta);
        });

        socket.on('error', recusar);
        socket.on('timeout', () => {
          socket.destroy();
          recusar(new Error('SMTP não respondeu em 10 s'));
        });

        void (async () => {
          try {
            await dizer(socket, null, 220, ler);
            await dizer(socket, 'EHLO bichu', 250, ler);
            await dizer(socket, `MAIL FROM:<${config.from}>`, 250, ler);
            await dizer(socket, `RCPT TO:<${m.para}>`, 250, ler);
            await dizer(socket, 'DATA', 354, ler);
            await dizer(socket, montarMensagem(config, m), 250, ler);
            socket.write('QUIT\r\n');
            socket.end();
            resolver();
          } catch (erro: unknown) {
            socket.destroy();
            recusar(erro instanceof Error ? erro : new Error(String(erro)));
          }
        })();
      });
    },
  };
}
