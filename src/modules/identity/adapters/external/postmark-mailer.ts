/**
 * Envio pelo Postmark, por HTTP, e o único transporte que entrega a gente de
 * verdade (ADR-0009).
 *
 * ## Por que HTTP, e não o SMTP do Postmark
 *
 * O Postmark oferece os dois caminhos. A escolha aqui é o HTTP, por três razões
 * medidas neste repositório:
 *
 * 1. **O ADR-0009 já decidiu.** Na tabela de alternativas, "SMTP de provedor
 *    comum" está entre as recusadas, com o motivo escrito: *"sem webhook, sem
 *    rastreabilidade"*. E `smtp-mailer.ts` registra a mesma conclusão no
 *    cabeçalho desde que foi escrito: *"a entrega em produção é uma chamada
 *    HTTP — não SMTP"*, e *"quando o Postmark entrar, ele entra como outro
 *    transporte ao lado deste"*. É o que este arquivo é.
 * 2. **O SMTP daqui não serve, e foi escrito para não servir.** Ele não
 *    implementa autenticação nem STARTTLS, e a ausência está documentada como
 *    decisão, não como simplificação: *"um SMTP com autenticação apontando para
 *    fora seria um caminho de envio em produção que o ADR-0009 não escolheu"*.
 *    Usá-lo contra o Postmark exigiria escrever handshake de TLS e AUTH à mão —
 *    código de criptografia novo no caminho crítico, para chegar ao mesmo lugar.
 *    E `MailConfig` não tem usuário nem senha, de propósito.
 * 3. **O `MessageID` só volta pelo HTTP.** O webhook de entrega
 *    (`notifications/adapters/http/webhook-de-entrega.ts`) é idempotente por
 *    `MessageID`, e é esse identificador que liga um evento de devolução à
 *    mensagem que o produziu. A resposta do SMTP é um `250` com texto livre; a
 *    do HTTP traz o identificador.
 *
 *    **O que este adaptador NÃO faz com ele, hoje:** guardar. Não existe coluna
 *    de `provider_message_id` em `shared/db/schema.ts` e a porta devolve
 *    `Promise<void>` — o webhook casa o evento pelo endereço que o próprio
 *    provedor manda de volta. Ligar o envio ao evento pelo identificador é
 *    trabalho de outro cartão, e escrevê-lo aqui sem a coluna seria guardar num
 *    lugar nenhum. O `MessageID` é lido da resposta e **conferido** (ver
 *    `conferirResposta`), porque uma resposta de sucesso sem ele é sinal de que
 *    não se está falando com quem se pensa.
 *
 * O segredo é o token de servidor, em `MAIL_API_TOKEN`, que vem do gerenciador
 * de segredos (ADR-0022). Ele vai no cabeçalho `X-Postmark-Server-Token`.
 *
 * ## O que este arquivo não faz
 *
 * Não grava linha nenhuma de banco e não lê a lista de supressão: quem faz isso
 * é o webhook, que já existe. Aqui é só o envio.
 *
 * Não repete a classe de caractere recusada nem a limpeza do assunto: as defesas
 * vêm de `defesas-de-cabecalho.ts`, importadas e não copiadas. Elas valem aqui
 * também, e o motivo está escrito lá: o `To` que vai no JSON vira cabeçalho RFC
 * 5322 do outro lado, e o JSON escapa a quebra de linha sem escapar a vírgula,
 * que é o que acrescenta destinatário.
 *
 * ## O segredo não entra em erro, em log, nem em mensagem
 *
 * ADR-0022. `montarCabecalhos` é a única função que toca no token, ela **não é
 * exportada**, e nenhum `throw` deste arquivo interpola `config.apiToken`. O
 * corpo da resposta do provedor **é** interpolado, e ele não carrega o token de
 * volta; o endereço do destinatário também não entra em erro nenhum, pela mesma
 * regra que `smtp-mailer.ts` segue: endereço de usuário em log é dado pessoal.
 * Isso está medido em `postmark-mailer.test.ts`, que varre tudo que sai por
 * `console` e toda mensagem de erro procurando o token da bancada.
 */
import type { Mailer, Mensagem } from '../../ports/mailer.js';
import type { MailConfig } from '../../../../shared/config/app-config.js';
import { conferirDestinatario, limparAssunto } from './defesas-de-cabecalho.js';

/**
 * O endereço da API de envio do Postmark.
 *
 * Hostname literal em `src/` é o que o portão de portabilidade reprova, e com
 * razão na maior parte dos casos: endereço de infraestrutura nossa muda de
 * domínio e precisa ser uma linha de configuração. Este não é desses. Ele é o
 * endereço do PROVEDOR escolhido por ADR: torná-lo variável de ambiente daria a
 * quem edita o `.env` o poder de redirecionar todo e-mail transacional do
 * produto — com o token junto — para um servidor qualquer. A troca de provedor é
 * a troca deste adaptador, que é o que o ADR-0009 promete: *"trocar de provedor
 * é trocar o adaptador, algumas horas"*.
 *
 * O portão isenta `src/*&#47;adapters/external/` exatamente por isso, e é o
 * mesmo lugar onde o adaptador do FCM pode saber que o FCM existe.
 */
const ENDERECO_DA_API = 'https://api.postmarkapp.com/email';

/**
 * O stream transacional, separado do de divulgação.
 *
 * É a razão 2 do ADR-0009 para escolher este provedor: *"no dia em que o produto
 * mandar qualquer comunicação em massa, a reputação do e-mail de recuperação de
 * senha não vai junto"*. `outbound` é o nome do stream transacional padrão de
 * toda conta Postmark. Mandar sem ele joga a mensagem no stream padrão, que é o
 * mesmo lugar — até alguém criar um stream de divulgação e o padrão deixar de
 * ser óbvio.
 */
const STREAM_TRANSACIONAL = 'outbound';

/**
 * Até quando se espera a resposta do provedor.
 *
 * O mesmo prazo do SMTP, e pela mesma razão: o envio é síncrono no caminho da
 * requisição (ver o cabeçalho de `ports/mailer.ts`, que explica por que ele não
 * vai pela fila), então um provedor que não responde não pode segurar a conexão
 * de quem pediu a redefinição até o tempo limite do servidor HTTP.
 */
const PRAZO_DA_CHAMADA_MS = 10_000;

/**
 * O código que o Postmark devolve quando o destinatário está na lista de
 * supressão.
 *
 * Ele merece nome porque é a armadilha que o ADR-0009 chama de *"a mais comum
 * deste componente"*: quem marcou uma mensagem como spam uma vez entra em
 * supressão, e todo envio seguinte falha **para sempre**. Sem distinguir este
 * caso, a falha vira "o provedor recusou" genérico e o suporte procura no lugar
 * errado — o endereço está certo, o token está certo, e nada vai sair dali até
 * alguém retirar a supressão.
 */
const CODIGO_DE_DESTINATARIO_INATIVO = 406;

/** O recorte que este arquivo usa da resposta do Postmark. */
interface RespostaDoPostmark {
  readonly ErrorCode?: unknown;
  readonly Message?: unknown;
  readonly MessageID?: unknown;
}

/**
 * O corpo JSON que vai para o provedor.
 *
 * Exportada para o teste pelo mesmo motivo de `montarMensagem` no transporte
 * irmão: falha de escape **não levanta erro** — ela entrega com sucesso a
 * mensagem errada. Sem poder olhar o objeto montado, o teste só conseguiria
 * afirmar que o envio não explodiu, que é exatamente o que alguém que recebeu
 * cópia do aviso de segurança da vítima também observaria.
 *
 * `TextBody` e não `HtmlBody`: o produto não manda HTML no MVP, e a porta diz
 * isso. O ponto no início da linha **não** é escapado aqui, e a ausência é
 * deliberada: `escaparPontos` existe por causa do terminador de dados do SMTP,
 * que não tem equivalente em JSON. Escapar aqui entregaria um `..` onde a pessoa
 * escreveu `.`.
 */
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

/** A única função que toca no token. Não exportada, e não interpolada em erro. */
function montarCabecalhos(apiToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Postmark-Server-Token': apiToken,
  };
}

/**
 * Lê a resposta e decide entre seguir e levantar erro.
 *
 * A regra é estreita de propósito: **só `200` com `ErrorCode` zero e com
 * `MessageID` é sucesso.** O Postmark responde `200` com `ErrorCode: 0` quando
 * aceitou a mensagem, e `422` com um `ErrorCode` próprio quando recusou. Tratar
 * "qualquer 2xx" como sucesso, ou ignorar o `ErrorCode`, é um envio que mente
 * que enviou — o mesmo defeito que o transporte `log` produzia em homologação,
 * só mais difícil de ver.
 *
 * O `MessageID` entra na condição porque ele é a razão 3 de este transporte ser
 * HTTP: um `200 ErrorCode 0` sem identificador nenhum não é a resposta do
 * Postmark, é a resposta de outra coisa no caminho — um proxy, um dublê
 * esquecido ligado, um stub de teste que vazou para um ambiente. Aceitá-lo faria
 * o adaptador declarar entrega contra um servidor que ninguém identificou.
 */
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

  // Nem o endereço nem o token entram aqui. O `Message` do provedor é texto dele
  // sobre a requisição, e ele não devolve nenhum dos dois.
  throw new Error(
    `o Postmark recusou o envio: HTTP ${String(status)}, ErrorCode ` +
      `${codigo === null ? 'ausente' : String(codigo)}. Resposta do provedor: ${recado}`,
  );
}

/**
 * O mailer do provedor.
 *
 * O token é exigido **na criação** e não no envio, pela mesma razão que
 * `conferirRemetente` é: o processo não sobe com uma configuração que só falha no
 * primeiro pedido de redefinição de senha de alguém. `app-config.ts` já exige a
 * variável quando o transporte é este, e esta linha é a rede embaixo — ela pega
 * quem construir o mailer sem passar por `loadAppConfig`.
 */
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
      // Antes da chamada, e não dentro dela: é a mesma ordem do transporte SMTP,
      // e pela mesma razão — a conferência precisa acontecer antes de qualquer
      // byte do endereço sair desta máquina. `montarCorpoDaApi` a faz.
      const corpo = montarCorpoDaApi(config, m);

      const resposta = await fetch(ENDERECO_DA_API, {
        method: 'POST',
        headers: montarCabecalhos(apiToken),
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(PRAZO_DA_CHAMADA_MS),
      });

      // O corpo é lido como texto antes de virar JSON: um `502` de proxy devolve
      // HTML, e `resposta.json()` estouraria com "Unexpected token <", que
      // esconde o status que explica tudo.
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
