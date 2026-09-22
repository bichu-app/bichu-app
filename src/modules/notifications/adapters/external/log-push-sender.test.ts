/**
 * O transporte `log` e a escolha entre os dois adaptadores (ADR-0008).
 *
 * Cada caso aqui é uma isca: ele existe para REPROVAR com a defesa
 * correspondente arrancada. Um teste que só conferisse "o log saiu" passaria
 * com a porteira removida, com o token do aparelho impresso no meio da linha e
 * com o `log` mandando push de verdade — que são exatamente os três defeitos
 * que este arquivo existe para pegar.
 *
 * O terceiro é a família do `MAIL_TRANSPORT`: até 19/09 qualquer valor fora dos
 * dois virava envio real em silêncio, e só não doeu porque o host apontava para
 * o mailpit. Push não tem mailpit. Um `log` que enviasse de verdade tocaria o
 * telefone de um tutor, uma vez, sem desfazer.
 */
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

/** Tudo o que o adaptador escreveu, como uma linha só, para procurar dentro. */
function capturarLog(): { linhas: string[] } {
  const linhas: string[] = [];
  console.info = (...argumentos: unknown[]): void => {
    linhas.push(argumentos.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };
  return { linhas };
}

/**
 * Troca o `fetch` global por um que EXPLODE.
 *
 * É a prova de que o transporte `log` não abre rede: ele não recebe `fetch` por
 * parâmetro, então a única forma de afirmar que ele não usa o global é
 * envenenar o global. Sem isto, um `log` que passasse a enviar de verdade
 * continuaria passando em todos os outros casos deste arquivo.
 */
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
    // Exigência 4 da porta. O token identifica uma instalação e, para quem tem
    // a credencial do projeto, é o endereço para onde mandar qualquer coisa —
    // e o log de `dev` vai para o terminal, para o `docker compose logs` e para
    // a captura de tela do relato.
    //
    // Isca: troque `resumoDoAparelho(mensagem.token)` por `mensagem.token` e
    // este caso reprova sozinho.
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
    // Contrapeso do caso acima: um `aparelho: "oculto"` fixo também esconderia
    // o token, e não serviria para nada — o log existe para contar
    // destinatários e para ver repetido.
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
    // Um transporte de desenvolvimento que aceitasse o que o de produção recusa
    // ensinaria a regra errada a quem testa contra ele — a mensagem com
    // telefone dentro passaria a semana inteira em `dev` e só o primeiro envio
    // real diria que ela nunca podia ter existido.
    //
    // Isca: apague a chamada de `assegurarSuperficiePublica` e este caso reprova.
    //
    // `rejects` e não `throws`: a porta promete `Promise`, e a recusa precisa
    // sair como promessa REJEITADA — um `throw` síncrono escaparia do
    // `.catch()` de quem chama.
    const { linhas } = capturarLog();
    await assert.rejects(
      () => criarPushSenderDeLog().enviar(mensagem({ corpo: 'Ligue para (11) 98765-4321' })),
      VazamentoNoPushError,
    );
    assert.deepEqual(linhas, [], 'a mensagem recusada ainda assim foi escrita no log');
  });

  void it('o nome do transporte diz, sem deduzir, que nada sai daqui', () => {
    // Ele sai no log de subida do worker. "Por onde este processo manda push?"
    // é a primeira pergunta de todo incidente de notificação, e com `log` a
    // resposta certa é "por lugar nenhum" — que ninguém adivinha.
    const transporte = criarPushSenderDeLog().transporte;
    assert.match(transporte, /log/i);
    assert.match(transporte, /nada sai/i);
    assert.ok(!/fcm/i.test(transporte), 'o transporte `log` se apresenta como FCM');
  });
});

void describe('PUSH_TRANSPORT: o `log` não vira envio real por acidente', () => {
  void it('com `log`, nenhuma chamada de rede acontece — nem para o FCM, nem para metadados', async () => {
    // A família do `MAIL_TRANSPORT`, que aceitava qualquer valor e mandava
    // e-mail de verdade em silêncio. Push não tem receptor local para segurar
    // o estrago: o telefone de um tutor toca uma vez, e não desfaz.
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
    // O caso que pega a escolha invertida. Um `criarPushSender` que decidisse
    // pela presença do projeto — e não pelo transporte — enviaria de verdade
    // em toda máquina que tivesse `FCM_PROJECT` preenchido no `.env`.
    const { tentativas } = envenenarRede();
    capturarLog();

    await criarPushSender({ transport: 'log', projeto: 'projeto-de-teste' }).enviar(mensagem());
    assert.deepEqual(tentativas, [], 'o projeto preenchido ligou o envio real com `log`');
  });

  // Contrapeso: sem ele, um `criarPushSender` que devolvesse SEMPRE o `log`
  // passaria em tudo acima — e o produto nunca enviaria push em produção, em
  // silêncio, que é a outra metade do mesmo defeito.
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
    // O tipo permite (`projeto` é opcional porque com `log` ele não existe), e
    // sem esta guarda o endereço de envio vira
    // `/v1/projects/undefined/messages:send` — recusado pelo transporte com um
    // erro que não fala de variável de ambiente nenhuma.
    assert.throws(
      () => criarPushSender({ transport: 'fcm', projeto: undefined }),
      /FCM_PROJECT/,
    );
    assert.throws(() => criarPushSender({ transport: 'fcm', projeto: '' }), /FCM_PROJECT/);
  });
});
