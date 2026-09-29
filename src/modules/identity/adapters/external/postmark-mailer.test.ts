/**
 * O adaptador do Postmark (ADR-0009), o único transporte que entrega a gente de
 * verdade.
 *
 * ## O que este arquivo prova, e o que ele NÃO prova
 *
 * Prova o que esta máquina controla: o objeto que sai daqui, o cabeçalho que
 * carrega o token, e a leitura da resposta — inclusive os três casos em que o
 * provedor responde e **não** enviou.
 *
 * **Não prova entrega.** Entrega pelo Postmark exige conta no provedor, Sender
 * Signature com SPF e DKIM propagados em `mail.bichu.app`, e um token de
 * verdade; o próprio ADR-0009 fecha assim: *"o envio fica bloqueado até haver
 * conta no provedor e DNS com SPF e DKIM propagados no domínio definitivo"*. O
 * que existe neste repositório para provar entrega é o mailpit, e ele só fala
 * SMTP — ele mede o transporte irmão. Chamar a API do Postmark de dentro da
 * suíte mandaria e-mail de verdade a cada `npm test`, que é pior do que não
 * provar.
 *
 * O `fetch` é trocado por um **dublê que grava o que recebeu**. A diferença
 * entre isso e um dublê que só devolve sucesso é o ponto: o que está sob teste é
 * o que SAI, e um dublê mudo mediria apenas que a função não explodiu.
 *
 * ## Iscas conferidas
 *
 * Com o mecanismo desligado, uma forma de cada vez, e religado por edição
 * conferida com `git diff`:
 *
 * - `conferirResposta` devolvendo cedo em qualquer `2xx`: o caso "200 com
 *   ErrorCode diferente de zero é recusa, e não sucesso" reprova sozinho. É o
 *   caso que importa — o provedor responde, o `enviar()` resolve, e nada saiu;
 * - `conferirDestinatario` retirado de `montarCorpoDaApi`: o caso do endereço
 *   com vírgula reprova sozinho;
 * - o token interpolado numa mensagem de erro: o caso do vazamento reprova
 *   sozinho, tanto pela mensagem quanto pelo que foi escrito em `console`.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { criarMailerDoPostmark, montarCorpoDaApi } from './postmark-mailer.js';
import { criarMailer } from './smtp-mailer.js';
import type { MailConfig } from '../../../../shared/config/app-config.js';

/**
 * O token DESTA BANCADA. Ele não autentica em lugar nenhum e não é segredo.
 *
 * Escolhido para ser reconhecível em qualquer texto, e escrito de propósito com
 * uma forma que **não** é a de um token de servidor do Postmark (que é um UUID):
 * um valor com a forma do verdadeiro, num arquivo versionado, é o começo de
 * alguém procurar onde ele foi revogado. Nenhuma mensagem de erro e nenhuma
 * linha de log pode contê-lo, e a forma de afirmar isso é procurar por ele. Um
 * valor genérico (`abc`) daria falso negativo ao aparecer por acaso.
 */
const TOKEN_DA_BANCADA = 'token-de-bancada-que-nao-autentica-e-nao-pode-vazar';

const CONFIG: MailConfig = {
  transport: 'postmark',
  host: 'mail',
  port: 1025,
  from: 'nao-responda@mail.exemplo.test',
  fromName: 'Bichu',
  replyTo: 'nao-responda@mail.exemplo.test',
  apiToken: TOKEN_DA_BANCADA,
  // Do webhook de ENTRADA, e não deste caminho. Presente porque o tipo exige.
  webhookSecret: Buffer.from('x'.repeat(32), 'utf8'),
};

const ENDERECO_DO_TUTOR = 'tutor@exemplo.invalid';

const MENSAGEM = {
  para: ENDERECO_DO_TUTOR,
  assunto: 'Redefinir sua senha do Bichu',
  corpo: 'https://bichu.test/redefinir-senha?token=x',
};

interface ChamadaGravada {
  readonly url: string;
  readonly cabecalhos: Record<string, string>;
  readonly corpo: Record<string, string>;
}

const FETCH_ORIGINAL = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = FETCH_ORIGINAL;
});

/**
 * Troca o `fetch` por um dublê que grava a chamada e devolve o que o caso
 * mandar. Sem rede: nada sai desta máquina.
 *
 * Devolve o array de chamadas: é nele que os casos afirmam o que SAIU, que é a
 * metade que um dublê mudo não consegue medir.
 */
function interceptar(status: number, corpoDaResposta: unknown): ChamadaGravada[] {
  const chamadas: ChamadaGravada[] = [];
  globalThis.fetch = ((url: string, opcoes: RequestInit): Promise<Response> => {
    chamadas.push({
      url: String(url),
      cabecalhos: opcoes.headers as Record<string, string>,
      // `as string` e nao `String(...)`: o adaptador manda o corpo como texto
      // (`JSON.stringify`), e um `String()` sobre um `body` que deixasse de ser
      // texto viraria `[object Object]` em silencio -- o dublê gravaria lixo e o
      // caso acusaria a asserção errada.
      corpo: JSON.parse(opcoes.body as string) as Record<string, string>,
    });
    return Promise.resolve(
      new Response(
        typeof corpoDaResposta === 'string' ? corpoDaResposta : JSON.stringify(corpoDaResposta),
        { status },
      ),
    );
  }) as unknown as typeof fetch;
  return chamadas;
}

const ACEITO = { ErrorCode: 0, MessageID: 'aa-bb-cc', Message: 'OK' };

void describe('o corpo que vai para o provedor', () => {
  void it('leva remetente, destinatario, assunto, texto e o stream transacional', () => {
    const corpo = montarCorpoDaApi(CONFIG, {
      para: ENDERECO_DO_TUTOR,
      assunto: 'Redefinir sua senha do Bichu',
      corpo: 'Para escolher uma senha nova, abra:\n\nhttps://bichu.test/redefinir-senha?token=x',
    });

    assert.equal(corpo['From'], 'Bichu <nao-responda@mail.exemplo.test>');
    assert.equal(corpo['To'], ENDERECO_DO_TUTOR);
    assert.equal(corpo['ReplyTo'], 'nao-responda@mail.exemplo.test');
    assert.equal(corpo['Subject'], 'Redefinir sua senha do Bichu');
    // O corpo vai INTEIRO e sem escape de ponto: `escaparPontos` existe por
    // causa do terminador de dados do SMTP, que não tem equivalente em JSON.
    assert.match(corpo['TextBody'] ?? '', /redefinir-senha\?token=x$/);
    assert.equal(corpo['MessageStream'], 'outbound');
  });

  void it('o corpo com uma linha de um ponto so NAO e escapado: aqui nao ha terminador', () => {
    const corpo = montarCorpoDaApi(CONFIG, {
      para: ENDERECO_DO_TUTOR,
      assunto: 'Encerramos as sessoes',
      corpo: 'Alguem copiou o acesso.\n.\nTroque a sua senha.',
    });

    assert.equal(corpo['TextBody'], 'Alguem copiou o acesso.\n.\nTroque a sua senha.');
    assert.ok(
      !(corpo['TextBody'] ?? '').includes('\n..'),
      'o ponto foi escapado como no SMTP: a pessoa leria `..` onde ninguem escreveu',
    );
  });

  void it('assunto com CRLF vira uma linha so, e nao cabecalho novo', () => {
    // O Postmark escreve este valor num cabeçalho `Subject:` RFC 5322 do outro
    // lado. O JSON escapa a quebra de linha na serialização, mas o valor
    // desserializado do outro lado volta a tê-la.
    const corpo = montarCorpoDaApi(CONFIG, {
      para: ENDERECO_DO_TUTOR,
      assunto: 'Encerramos as sessoes\r\nBcc: atacante@exemplo.invalid',
      corpo: 'Detectamos um sinal de que alguem pode ter copiado o acesso.',
    });

    assert.equal(
      corpo['Subject'],
      'Encerramos as sessoes Bcc: atacante@exemplo.invalid',
      'a quebra de linha do assunto sobreviveu ate o corpo da API. Do outro lado ela ' +
        'vira um cabecalho `Bcc:` que ninguem escreveu, e quem o escolher recebe copia ' +
        'integral do aviso de seguranca da vitima, com o link de redefinicao dentro.',
    );
  });

  void it('ISCA: destinatario com virgula e RECUSADO, porque o `To` do provedor e uma lista', () => {
    // O caso que o JSON não protege. `JSON.stringify` escapa `\r\n`; ele não
    // escapa a vírgula, e a vírgula é o que acrescenta destinatário num
    // cabeçalho de endereço. Desligar `conferirDestinatario` de
    // `montarCorpoDaApi` reprova ESTE caso pelo nome.
    assert.throws(
      () => {
        montarCorpoDaApi(CONFIG, {
          para: `${ENDERECO_DO_TUTOR},atacante@exemplo.invalid`,
          assunto: 'Redefinir sua senha do Bichu',
          corpo: 'https://bichu.test/redefinir-senha?token=x',
        });
      },
      (erro: unknown) => {
        assert.ok(erro instanceof Error);
        assert.match(erro.message, /recusado/);
        // O endereço NÃO entra na mensagem: ele é dado pessoal e acaba em log.
        assert.ok(
          !erro.message.includes(ENDERECO_DO_TUTOR),
          'o endereco recusado entrou na mensagem de erro, e mensagem de erro vai para log',
        );
        return true;
      },
      'o endereco com virgula passou: o provedor entregaria copia ao segundo destinatario',
    );
  });

  void it('ISCA: a recusa acontece ANTES de qualquer byte sair, e nao depois', async () => {
    // A ordem importa tanto quanto a recusa. Um adaptador que conferisse depois
    // do `fetch` passaria no caso acima e teria mandado o endereço enxertado
    // para o provedor de qualquer jeito.
    const chamadas = interceptar(200, ACEITO);

    await assert.rejects(
      criarMailerDoPostmark(CONFIG).enviar({
        ...MENSAGEM,
        para: `${ENDERECO_DO_TUTOR},atacante@exemplo.invalid`,
      }),
      /recusado/,
    );

    assert.equal(
      chamadas.length,
      0,
      'o provedor foi chamado com o endereco que devia ter sido recusado: a conferencia ' +
        'aconteceu depois do envio, e a copia ja saiu',
    );
  });
});

void describe('a chamada ao provedor', () => {
  void it('manda o token no cabecalho do Postmark, e para o endereco dele', async () => {
    const chamadas = interceptar(200, ACEITO);

    await criarMailerDoPostmark(CONFIG).enviar(MENSAGEM);

    assert.equal(chamadas.length, 1, 'o envio nao chamou o provedor exatamente uma vez');
    assert.equal(chamadas[0]?.url, 'https://api.postmarkapp.com/email');
    assert.equal(chamadas[0]?.cabecalhos['X-Postmark-Server-Token'], TOKEN_DA_BANCADA);
    assert.equal(chamadas[0]?.cabecalhos['Content-Type'], 'application/json');
  });

  void it('200 com ErrorCode zero e MessageID resolve', async () => {
    interceptar(200, ACEITO);
    await criarMailerDoPostmark(CONFIG).enviar({
      para: ENDERECO_DO_TUTOR,
      assunto: 'Confirme seu e-mail no Bichu',
      corpo: 'https://bichu.test/verificar-email?token=x',
    });
  });

  void it('200 com ErrorCode diferente de zero e recusa, e nao sucesso', async () => {
    // O caso que separa "o provedor respondeu" de "o e-mail saiu". Aceitar
    // qualquer 2xx seria a versão difícil de ver do transporte `log`: a promessa
    // resolve, o log fica verde, e nada foi enviado.
    interceptar(200, { ErrorCode: 300, Message: 'Invalid email request' });

    await assert.rejects(
      criarMailerDoPostmark(CONFIG).enviar(MENSAGEM),
      (erro: unknown) => {
        assert.ok(erro instanceof Error);
        assert.match(erro.message, /ErrorCode 300/);
        return true;
      },
      'um 200 que NAO enviou passou como envio bem-sucedido',
    );
  });

  void it('200 com ErrorCode zero e SEM MessageID tambem e recusa', async () => {
    // A razão 3 de este transporte ser HTTP é o `MessageID`, que é por onde o
    // webhook de entrega casa o evento depois. Um `200 ErrorCode 0` sem ele não
    // é a resposta do Postmark: é a de um proxy, de um dublê esquecido ligado,
    // ou de um stub que vazou para um ambiente.
    interceptar(200, { ErrorCode: 0, Message: 'OK' });

    await assert.rejects(
      criarMailerDoPostmark(CONFIG).enviar(MENSAGEM),
      /MessageID/,
      'uma resposta sem identificador nenhum passou como envio: o adaptador declarou ' +
        'entrega contra um servidor que ninguem identificou',
    );
  });

  void it('destinatario em supressao reprova dizendo que e supressao', async () => {
    // ADR-0009 item 5: é a armadilha mais comum deste componente. Dizer só "o
    // provedor recusou" manda o suporte procurar no lugar errado.
    interceptar(422, {
      ErrorCode: 406,
      Message: 'You tried to send to recipient(s) that have been marked as inactive.',
    });

    await assert.rejects(criarMailerDoPostmark(CONFIG).enviar(MENSAGEM), /supress/i);
  });

  void it('resposta que nao e JSON reprova citando o status, e nao o parser', async () => {
    interceptar(502, '<html>bad gateway</html>');

    await assert.rejects(criarMailerDoPostmark(CONFIG).enviar(MENSAGEM), /HTTP 502/);
  });
});

/**
 * O vazamento do token, que é a isca do ADR-0022 neste arquivo.
 *
 * Duas superfícies, e não uma: a mensagem de erro (que vai para o log de quem
 * captura) e o que o processo escreve em `console` durante o envio. Medir só a
 * primeira deixaria passar um `console.error(cabecalhos)` posto para depurar e
 * esquecido — que é a forma mais comum de o segredo aparecer no log, e a que
 * nenhum `assert.rejects` enxerga.
 */
void describe('ISCA de vazamento: o token nao aparece em erro nem em log', () => {
  void it('nenhuma recusa carrega o token do provedor nem o endereco do tutor', async () => {
    const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
    const escrito: string[] = [];
    const capturar = (...partes: unknown[]): void => {
      escrito.push(partes.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' '));
    };

    console.log = capturar;
    console.info = capturar;
    console.warn = capturar;
    console.error = capturar;

    try {
      for (const [status, corpo] of [
        [422, { ErrorCode: 10, Message: 'Bad or missing API token' }],
        [500, { ErrorCode: 100, Message: 'Internal' }],
        [502, '<html>gateway</html>'],
        [200, { ErrorCode: 0, Message: 'OK' }],
      ] as const) {
        interceptar(status, corpo);

        await assert.rejects(criarMailerDoPostmark(CONFIG).enviar(MENSAGEM), (erro: unknown) => {
          assert.ok(erro instanceof Error);
          assert.ok(
            !erro.message.includes(TOKEN_DA_BANCADA),
            `o token do provedor entrou na mensagem de erro (HTTP ${String(status)}). ` +
              'Mensagem de erro vai para log, e o ADR-0022 proibe segredo em log: quem ' +
              'o tiver manda e-mail assinado pelo nosso dominio.',
          );
          assert.ok(
            !erro.message.includes(ENDERECO_DO_TUTOR),
            `o endereco do destinatario entrou na mensagem de erro (HTTP ${String(status)})`,
          );
          return true;
        });
      }
    } finally {
      console.log = original.log;
      console.info = original.info;
      console.warn = original.warn;
      console.error = original.error;
    }

    const vazou = escrito.filter((linha) => linha.includes(TOKEN_DA_BANCADA));
    assert.deepEqual(
      vazou,
      [],
      `o token do provedor foi escrito em console ${String(vazou.length)} vez(es). ` +
        'O ADR-0022 proibe segredo em log, e log de aplicacao sai da maquina.',
    );
  });
});

void describe('a criacao do mailer e a fiacao do transporte', () => {
  void it('ISCA: sem token o mailer NAO nasce, e a falha e na subida e nao no primeiro envio', () => {
    assert.throws(
      () => criarMailerDoPostmark({ ...CONFIG, apiToken: undefined }),
      /MAIL_API_TOKEN/,
      'o mailer nasceu sem token: a falha so apareceria no primeiro pedido de ' +
        'redefinicao de senha de alguem, ja em producao',
    );
  });

  void it('token vazio conta como ausente, e nao como token', () => {
    // `''` num cabeçalho `X-Postmark-Server-Token` não é "sem autenticação": é
    // uma autenticação que o provedor recusa com 401 no primeiro envio de
    // alguém. A recusa é aqui.
    assert.throws(() => criarMailerDoPostmark({ ...CONFIG, apiToken: '' }), /MAIL_API_TOKEN/);
  });

  void it('ISCA: `criarMailer` com transporte `postmark` devolve o adaptador do provedor', async () => {
    // A fiação. Sem este caso, o adaptador poderia estar correto e nunca ser
    // alcançado — que é a forma de defeito mais barata de cometer e mais cara de
    // achar. Foi o estado de `e0545d4`, onde o adaptador existia e nenhum ponto
    // de montagem o chamava.
    const chamadas = interceptar(200, ACEITO);

    await criarMailer(CONFIG).enviar(MENSAGEM);

    assert.equal(
      chamadas.length,
      1,
      '`criarMailer` com `postmark` nao chamou a API do provedor: ou caiu no SMTP, ou ' +
        'caiu no `log`, e nos dois casos nenhum e-mail sairia',
    );
  });

  void it('o remetente quebrado derruba a criacao TAMBEM no transporte do provedor', () => {
    // `conferirRemetente` roda antes da escolha do transporte, e este caso é o
    // que impede que ela volte para dentro de um dos ramos.
    assert.throws(
      () => criarMailer({ ...CONFIG, fromName: 'Bichu\r\nBcc: atacante@exemplo.invalid' }),
      /MAIL_FROM_NAME/,
    );
  });
});
