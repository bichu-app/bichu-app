/**
 * Os dois gatilhos de `hold_for_review` (critérios 10, 11 e 17).
 *
 * O critério 17 existe porque contar a coisa errada aqui **inverte** a
 * contramedida, e os dois casos que ele nomeia estão abaixo palavra por
 * palavra: trinta mensagens num caso só não disparam, uma mensagem em três
 * casos diferentes dispara.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  retencaoDestaMensagem,
  TETO_DE_CASOS_DISTINTOS_EM_24H,
  TETO_DE_MENSAGENS_EM_24H,
} from './retencao-para-revisao.js';

void describe('volume de mensagens na mesma conversa', () => {
  void it('a 200ª passa, e a 201ª retém', () => {
    assert.equal(
      retencaoDestaMensagem({
        mensagensDoParticipante: TETO_DE_MENSAGENS_EM_24H,
        casosDistintosDaConta: 1,
      }),
      null,
    );
    assert.equal(
      retencaoDestaMensagem({
        mensagensDoParticipante: TETO_DE_MENSAGENS_EM_24H + 1,
        casosDistintosDaConta: 1,
      }),
      'message_volume',
    );
  });
});

void describe('critério 17 — o que se conta são CASOS, não mensagens', () => {
  void it('trinta mensagens num único caso NÃO disparam o gatilho do falso achador', () => {
    assert.equal(
      retencaoDestaMensagem({ mensagensDoParticipante: 30, casosDistintosDaConta: 1 }),
      null,
    );
  });

  void it('uma mensagem em três casos diferentes DISPARA', () => {
    assert.equal(
      retencaoDestaMensagem({
        mensagensDoParticipante: 1,
        casosDistintosDaConta: TETO_DE_CASOS_DISTINTOS_EM_24H,
      }),
      'serial_finder',
    );
  });

  void it('dois casos ainda não disparam', () => {
    assert.equal(
      retencaoDestaMensagem({ mensagensDoParticipante: 1, casosDistintosDaConta: 2 }),
      null,
    );
  });

  void it('quem não tem conta não tem série a contar', () => {
    // O token do achador tem escopo de UMA conversa. Contar casos distintos
    // deste lado é contar sempre `1`, e um `0` interpretado como `undefined`
    // faria o gatilho nunca valer para quem tem conta.
    assert.equal(
      retencaoDestaMensagem({ mensagensDoParticipante: 5, casosDistintosDaConta: undefined }),
      null,
    );
  });
});

void describe('quando os dois valem, o motivo mais grave é o que a moderação lê', () => {
  void it('série de casos ganha de volume de mensagens', () => {
    assert.equal(
      retencaoDestaMensagem({
        mensagensDoParticipante: TETO_DE_MENSAGENS_EM_24H + 1,
        casosDistintosDaConta: TETO_DE_CASOS_DISTINTOS_EM_24H,
      }),
      'serial_finder',
    );
  });
});

void describe('ISCA — os números vêm do contrato e não podem derivar em silêncio', () => {
  void it('são 200 mensagens e 3 casos, como `api/openapi.yaml` declara', () => {
    // O contrato é a fonte dos dois números. Mudá-los aqui sem mudá-los lá faz
    // o mesmo `200` significar duas coisas no mesmo sistema, e o lugar onde a
    // divergência aparece é a fila de moderação vazia.
    assert.equal(TETO_DE_MENSAGENS_EM_24H, 200);
    assert.equal(TETO_DE_CASOS_DISTINTOS_EM_24H, 3);
  });
});
