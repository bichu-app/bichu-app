/** ISCA: conta desabilitada trava a conversa nos DOIS sentidos e perde o nome. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  aceitaMensagem,
  estadoDaConversa,
  participantesVisiveis,
  type NomesDaConversa,
  type SinaisDeEstado,
} from './conversa-mediada.js';

const ABERTA: SinaisDeEstado = {
  encerradaEm: null,
  bloqueadaEm: null,
  casoEncerrado: false,
  participanteDesabilitado: false,
};

const NOMES: NomesDaConversa = {
  nomeDoTutor: 'Leandro Panegassi',
  nomeDoAchador: 'Ana Paula Ribeiro',
  tutorDesabilitado: false,
  achadorDesabilitado: false,
  papelDoChamador: 'tutor',
  apelidoDoOutro: null,
  chaveDaFotoDoOutro: null,
};

/** A lista FECHADA de campos de um participante. */
const CHAVES_DO_PARTICIPANTE = ['displayName', 'handle', 'photoKey', 'role'];

const PASSOU_A_TRAVA =
  'a conversa aceita mensagem nova com um participante desabilitado. O cliente pediu ' +
  '"bloquear o chat para não enviar ou receber mais nenhuma nova mensagem", e sem esta ' +
  'trava a mensagem vai para alguém que não está mais na plataforma.';

void describe('a conversa de conta desabilitada fica travada nos dois sentidos', () => {
  void it('ISCA: participante desabilitado fecha a conversa, sem `closed_at` no banco', () => {
    const sinais = { ...ABERTA, participanteDesabilitado: true };
    assert.equal(estadoDaConversa(sinais), 'closed');
    assert.ok(!aceitaMensagem(estadoDaConversa(sinais)), PASSOU_A_TRAVA);
  });

  void it('`closed` e NÃO `blocked`: a tela precisa poder explicar, e ninguém bloqueou', () => {
    assert.equal(estadoDaConversa({ ...ABERTA, participanteDesabilitado: true }), 'closed');
  });

  void it('BASTA UM LADO: o sinal é `||`, e um `&&` deixaria metade dos casos abertos', () => {
    assert.equal(estadoDaConversa({ ...ABERTA, participanteDesabilitado: true }), 'closed');
    assert.equal(estadoDaConversa(ABERTA), 'open', 'conversa sem ninguém desabilitado fechou');
  });

  void it('CONTRAPESO: sem ninguém desabilitado, a conversa continua aberta', () => {
    assert.equal(estadoDaConversa(ABERTA), 'open');
    assert.ok(aceitaMensagem(estadoDaConversa(ABERTA)));
  });
});

void describe('o participante desabilitado perde o nome, e fica o rótulo neutro', () => {
  void it('ISCA: tutor desabilitado aparece como `Tutor`, e o nome real não sai', () => {
    const participantes = participantesVisiveis({ ...NOMES, tutorDesabilitado: true });
    const tutor = participantes.find((p) => p.role === 'tutor');

    assert.equal(tutor?.displayName, 'Tutor');
    assert.doesNotMatch(
      JSON.stringify(participantes),
      /Leandro/,
      'o nome do tutor desabilitado continua saindo. O cliente pediu que "o nome também ' +
        'não deve identificar" -- avatar cinza com o nome real ao lado anula o efeito.',
    );
  });

  void it('ISCA: achador desabilitado aparece como `Quem achou`, e o nome não sai', () => {
    const participantes = participantesVisiveis({ ...NOMES, achadorDesabilitado: true });
    const achador = participantes.find((p) => p.role === 'finder');

    assert.equal(achador?.displayName, 'Quem achou');
    assert.doesNotMatch(
      JSON.stringify(participantes),
      /Ana/,
      'o nome do achador desabilitado continua saindo',
    );
  });

  void it('o lado QUE FICA conserva o nome: despersonalizar os dois seria exagero', () => {
    const participantes = participantesVisiveis({ ...NOMES, tutorDesabilitado: true });
    assert.equal(participantes.find((p) => p.role === 'finder')?.displayName, 'Ana');
  });

  void it('CONTRAPESO: sem ninguém desabilitado, os dois primeiros nomes saem', () => {
    const participantes = participantesVisiveis(NOMES);
    assert.equal(participantes.find((p) => p.role === 'tutor')?.displayName, 'Leandro');
    assert.equal(participantes.find((p) => p.role === 'finder')?.displayName, 'Ana');
  });

  void it('o rótulo neutro é o que o produto JÁ usava para "sem nome", e não um novo', () => {
    const semNome = participantesVisiveis({
      nomeDoTutor: null,
      nomeDoAchador: null,
      tutorDesabilitado: false,
      achadorDesabilitado: false,
      papelDoChamador: 'tutor',
      apelidoDoOutro: null,
      chaveDaFotoDoOutro: null,
    });
    const desabilitados = participantesVisiveis({
      ...NOMES,
      tutorDesabilitado: true,
      achadorDesabilitado: true,
    });
    assert.deepEqual(desabilitados, semNome);
  });

  void it('o participante tem a LISTA FECHADA de campos: despersonalizar não acrescentou nada', () => {
    for (const p of participantesVisiveis({ ...NOMES, tutorDesabilitado: true })) {
      assert.deepEqual(Object.keys(p).sort(), CHAVES_DO_PARTICIPANTE);
    }
  });

  void it('ISCA: o lado DESABILITADO não traz foto nem apelido, mesmo sendo conexão aceita', () => {
    const saiu = participantesVisiveis({
      ...NOMES,
      achadorDesabilitado: true,
      apelidoDoOutro: null,
      chaveDaFotoDoOutro: null,
    });
    const achadorQueSaiu = saiu.find((p) => p.role === 'finder');
    assert.equal(achadorQueSaiu?.displayName, 'Quem achou', 'o lado que saiu perde o nome');
    assert.equal(achadorQueSaiu?.handle, null, 'o lado que saiu não traz apelido');
    assert.equal(achadorQueSaiu?.photoKey, null, 'o lado que saiu não traz foto');

    const ativo = participantesVisiveis({
      ...NOMES,
      apelidoDoOutro: 'ana-paula',
      chaveDaFotoDoOutro: 'thumb/ana.jpg',
    });
    const achadorAtivo = ativo.find((p) => p.role === 'finder');
    assert.equal(achadorAtivo?.handle, 'ana-paula', 'sem este contrapeso a isca passaria vazia');
    assert.equal(achadorAtivo?.photoKey, 'thumb/ana.jpg');
  });
});
