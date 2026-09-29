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
 * São ~70 linhas de um protocolo de 1982 que não muda. O Postmark **entrou**, e
 * entrou como previsto: outro transporte ao lado deste, atrás da mesma porta, em
 * `postmark-mailer.ts`. `criarMailer` escolhe entre os três por `MAIL_TRANSPORT`,
 * e as defesas de cabeçalho que os dois precisam mudaram de casa para
 * `defesas-de-cabecalho.ts` — este arquivo as reexporta, e o porquê está lá.
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
import {
  conferirDestinatario,
  conferirRemetente,
  limparAssunto,
} from './defesas-de-cabecalho.js';
import { criarMailerDoPostmark } from './postmark-mailer.js';

/**
 * Reexportadas, e não redefinidas.
 *
 * `domain/borda-e-fio-recusam-a-mesma-classe.test.ts` e `smtp-mailer.test.ts`
 * importam as duas **deste caminho**, e são elas que provam que a borda do
 * cadastro e o fio recusam a mesma classe de caractere. Mudar o import das
 * provas junto com a mudança de casa teria trocado o caminho e o comportamento
 * no mesmo commit, e uma prova que se move junto com o que ela prova não é
 * prova. Elas moram em `defesas-de-cabecalho.ts` porque o transporte do Postmark
 * precisa das mesmas.
 */
export { conferirDestinatario, conferirRemetente };

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
 * Monta o bloco de DATA inteiro: cabeçalhos, corpo escapado e o terminador.
 *
 * Exportada pelo mesmo motivo de `escaparPontos`: a limpeza do assunto aqui
 * dentro é o que impede injeção de cabeçalho, e falha de escape **não levanta
 * erro** — ela entrega com sucesso a mensagem errada. Sem poder olhar o texto
 * montado, o teste só conseguiria afirmar que o envio não explodiu, que é
 * exatamente o que um atacante que recebeu cópia do aviso de segurança da
 * vítima também observaria.
 *
 * Este é o gêmeo de `montarCorpoDaApi` em `postmark-mailer.ts`: os dois montam a
 * mensagem para um transporte e os dois chamam as mesmas duas defesas. O que não
 * é gêmeo é `escaparPontos`, que existe só por causa do terminador de dados do
 * SMTP e não tem equivalente em JSON.
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

export function criarMailer(config: MailConfig): Mailer {
  // ANTES de escolher o transporte, e não dentro de cada um: o remetente é o
  // mesmo nos três, e uma conferência por transporte seria a terceira cópia da
  // mesma regra esperando para divergir.
  conferirRemetente(config);

  // O transporte do provedor entra AQUI, atrás da mesma porta, como o cabeçalho
  // deste arquivo previa. Ele é quem entrega a gente de verdade (ADR-0009); o
  // SMTP abaixo continua existindo para o receptor local (mailpit), e o `log`
  // para desenvolvimento.
  //
  // A escolha fica nesta função, e não em `bin/api.ts` e `bin/worker.ts`, porque
  // são DOIS pontos de montagem: um `if` por transporte em cada um deles é a
  // forma de o worker continuar mandando pelo mailpit depois de a API já estar no
  // provedor, e a divergência não levantaria erro nenhum.
  if (config.transport === 'postmark') return criarMailerDoPostmark(config);

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
