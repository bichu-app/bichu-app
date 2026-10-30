/** A mediação, como regra. */
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

const ABERTA = {
  encerradaEm: null,
  bloqueadaEm: null,
  casoEncerrado: false,
  participanteDesabilitado: false,
};
const UM_INSTANTE = comoData(Date.parse('2026-09-22T12:00:00.000Z') as Instant);

void describe('o estado sai de três sinais, e não de uma coluna `status`', () => {
  void it('sem encerramento e sem bloqueio, ela está aberta', () => {
    assert.equal(estadoDaConversa(ABERTA), 'open');
    assert.ok(aceitaMensagem('open'));
  });

  void it('o caso encerrado fecha a conversa, mesmo sem `closed_at` próprio', () => {
    assert.equal(estadoDaConversa({ ...ABERTA, casoEncerrado: true }), 'closed');
    assert.ok(!aceitaMensagem('closed'));
  });

  void it('o bloqueio fecha para escrita, e a conversa continua legível', () => {
    assert.equal(estadoDaConversa({ ...ABERTA, bloqueadaEm: UM_INSTANTE }), 'blocked');
    assert.ok(!aceitaMensagem('blocked'));
  });

  void it('encerrada E bloqueada responde `closed`', () => {
    assert.equal(
      estadoDaConversa({ ...ABERTA, encerradaEm: UM_INSTANTE, bloqueadaEm: UM_INSTANTE, casoEncerrado: true }),
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

/**
 * A bancada de quem **não é conexão aceita**, que é o estado normal da conversa de
 * achado: os dois campos da emenda 3 chegam nulos, como a consulta os entrega a
 * quem não tem aresta `accepted` com o outro lado.
 */
const SEM_CONEXAO = {
  nomeDoTutor: 'Leandro Panegassi',
  nomeDoAchador: 'Ana Paula Ribeiro',
  tutorDesabilitado: false,
  achadorDesabilitado: false,
  papelDoChamador: 'tutor',
  apelidoDoOutro: null,
  chaveDaFotoDoOutro: null,
} as const;

/** A lista FECHADA de campos de um participante. */
const CHAVES_DO_PARTICIPANTE = ['displayName', 'handle', 'photoKey', 'role'];

void describe('o participante que sai não permite deduzir nada do outro lado', () => {
  void it('cada participante tem exatamente QUATRO campos, e a lista é fechada', () => {
    const participantes = participantesVisiveis(SEM_CONEXAO);
    for (const p of participantes) {
      assert.deepEqual(
        Object.keys(p).sort(),
        CHAVES_DO_PARTICIPANTE,
        `participante com campo a mais: ${JSON.stringify(p)}`,
      );
    }
  });

  void it('ISCA (a) — sem conexão aceita, NEM FOTO NEM APELIDO saem, nos dois lados', () => {
    for (const p of participantesVisiveis(SEM_CONEXAO)) {
      assert.equal(p.handle, null, `apelido vazou em ${p.role}`);
      assert.equal(p.photoKey, null, `foto vazou em ${p.role}`);
    }
  });

  void it('ISCA (c) — com conexão aceita a foto sai, e SÓ no OUTRO lado', () => {
    const participantes = participantesVisiveis({
      ...SEM_CONEXAO,
      papelDoChamador: 'tutor',
      apelidoDoOutro: 'ana-paula',
      chaveDaFotoDoOutro: 'thumb/ab12.jpg',
    });
    const outro = participantes.find((p) => p.role === 'finder');
    const euMesmo = participantes.find((p) => p.role === 'tutor');
    assert.equal(outro?.handle, 'ana-paula');
    assert.equal(outro?.photoKey, 'thumb/ab12.jpg');
    assert.equal(euMesmo?.handle, null, 'o próprio lado não recebe apelido');
    assert.equal(euMesmo?.photoKey, null, 'o próprio lado não recebe foto');
  });

  void it('ISCA (c) — nos DOIS SENTIDOS do par: o achador vê a foto do tutor', () => {
    const participantes = participantesVisiveis({
      ...SEM_CONEXAO,
      papelDoChamador: 'finder',
      apelidoDoOutro: 'leandro-p',
      chaveDaFotoDoOutro: 'thumb/cd34.jpg',
    });
    const outro = participantes.find((p) => p.role === 'tutor');
    const euMesmo = participantes.find((p) => p.role === 'finder');
    assert.equal(outro?.handle, 'leandro-p');
    assert.equal(outro?.photoKey, 'thumb/cd34.jpg');
    assert.equal(euMesmo?.handle, null);
    assert.equal(euMesmo?.photoKey, null);
  });

  void it('ISCA — o objeto inteiro não casa com telefone, e-mail, endereço nem UUID', () => {
    const serializado = JSON.stringify(
      participantesVisiveis({
        ...SEM_CONEXAO,
        apelidoDoOutro: 'ana-paula',
        chaveDaFotoDoOutro: 'thumb/ab12cd.jpg',
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
    const uma = participantesVisiveis({ ...SEM_CONEXAO, nomeDoTutor: 'Leandro P', nomeDoAchador: 'Ana' });
    const outra = participantesVisiveis({ ...SEM_CONEXAO, nomeDoTutor: 'Leandro P', nomeDoAchador: 'Bruno' });
    const tutorDeUma = uma.find((p) => p.role === 'tutor');
    const tutorDeOutra = outra.find((p) => p.role === 'tutor');
    assert.deepEqual(Object.keys(tutorDeUma ?? {}).sort(), CHAVES_DO_PARTICIPANTE);
    assert.deepEqual(tutorDeUma, tutorDeOutra);
  });
});
