/** Envio por SMTP, escrito à mão, e o transporte `log`. */
import { createConnection, type Socket } from 'node:net';
import type { Mailer, Mensagem } from '../../ports/mailer.js';
import type { MailConfig } from '../../../../shared/config/app-config.js';
import {
  conferirDestinatario,
  conferirRemetente,
  limparAssunto,
} from './defesas-de-cabecalho.js';
import { criarMailerDoPostmark } from './postmark-mailer.js';

/** Reexportadas, e não redefinidas. */
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
    throw new Error(`SMTP respondeu ${String(codigo)} onde ${String(esperado)} era esperado`);
  }
}

/** Escapa o ponto no início da linha. */
export function escaparPontos(corpo: string): string {
  return corpo.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
}

/** Monta o bloco de DATA inteiro: cabeçalhos, corpo escapado e o terminador. */
export function montarMensagem(config: MailConfig, m: Mensagem): string {
  conferirDestinatario(m.para);
  const cabecalhos = [
    `From: ${config.fromName} <${config.from}>`,
    `To: ${m.para}`,
    `Reply-To: ${config.replyTo}`,
    `Subject: ${limparAssunto(m.assunto)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
  ].join('\r\n');
  return `${cabecalhos}\r\n${escaparPontos(m.corpo)}\r\n.`;
}

export function criarMailer(config: MailConfig): Mailer {
  conferirRemetente(config);

  if (config.transport === 'postmark') return criarMailerDoPostmark(config);

  if (config.transport === 'log') {
    return {
      enviar(m: Mensagem): Promise<void> {
        return new Promise<void>((resolver) => {
          conferirDestinatario(m.para);
          console.info(JSON.stringify({ evento: 'email.send', para: m.para, assunto: m.assunto, corpo: m.corpo }));
          resolver();
        });
      },
    };
  }

  return {
    enviar(m: Mensagem): Promise<void> {
      return new Promise<void>((resolver, recusar) => {
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
