/**
 * Testes do adaptador de push (ADR-0008).
 *
 * Sem rede e sem aparelho: `fetch` entra por parâmetro. Não há envio de
 * verdade aqui de propósito — push real exige aparelho físico e está em
 * BICHUS-136. O que está sob teste é o que dá para provar sem aparelho, e é
 * justamente o que quebra calado no dia da homologação:
 *
 * 1. **A porteira do payload roda antes do fio.** Uma mensagem com dado
 *    pessoal não pode sair nem consumir credencial para ser recusada.
 * 2. **A tradução da falha do transporte para a decisão de quem chamou.**
 *    `SENDER_ID_MISMATCH` é o caso que justifica o arquivo: lido cru, ele manda
 *    apagar o aparelho e mandar a pessoa reinstalar, e o defeito volta parecendo
 *    intermitente porque a causa era o projeto errado.
 * 3. **`retentavel`**, que é o que a fila lê. Repetir para sempre uma falha que
 *    não passa é como uma fila morre sem ninguém notar.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { VazamentoNoPushError } from '../../domain/conteudo-do-push.js';
import { PushNaoEnviadoError, type MensagemDePush } from '../../ports/push-sender.js';
import { criarPushSenderFcm, type Buscar } from './fcm-http-v1.js';

/**
 * O endereco EXATO do token (29/09: a forma `service-account/token` respondia
 * 404 na VM e passava aqui, porque o duble respondia a qualquer URL com
 * `metadata`). Literal, e nao importado: trocar a constante do adaptador
 * reprova este arquivo.
 */
const METADADOS_EXATO =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

const CONFIG = { projeto: 'projeto-de-teste' };
const TOKEN_DO_APARELHO = 'token-de-aparelho-que-nao-pode-aparecer-em-log';

const CREDENCIAL = JSON.stringify({ access_token: 'token-descartavel', expires_in: 3600 });

function mensagem(ajuste: Partial<MensagemDePush> = {}): MensagemDePush {
  return {
    token: TOKEN_DO_APARELHO,
    titulo: 'Alguém está com Nina',
    corpo: 'Uma pessoa escaneou a tag agora, na Vila Madalena. Toque para falar.',
    dados: { tipo: 'tagEscaneada', ref: 'k7QpZr3XmBvNs2Td' },
    chaveDeAgrupamento: 'tagEscaneada:k7QpZr3XmBvNs2Td',
    validadeEmSegundos: 86_400,
    prioridade: 'alta',
    ...ajuste,
  };
}

/**
 * `fetch` falso: responde a credencial no endereço de metadados e delega o
 * resto ao caso. As chamadas ficam registradas com corpo, para que o teste
 * confira **o que foi para o fio** — que é o único lugar onde se prova que
 * nada sensível saiu.
 */
function buscarFalso(responder: (url: string) => Response): {
  buscar: Buscar;
  chamadas: { url: string; corpo: string | undefined }[];
} {
  const chamadas: { url: string; corpo: string | undefined }[] = [];
  const buscar: Buscar = (entrada, init) => {
    const url = typeof entrada === 'string' ? entrada : new Request(entrada).url;
    chamadas.push({ url, corpo: typeof init?.body === 'string' ? init.body : undefined });
    if (url === METADADOS_EXATO) return Promise.resolve(new Response(CREDENCIAL, { status: 200 }));
    // Qualquer outra forma do endereco de metadados: 404, como na VM.
    if (url.includes('metadata.google.internal')) return Promise.resolve(new Response('', { status: 404 }));
    return Promise.resolve(responder(url));
  };
  return { buscar, chamadas };
}

function recusa(status: number, errorCode?: string): Response {
  const corpo =
    errorCode === undefined
      ? { error: { code: status, message: 'recusado' } }
      : {
          error: {
            code: status,
            message: 'recusado',
            details: [
              { '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode },
            ],
          },
        };
  return new Response(JSON.stringify(corpo), { status });
}

/** Sucesso do transporte: ele devolve o nome da mensagem, e nada mais. */
function aceito(): Response {
  return new Response(JSON.stringify({ name: 'projects/x/messages/1' }), { status: 200 });
}

void describe('a porteira do payload roda ANTES de qualquer coisa', () => {
  void it('mensagem com UUID não chega ao fio, e não gasta credencial para ser recusada', async () => {
    const { buscar, chamadas } = buscarFalso(() => aceito());
    await assert.rejects(
      () =>
        criarPushSenderFcm(CONFIG, buscar).enviar(
          mensagem({ dados: { tipo: 'tagEscaneada', ref: '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f' } }),
        ),
      (erro: unknown) => erro instanceof VazamentoNoPushError,
    );
    // NADA foi chamado: nem o metadados, nem o transporte. Se esta linha cair,
    // um payload com dado pessoal já saiu da máquina antes de alguém reclamar.
    assert.deepEqual(chamadas, []);
  });

  void it('mensagem com telefone no corpo também não sai', async () => {
    const { buscar, chamadas } = buscarFalso(() => aceito());
    await assert.rejects(
      () =>
        criarPushSenderFcm(CONFIG, buscar).enviar(
          mensagem({ corpo: 'Ligue para (11) 98888-7777.' }),
        ),
      (erro: unknown) => erro instanceof VazamentoNoPushError && erro.padrao === 'telefone',
    );
    assert.deepEqual(chamadas, []);
  });
});

void describe('o que vai para o fio é o que o ADR-0008 descreve', () => {
  void it('pede ao projeto configurado, na rota de envio da v1', async () => {
    const { buscar, chamadas } = buscarFalso(() => aceito());
    await criarPushSenderFcm(CONFIG, buscar).enviar(mensagem());
    const envio = chamadas.find((c) => c.url !== METADADOS_EXATO);
    assert.ok(envio?.url.includes('/projects/projeto-de-teste/messages:send'), envio?.url);
  });

  void it('leva `notification`, e não só `data`: sem ela o app encerrado não mostra nada', async () => {
    const { buscar, chamadas } = buscarFalso(() => aceito());
    await criarPushSenderFcm(CONFIG, buscar).enviar(mensagem());
    const envio = chamadas.find((c) => c.url !== METADADOS_EXATO);
    const corpo: unknown = JSON.parse(envio?.corpo ?? '{}');
    assert.deepEqual(
      (corpo as { message: { notification: unknown } }).message.notification,
      { title: 'Alguém está com Nina', body: mensagem().corpo },
    );
  });

  void it('agrupamento, validade e prioridade viajam no bloco do Android', async () => {
    const { buscar, chamadas } = buscarFalso(() => aceito());
    await criarPushSenderFcm(CONFIG, buscar).enviar(
      mensagem({ validadeEmSegundos: 21_600, prioridade: 'alta' }),
    );
    const envio = chamadas.find((c) => c.url !== METADADOS_EXATO);
    const android = (JSON.parse(envio?.corpo ?? '{}') as {
      message: { android: Record<string, unknown> };
    }).message.android;
    assert.equal(android['ttl'], '21600s');
    assert.equal(android['collapse_key'], 'tagEscaneada:k7QpZr3XmBvNs2Td');
    // Nome do enum em maiúsculas: a forma canônica do JSON de protobuf. A
    // minúscula é tolerada hoje, e depender de tolerância não é contrato.
    assert.equal(android['priority'], 'HIGH');
  });

  void it('NÃO manda bloco de iOS: a chave APNs é pendência de BICHUS-136', async () => {
    const { buscar, chamadas } = buscarFalso(() => aceito());
    await criarPushSenderFcm(CONFIG, buscar).enviar(mensagem());
    const envio = chamadas.find((c) => c.url !== METADADOS_EXATO);
    const message = (JSON.parse(envio?.corpo ?? '{}') as { message: Record<string, unknown> })
      .message;
    // Um bloco vazio não adiantaria, e um bloco preenchido esconderia a
    // pendência atrás de configuração que não funciona.
    assert.equal(message['apns'], undefined);
  });

  void it('sem foto, não vai bloco de notificação do Android com imagem vazia', async () => {
    const { buscar, chamadas } = buscarFalso(() => aceito());
    await criarPushSenderFcm(CONFIG, buscar).enviar(mensagem());
    const envio = chamadas.find((c) => c.url !== METADADOS_EXATO);
    const android = (JSON.parse(envio?.corpo ?? '{}') as {
      message: { android: Record<string, unknown> };
    }).message.android;
    assert.equal(android['notification'], undefined);
  });
});

void describe('higiene de token: aparelho sumido é desfecho, e não exceção', () => {
  void it('UNREGISTERED devolve `aparelho-sumiu` para quem chamou apagar o registro', async () => {
    const { buscar } = buscarFalso(() => recusa(404, 'UNREGISTERED'));
    assert.equal(await criarPushSenderFcm(CONFIG, buscar).enviar(mensagem()), 'aparelho-sumiu');
  });

  void it('404 sem detalhe também é aparelho sumido', async () => {
    const { buscar } = buscarFalso(() => recusa(404));
    assert.equal(await criarPushSenderFcm(CONFIG, buscar).enviar(mensagem()), 'aparelho-sumiu');
  });
});

void describe('falha ruidosa: a mensagem diz O QUE fazer, e não o erro do transporte', () => {
  void it('SENDER_ID_MISMATCH diz que apagar o aparelho NÃO resolve', async () => {
    const { buscar } = buscarFalso(() => recusa(403, 'SENDER_ID_MISMATCH'));
    await assert.rejects(
      () => criarPushSenderFcm(CONFIG, buscar).enviar(mensagem()),
      (erro: unknown) =>
        erro instanceof PushNaoEnviadoError &&
        erro.motivo === 'projeto-divergente' &&
        erro.retentavel === false &&
        // As DUAS leituras precisam estar na mensagem: sem a segunda, quem lê
        // apaga o aparelho e o defeito volta parecendo intermitente.
        erro.message.includes('OUTRO projeto') &&
        erro.message.includes('google-services.json'),
    );
  });

  void it('THIRD_PARTY_AUTH_ERROR aponta a chave APNs e BICHUS-136, e não este código', async () => {
    const { buscar } = buscarFalso(() => recusa(401, 'THIRD_PARTY_AUTH_ERROR'));
    await assert.rejects(
      () => criarPushSenderFcm(CONFIG, buscar).enviar(mensagem()),
      (erro: unknown) =>
        erro instanceof PushNaoEnviadoError &&
        erro.motivo === 'credencial-apns' &&
        erro.retentavel === false &&
        erro.message.includes('BICHUS-136') &&
        erro.message.includes('não afeta Android'),
    );
  });

  void it('INVALID_ARGUMENT é defeito nosso e NÃO se repete', async () => {
    const { buscar } = buscarFalso(() => recusa(400, 'INVALID_ARGUMENT'));
    await assert.rejects(
      () => criarPushSenderFcm(CONFIG, buscar).enviar(mensagem()),
      (erro: unknown) =>
        erro instanceof PushNaoEnviadoError &&
        erro.motivo === 'mensagem-malformada' &&
        erro.retentavel === false,
    );
  });

  void it('401 sem detalhe é a conta de serviço da máquina, e cita a permissão que falta', async () => {
    const { buscar } = buscarFalso(() => recusa(401));
    await assert.rejects(
      () => criarPushSenderFcm(CONFIG, buscar).enviar(mensagem()),
      (erro: unknown) =>
        erro instanceof PushNaoEnviadoError &&
        erro.motivo === 'credencial' &&
        erro.retentavel === false &&
        erro.message.includes('cloudmessaging.messages.create'),
    );
  });

  void it('cota e transporte fora do ar VOLTAM para a fila', async () => {
    for (const [status, code] of [
      [429, 'QUOTA_EXCEEDED'],
      [503, 'UNAVAILABLE'],
      [500, 'INTERNAL'],
    ] as const) {
      const { buscar } = buscarFalso(() => recusa(status, code));
      await assert.rejects(
        () => criarPushSenderFcm(CONFIG, buscar).enviar(mensagem()),
        (erro: unknown) => erro instanceof PushNaoEnviadoError && erro.retentavel,
        `REPROVA: ${String(status)} ${code} deveria ser retentável.`,
      );
    }
  });

  void it('usa o `status` genérico do Google quando o transporte não manda `details`', async () => {
    // Nem toda recusa traz o `errorCode` do FCM. Sem esta leitura, a recusa
    // cairia no mapeamento por status HTTP e perderia o nome da causa.
    const { buscar } = buscarFalso(
      () => new Response(JSON.stringify({ error: { code: 400, status: 'INVALID_ARGUMENT' } }), { status: 400 }),
    );
    await assert.rejects(
      () => criarPushSenderFcm(CONFIG, buscar).enviar(mensagem()),
      (erro: unknown) =>
        erro instanceof PushNaoEnviadoError && erro.motivo === 'mensagem-malformada',
    );
  });

  void it('corpo de erro que não é JSON não derruba a tradução', async () => {
    // Uma borda no caminho pode devolver HTML numa falha. Se o `json()`
    // estourasse aqui, a causa real (o status) se perderia atrás de um
    // `SyntaxError` que não diz nada a quem lê o log.
    const { buscar } = buscarFalso(() => new Response('<html>502</html>', { status: 502 }));
    await assert.rejects(
      () => criarPushSenderFcm(CONFIG, buscar).enviar(mensagem()),
      (erro: unknown) =>
        erro instanceof PushNaoEnviadoError &&
        erro.motivo === 'transporte-indisponivel' &&
        erro.retentavel,
    );
  });

  void it('status desconhecido NÃO vira retentável por otimismo', async () => {
    // Repetir para sempre uma falha que ninguém sabe ler é como uma fila morre
    // sem ninguém notar.
    const { buscar } = buscarFalso(() => recusa(418));
    await assert.rejects(
      () => criarPushSenderFcm(CONFIG, buscar).enviar(mensagem()),
      (erro: unknown) =>
        erro instanceof PushNaoEnviadoError &&
        erro.motivo === 'desconhecido' &&
        erro.retentavel === false,
    );
  });

  void it('rede fora do ar é retentável, e não se confunde com credencial', async () => {
    const buscar: Buscar = (entrada) => {
      const url = typeof entrada === 'string' ? entrada : new Request(entrada).url;
      if (url === METADADOS_EXATO) return Promise.resolve(new Response(CREDENCIAL, { status: 200 }));
      // Qualquer outra forma do endereco de metadados: 404, como na VM.
      if (url.includes('metadata.google.internal')) return Promise.resolve(new Response('', { status: 404 }));
      return Promise.reject(new Error('getaddrinfo ENOTFOUND'));
    };
    await assert.rejects(
      () => criarPushSenderFcm(CONFIG, buscar).enviar(mensagem()),
      (erro: unknown) =>
        erro instanceof PushNaoEnviadoError && erro.motivo === 'rede' && erro.retentavel,
    );
  });
});

void describe('a credencial vem do metadados, e nunca de arquivo', () => {
  void it('instância sem conta de serviço falha citando a causa, e NÃO é retentável', async () => {
    const buscar: Buscar = (entrada) => {
      const url = typeof entrada === 'string' ? entrada : new Request(entrada).url;
      if (url === METADADOS_EXATO) return Promise.resolve(new Response('', { status: 404 }));
      // Qualquer outra forma do endereco de metadados: 404, como na VM.
      if (url.includes('metadata.google.internal')) return Promise.resolve(new Response('', { status: 404 }));
      return Promise.resolve(aceito());
    };
    await assert.rejects(
      () => criarPushSenderFcm(CONFIG, buscar).enviar(mensagem()),
      (erro: unknown) =>
        erro instanceof PushNaoEnviadoError &&
        erro.motivo === 'credencial' &&
        erro.retentavel === false &&
        erro.message.includes('conta de serviço'),
    );
  });

  void it('metadados responde 200 sem `access_token`: não segue com credencial vazia', async () => {
    const buscar: Buscar = (entrada) => {
      const url = typeof entrada === 'string' ? entrada : new Request(entrada).url;
      if (url === METADADOS_EXATO) {
        return Promise.resolve(new Response(JSON.stringify({ expires_in: 3600 }), { status: 200 }));
      }
      // Qualquer outra forma do endereco de metadados: 404, como na VM.
      if (url.includes('metadata.google.internal')) return Promise.resolve(new Response('', { status: 404 }));
      return Promise.resolve(aceito());
    };
    await assert.rejects(
      () => criarPushSenderFcm(CONFIG, buscar).enviar(mensagem()),
      (erro: unknown) =>
        erro instanceof PushNaoEnviadoError &&
        erro.motivo === 'credencial' &&
        erro.retentavel === false,
    );
  });

  void it('o token da instância é reaproveitado: não há uma ida ao metadados por push', async () => {
    // Um alerta de vizinhança sai para dezenas de aparelhos. Uma ida ao
    // metadados por aparelho transformaria o envio em cascata de chamadas.
    const { buscar, chamadas } = buscarFalso(() => aceito());
    const remetente = criarPushSenderFcm(CONFIG, buscar);
    await remetente.enviar(mensagem());
    await remetente.enviar(mensagem({ token: 'outro-aparelho' }));
    assert.equal(chamadas.filter((c) => c.url === METADADOS_EXATO).length, 1);
  });
});

void describe('o token do aparelho não vaza', () => {
  void it('nenhuma mensagem de erro carrega o token', async () => {
    for (const responder of [
      () => recusa(403, 'SENDER_ID_MISMATCH'),
      () => recusa(400, 'INVALID_ARGUMENT'),
      () => recusa(503, 'UNAVAILABLE'),
      () => recusa(418),
    ]) {
      const { buscar } = buscarFalso(responder);
      await criarPushSenderFcm(CONFIG, buscar)
        .enviar(mensagem())
        .then(
          () => assert.fail('deveria ter falhado'),
          (erro: unknown) => {
            assert.ok(erro instanceof Error);
            assert.ok(
              !erro.message.includes(TOKEN_DO_APARELHO),
              'REPROVA: o token do aparelho entrou na mensagem de erro, e erro ' +
                'de envio vai para o log.',
            );
          },
        );
    }
  });

  void it('o rótulo do transporte não carrega credencial nem token', () => {
    const { buscar } = buscarFalso(() => aceito());
    const remetente = criarPushSenderFcm(CONFIG, buscar);
    assert.ok(!remetente.transporte.includes(TOKEN_DO_APARELHO));
    assert.ok(remetente.transporte.includes(CONFIG.projeto));
  });
});
