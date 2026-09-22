/**
 * A mediação, como regra.
 *
 * O caso mais importante deste arquivo é o último: **nenhum campo do
 * participante carrega telefone, e-mail, endereço ou identificador de conta.**
 * Ele é escrito como varredura do objeto inteiro, e não como "confira que não
 * tem `phone`", porque a forma fraca aprova o campo que alguém acrescentar
 * amanhã com outro nome — e o dia em que alguém acrescenta é exatamente o dia
 * em que o teste precisava acusar.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { comoData } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';
import {
  aceitaMensagem,
  estadoDaConversa,
  participantesVisiveis,
  primeiroNomeOuApelido,
} from './conversa-mediada.js';

const ABERTA = { encerradaEm: null, bloqueadaEm: null, casoEncerrado: false };
const UM_INSTANTE = comoData(Date.parse('2026-09-22T12:00:00.000Z') as Instant);

void describe('o estado sai de três sinais, e não de uma coluna `status`', () => {
  void it('sem encerramento e sem bloqueio, ela está aberta', () => {
    assert.equal(estadoDaConversa(ABERTA), 'open');
    assert.ok(aceitaMensagem('open'));
  });

  void it('o caso encerrado fecha a conversa, mesmo sem `closed_at` próprio', () => {
    // Critério 8: caso encerrado, conversa em modo leitura. É este caso que
    // dispensa o `lostfound` de escrever na tabela de conversa ao fechar — e
    // com isso dispensa os dois de concordarem sobre quem atualiza o quê.
    assert.equal(estadoDaConversa({ ...ABERTA, casoEncerrado: true }), 'closed');
    assert.ok(!aceitaMensagem('closed'));
  });

  void it('o bloqueio fecha para escrita, e a conversa continua legível', () => {
    assert.equal(estadoDaConversa({ ...ABERTA, bloqueadaEm: UM_INSTANTE }), 'blocked');
    assert.ok(!aceitaMensagem('blocked'));
  });

  void it('encerrada E bloqueada responde `closed`', () => {
    // A ordem não é arbitrária: o encerramento carrega a explicação que a
    // pessoa precisa ler, e o bloqueio já obteve o que existe para obter.
    assert.equal(
      estadoDaConversa({ encerradaEm: UM_INSTANTE, bloqueadaEm: UM_INSTANTE, casoEncerrado: true }),
      'closed',
    );
  });
});

void describe('o nome de exibição é o primeiro termo, nunca o sobrenome', () => {
  void it('nome inteiro vira primeiro nome', () => {
    assert.equal(primeiroNomeOuApelido('Leandro Panegassi', 'Tutor'), 'Leandro');
  });

  void it('apelido de uma palavra sobrevive inteiro', () => {
    assert.equal(primeiroNomeOuApelido('Léo', 'Tutor'), 'Léo');
  });

  void it('nome composto entrega só o primeiro termo', () => {
    // "Maria Clara Souza" com bairro na mesma tela é identificação por outro
    // caminho. O contrato promete "nunca sobrenome completo", e a promessa não
    // pode depender de o sobrenome estar no segundo campo.
    assert.equal(primeiroNomeOuApelido('Maria Clara Souza', 'Tutor'), 'Maria');
  });

  void it('vazio, espaços e nulo caem no rótulo neutro', () => {
    for (const entrada of [null, '', '   ']) {
      assert.equal(primeiroNomeOuApelido(entrada, 'Quem achou'), 'Quem achou');
    }
  });

  void it('nome absurdamente longo é cortado', () => {
    assert.equal(primeiroNomeOuApelido('A'.repeat(200), 'Tutor').length, 40);
  });
});

void describe('o participante que sai não permite deduzir nada do outro lado', () => {
  void it('cada participante tem exatamente dois campos: papel e nome', () => {
    const participantes = participantesVisiveis({
      nomeDoTutor: 'Leandro Panegassi',
      nomeDoAchador: 'Ana Paula Ribeiro',
    });
    for (const p of participantes) {
      assert.deepEqual(
        Object.keys(p).sort(),
        ['displayName', 'role'],
        `participante com campo a mais: ${JSON.stringify(p)}`,
      );
    }
  });

  void it('ISCA — o objeto inteiro não casa com telefone, e-mail, endereço nem UUID', () => {
    // A varredura é sobre o JSON inteiro, e não sobre nomes de campo
    // esperados: um campo novo chamado `contato` ou `perfil` seria aprovado por
    // uma conferência que só procurasse `phone`.
    const serializado = JSON.stringify(
      participantesVisiveis({
        nomeDoTutor: 'Leandro Panegassi',
        nomeDoAchador: 'Ana Paula Ribeiro',
      }),
    );
    assert.doesNotMatch(serializado, /\d{8,}/, `sobrou sequência de dígitos: ${serializado}`);
    assert.doesNotMatch(serializado, /@/, `sobrou arroba: ${serializado}`);
    assert.doesNotMatch(
      serializado,
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      `sobrou UUID: ${serializado}`,
    );
    assert.doesNotMatch(
      serializado,
      /Panegassi|Ribeiro/,
      `o sobrenome atravessou: ${serializado}`,
    );
  });

  void it('duas conversas do mesmo tutor não entregam nada que as ligue', () => {
    // ADR-0010, item 7: nada que permita agrupar os pets de um mesmo tutor. Se
    // o participante carregasse um id estável, duas plaquinhas escaneadas por
    // duas pessoas diferentes passariam a ser reconhecíveis como do mesmo dono.
    const uma = participantesVisiveis({ nomeDoTutor: 'Leandro P', nomeDoAchador: 'Ana' });
    const outra = participantesVisiveis({ nomeDoTutor: 'Leandro P', nomeDoAchador: 'Bruno' });
    const tutorDeUma = uma.find((p) => p.role === 'tutor');
    const tutorDeOutra = outra.find((p) => p.role === 'tutor');
    assert.deepEqual(Object.keys(tutorDeUma ?? {}).sort(), ['displayName', 'role']);
    // O primeiro nome coincide, e é o que o contrato manda mostrar. O que não
    // pode existir é um valor único por tutor ao lado dele.
    assert.deepEqual(tutorDeUma, tutorDeOutra);
  });
});
