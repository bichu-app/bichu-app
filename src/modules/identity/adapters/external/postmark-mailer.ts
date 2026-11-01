import type { Mailer, Mensagem } from '../../ports/mailer.js';
import type { MailConfig } from '../../../../shared/config/app-config.js';
import { conferirDestinatario, limparAssunto } from './defesas-de-cabecalho.js';

const ENDERECO_DA_API = 'https://api.postmarkapp.com/email';

const STREAM_TRANSACIONAL = 'outbound';

const PRAZO_DA_CHAMADA_MS = 10_000;

const CODIGO_DE_DESTINATARIO_INATIVO = 406;

interface RespostaDoPostmark {
  readonly ErrorCode?: unknown;
  readonly Message?: unknown;
  readonly MessageID?: unknown;
}

/** O corpo JSON que vai para o provedor. */
export function montarCorpoDaApi(config: MailConfig, m: Mensagem): Record<string, string> {
  conferirDestinatario(m.para);
  return {
    From: `${config.fromName} <${config.from}>`,
    To: m.para,
    ReplyTo: config.replyTo,
    Subject: limparAssunto(m.assunto),
    TextBody: m.corpo,
    MessageStream: STREAM_TRANSACIONAL,
  };
}

function montarCabecalhos(apiToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Postmark-Server-Token': apiToken,
  };
}

function conferirResposta(status: number, corpo: RespostaDoPostmark): void {
  const codigo = typeof corpo.ErrorCode === 'number' ? corpo.ErrorCode : null;
  const recado = typeof corpo.Message === 'string' ? corpo.Message : '';
  const identificador = typeof corpo.MessageID === 'string' ? corpo.MessageID : '';

  if (status === 200 && codigo === 0 && identificador.length > 0) return;

  if (codigo === CODIGO_DE_DESTINATARIO_INATIVO) {
    throw new Error(
      'o Postmark recusou: destinatário na lista de supressão. Todo envio para ele ' +
        'falha até alguém retirar a supressão, e é a armadilha que o ADR-0009 item 5 ' +
        'descreve. O webhook de entrega é quem lê esses eventos. ' +
        `Resposta do provedor: ${recado}`,
    );
  }

  if (status === 200 && codigo === 0) {
    throw new Error(
      'o Postmark respondeu HTTP 200 com ErrorCode 0 e SEM MessageID. Sem o ' +
        'identificador não há como o webhook de entrega casar o evento depois, e uma ' +
        'resposta assim provavelmente não veio do provedor. ' +
        `Resposta do provedor: ${recado}`,
    );
  }

  throw new Error(
    `o Postmark recusou o envio: HTTP ${String(status)}, ErrorCode ` +
      `${codigo === null ? 'ausente' : String(codigo)}. Resposta do provedor: ${recado}`,
  );
}

/** O mailer do provedor. */
export function criarMailerDoPostmark(config: MailConfig): Mailer {
  const apiToken = config.apiToken;
  if (apiToken === undefined || apiToken.length === 0) {
    throw new Error(
      'MAIL_TRANSPORT=postmark sem MAIL_API_TOKEN. Ele é o token de servidor do ' +
        'provedor (ADR-0009) e vem do gerenciador de segredos (ADR-0022): sem ele ' +
        'nenhum e-mail sai, e a falha apareceria no primeiro pedido de redefinição ' +
        'de senha em vez de aqui.',
    );
  }

  return {
    async enviar(m: Mensagem): Promise<void> {
      const corpo = montarCorpoDaApi(config, m);

      const resposta = await fetch(ENDERECO_DA_API, {
        method: 'POST',
        headers: montarCabecalhos(apiToken),
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(PRAZO_DA_CHAMADA_MS),
      });

      const texto = await resposta.text();
      let lido: RespostaDoPostmark = {};
      try {
        lido = JSON.parse(texto) as RespostaDoPostmark;
      } catch {
        throw new Error(
          `o Postmark respondeu HTTP ${String(resposta.status)} com um corpo que não é ` +
            `JSON. Primeiros 200 caracteres: ${texto.slice(0, 200)}`,
        );
      }

      conferirResposta(resposta.status, lido);
    },
  };
}
