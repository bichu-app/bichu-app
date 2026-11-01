import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { VazamentoNoPushError } from '../../domain/conteudo-do-push.js';
import type { MensagemDePush } from '../../ports/push-sender.js';
import { criarPushSender, criarPushSenderDeLog } from './log-push-sender.js';

const TOKEN_DO_APARELHO = 'token-de-aparelho-que-nao-pode-aparecer-em-log';

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

const infoOriginal = console.info;
const fetchOriginal = globalThis.fetch;

afterEach(() => {
  console.info = infoOriginal;
  globalThis.fetch = fetchOriginal;
});

function capturarLog(): { linhas: string[] } {
  const linhas: string[] = [];
  console.info = (...argumentos: unknown[]): void => {
    linhas.push(argumentos.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };
  return { linhas };
}

function envenenarRede(): { tentativas: string[] } {
  const tentativas: string[] = [];
  globalThis.fetch = (entrada: unknown): Promise<Response> => {
    tentativas.push(String(entrada));
    throw new Error('REPROVA: o transporte `log` tentou falar com a rede');
  };
  return { tentativas };
}

void describe('transporte `log`: escreve o payload, e nada sai do processo', () => {
  void it('o payload inteiro vai para o log, que é o que prova o disparo', () => {
    const { linhas } = capturarLog();
    void criarPushSenderDeLog().enviar(mensagem());

    assert.equal(linhas.length, 1, 'o transporte `log` não escreveu nada: não há o que provar');
    const registro = JSON.parse(linhas[0]!) as Record<string, unknown>;
    assert.equal(registro['evento'], 'push.send');
    assert.equal(registro['transporte'], 'log');
    assert.equal(registro['titulo'], 'Alguém está com Nina');
    assert.deepEqual(registro['dados'], { tipo: 'tagEscaneada', ref: 'k7QpZr3XmBvNs2Td' });
    assert.equal(registro['chave_de_agrupamento'], 'tagEscaneada:k7QpZr3XmBvNs2Td');
    assert.equal(registro['prioridade'], 'alta');
    assert.equal(registro['validade_em_segundos'], 86_400);
  });

  void it('o token do aparelho NÃO aparece no log; o resumo dele sim', () => {
    const { linhas } = capturarLog();
    void criarPushSenderDeLog().enviar(mensagem());

    assert.ok(
      !linhas[0]!.includes(TOKEN_DO_APARELHO),
      'o token do aparelho foi impresso no log. Ele é o endereço para onde qualquer ' +
        'coisa pode ser mandada, e a porta proíbe isso em log e em erro (exigência 4).',
    );
    const registro = JSON.parse(linhas[0]!) as Record<string, unknown>;
    const aparelho = registro['aparelho'];
    assert.equal(typeof aparelho, 'string');
    assert.match(
      aparelho as string,
      /^[0-9a-f]{12}$/,
      'o log precisa distinguir os aparelhos para provar o teto de 500 e a ausência ' +
        'de destinatário repetido; sem um identificador estável não prova nenhum dos dois.',
    );
  });

  void it('aparelhos diferentes dão resumos diferentes, e o mesmo dá o mesmo', () => {
    const { linhas } = capturarLog();
    const remetente = criarPushSenderDeLog();
    void remetente.enviar(mensagem());
    void remetente.enviar(mensagem({ token: 'outro-aparelho-do-mesmo-tutor' }));
    void remetente.enviar(mensagem());

    const resumos = linhas.map((l) => (JSON.parse(l) as Record<string, unknown>)['aparelho']);
    assert.equal(resumos[0], resumos[2], 'o mesmo aparelho produziu resumos diferentes');
    assert.notEqual(resumos[0], resumos[1], 'aparelhos diferentes produziram o mesmo resumo');
  });

  void it('a porteira vale aqui também: dado sensível não chega nem ao log', async () => {
    const { linhas } = capturarLog();
    await assert.rejects(
      () => criarPushSenderDeLog().enviar(mensagem({ corpo: 'Ligue para (11) 98765-4321' })),
      VazamentoNoPushError,
    );
    assert.deepEqual(linhas, [], 'a mensagem recusada ainda assim foi escrita no log');
  });

  void it('o nome do transporte diz, sem deduzir, que nada sai daqui', () => {
    const transporte = criarPushSenderDeLog().transporte;
    assert.match(transporte, /log/i);
    assert.match(transporte, /nada sai/i);
    assert.ok(!/fcm/i.test(transporte), 'o transporte `log` se apresenta como FCM');
  });
});

void describe('PUSH_TRANSPORT: o `log` não vira envio real por acidente', () => {
  void it('com `log`, nenhuma chamada de rede acontece — nem para o FCM, nem para metadados', async () => {
    const { tentativas } = envenenarRede();
    capturarLog();

    const resultado = await criarPushSender({ transport: 'log', projeto: undefined }).enviar(
      mensagem(),
    );

    assert.equal(resultado, 'aceito');
    assert.deepEqual(
      tentativas,
      [],
      'o transporte `log` abriu rede. Isto é envio real com nome de transporte de ' +
        'desenvolvimento: exatamente o defeito de MAIL_TRANSPORT de 19/09, num canal ' +
        'que chega à tela de bloqueio de um tutor e não se desfaz.',
    );
  });

  void it('com `log`, o projeto é ignorado: configuração de FCM presente não liga o FCM', async () => {
    const { tentativas } = envenenarRede();
    capturarLog();

    await criarPushSender({ transport: 'log', projeto: 'projeto-de-teste' }).enviar(mensagem());
    assert.deepEqual(tentativas, [], 'o projeto preenchido ligou o envio real com `log`');
  });

  void it('com `fcm`, quem sai é o adaptador do FCM, com o projeto configurado', () => {
    const remetente = criarPushSender({ transport: 'fcm', projeto: 'projeto-de-teste' });
    assert.match(remetente.transporte, /FCM/);
    assert.match(
      remetente.transporte,
      /projeto-de-teste/,
      'o transporte não diz para qual projeto o envio vai, que é a primeira coisa a ' +
        'conferir quando o FCM responde SENDER_ID_MISMATCH',
    );
  });

  void it('com `fcm` e sem projeto, a montagem morre citando FCM_PROJECT', () => {
    assert.throws(
      () => criarPushSender({ transport: 'fcm', projeto: undefined }),
      /FCM_PROJECT/,
    );
    assert.throws(() => criarPushSender({ transport: 'fcm', projeto: '' }), /FCM_PROJECT/);
  });
});
