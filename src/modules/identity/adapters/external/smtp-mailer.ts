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
 */
function escaparPontos(corpo: string): string {
  return corpo.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
}

function montarMensagem(config: MailConfig, m: Mensagem): string {
  // `\r\n` em todo lugar: o protocolo exige, e um `\n` solitário faz servidores
  // estritos recusarem a mensagem inteira.
  const cabecalhos = [
    `From: ${config.fromName} <${config.from}>`,
    `To: ${m.para}`,
    `Reply-To: ${config.replyTo}`,
    // Sem quebra de linha no assunto: `\r\n` aqui injetaria cabeçalho, e é por
    // isso que ele é limpo em vez de confiado.
    `Subject: ${m.assunto.replace(/[\r\n]+/g, ' ')}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
  ].join('\r\n');
  return `${cabecalhos}\r\n${escaparPontos(m.corpo)}\r\n.`;
}

export function criarMailer(config: MailConfig): Mailer {
  if (config.transport === 'log') {
    return {
      enviar(m: Mensagem): Promise<void> {
        // Prova o DISPARO, não a entrega — e o corpo sai junto porque em
        // desenvolvimento é assim que se pega o link. Este transporte nunca
        // pode ser o de produção, e o nome dele diz isso.
        console.info(JSON.stringify({ evento: 'email.send', para: m.para, assunto: m.assunto, corpo: m.corpo }));
        return Promise.resolve();
      },
    };
  }

  return {
    enviar(m: Mensagem): Promise<void> {
      return new Promise<void>((resolver, recusar) => {
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
