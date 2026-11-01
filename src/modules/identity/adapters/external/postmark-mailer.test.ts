import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { criarMailerDoPostmark, montarCorpoDaApi } from './postmark-mailer.js';
import { criarMailer } from './smtp-mailer.js';
import type { MailConfig } from '../../../../shared/config/app-config.js';

const TOKEN_DA_BANCADA = 'token-de-bancada-que-nao-autentica-e-nao-pode-vazar';

const CONFIG: MailConfig = {
  transport: 'postmark',
  host: 'mail',
  port: 1025,
  from: 'nao-responda@mail.exemplo.test',
  fromName: 'Bichu',
  replyTo: 'nao-responda@mail.exemplo.test',
  apiToken: TOKEN_DA_BANCADA,
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

function interceptar(status: number, corpoDaResposta: unknown): ChamadaGravada[] {
  const chamadas: ChamadaGravada[] = [];
  globalThis.fetch = ((url: string, opcoes: RequestInit): Promise<Response> => {
    chamadas.push({
      url: String(url),
      cabecalhos: opcoes.headers as Record<string, string>,
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
    interceptar(200, { ErrorCode: 0, Message: 'OK' });

    await assert.rejects(
      criarMailerDoPostmark(CONFIG).enviar(MENSAGEM),
      /MessageID/,
      'uma resposta sem identificador nenhum passou como envio: o adaptador declarou ' +
        'entrega contra um servidor que ninguem identificou',
    );
  });

  void it('destinatario em supressao reprova dizendo que e supressao', async () => {
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
    assert.throws(() => criarMailerDoPostmark({ ...CONFIG, apiToken: '' }), /MAIL_API_TOKEN/);
  });

  void it('ISCA: `criarMailer` com transporte `postmark` devolve o adaptador do provedor', async () => {
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
    assert.throws(
      () => criarMailer({ ...CONFIG, fromName: 'Bichu\r\nBcc: atacante@exemplo.invalid' }),
      /MAIL_FROM_NAME/,
    );
  });
});
