import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { registrarEventoDeEntrega, type EntradaDoEvento } from './registrar-evento-de-entrega.js';
import type { EventoParaGravar, RegistroDeEntregas } from '../ports/registro-de-entregas.js';
import { dataFixa } from '../../../shared/time/relogio-de-teste.js';

interface RegistroDeMentira extends RegistroDeEntregas {
  readonly gravados: EventoParaGravar[];
  readonly suprimidos: string[];
}

function registroFiel(enderecosConhecidos: readonly string[] = []): RegistroDeMentira {
  const vistos = new Set<string>();
  const gravados: EventoParaGravar[] = [];
  const suprimidos: string[] = [];
  const vivos = new Set(enderecosConhecidos);

  return {
    gravados,
    suprimidos,
    registrar(evento) {
      const chave = JSON.stringify([evento.messageId, evento.recordType]);
      if (vistos.has(chave)) return Promise.resolve(false);
      vistos.add(chave);
      gravados.push(evento);
      return Promise.resolve(true);
    },
    marcarEnderecoNaoEntregavel(endereco) {
      suprimidos.push(endereco);
      if (!vivos.has(endereco)) return Promise.resolve(false);
      vivos.delete(endereco);
      return Promise.resolve(true);
    },
  };
}

function registroQueIgnoraConflito(enderecos: readonly string[] = []): RegistroDeMentira {
  const fiel = registroFiel(enderecos);
  return {
    gravados: fiel.gravados,
    suprimidos: fiel.suprimidos,
    registrar: (evento) => {
      fiel.gravados.push(evento);
      return Promise.resolve(true);
    },
    marcarEnderecoNaoEntregavel: (endereco) => fiel.marcarEnderecoNaoEntregavel(endereco),
  };
}

const TUTOR = 'tutor@exemplo.invalid';

function devolucaoDefinitiva(): EntradaDoEvento {
  return {
    messageId: 'mensagem-1',
    recordType: 'Bounce',
    tipo: 'HardBounce',
    descricao: 'A caixa nao existe',
    ocorridoEm: dataFixa(),
    destinatario: TUTOR,
  };
}

void describe('registrarEventoDeEntrega: o provedor reenvia e o efeito não dobra', () => {
  void it('primeira entrega registra o evento e suprime o endereço', async () => {
    const registro = registroFiel([TUTOR]);
    const resultado = await registrarEventoDeEntrega(registro, devolucaoDefinitiva());

    assert.deepEqual(resultado, { novo: true, suprimiu: true, subtipoDesconhecido: false });
    assert.equal(registro.gravados.length, 1);
    assert.deepEqual(registro.suprimidos, [TUTOR]);
  });

  void it('REENVIO do mesmo evento não produz segundo efeito', async () => {
    const registro = registroFiel([TUTOR]);
    await registrarEventoDeEntrega(registro, devolucaoDefinitiva());
    const segunda = await registrarEventoDeEntrega(registro, devolucaoDefinitiva());

    assert.deepEqual(segunda, { novo: false, suprimiu: false, subtipoDesconhecido: false });
    assert.equal(registro.gravados.length, 1, 'o evento repetido não pode gravar segunda linha');

    assert.equal(registro.suprimidos.length, 1, 'o efeito não pode acontecer duas vezes');
  });

  void it('ISCA: sem o `ON CONFLICT`, o efeito acontece DUAS vezes', async () => {
    const registro = registroQueIgnoraConflito([TUTOR]);
    await registrarEventoDeEntrega(registro, devolucaoDefinitiva());
    await registrarEventoDeEntrega(registro, devolucaoDefinitiva());

    assert.equal(registro.gravados.length, 2, 'a isca precisa reproduzir o efeito duplicado');
    assert.equal(registro.suprimidos.length, 2, 'a isca precisa reproduzir a supressão duplicada');
  });

  void it('a MESMA mensagem com OUTRO tipo de evento é um evento novo', async () => {
    const registro = registroFiel([TUTOR]);
    await registrarEventoDeEntrega(registro, {
      ...devolucaoDefinitiva(),
      recordType: 'Delivery',
      tipo: undefined,
    });
    const spam = await registrarEventoDeEntrega(registro, {
      ...devolucaoDefinitiva(),
      recordType: 'SpamComplaint',
      tipo: undefined,
    });

    assert.equal(spam.novo, true, 'entrega e reclamação de spam são eventos distintos');
    assert.equal(spam.suprimiu, true);
    assert.equal(registro.gravados.length, 2);
  });
});

void describe('registrarEventoDeEntrega: o que NÃO suprime', () => {
  void it('devolução transitória grava e não toca no endereço', async () => {
    const registro = registroFiel([TUTOR]);
    const resultado = await registrarEventoDeEntrega(registro, {
      ...devolucaoDefinitiva(),
      tipo: 'Transient',
    });

    assert.deepEqual(resultado, { novo: true, suprimiu: false, subtipoDesconhecido: false });
    assert.equal(registro.gravados.length, 1, 'o evento continua na trilha');
    assert.deepEqual(registro.suprimidos, [], 'caixa cheia não desliga o e-mail de ninguém');
  });

  void it('subtipo desconhecido grava, não suprime, e pede olho humano', async () => {
    const registro = registroFiel([TUTOR]);
    const resultado = await registrarEventoDeEntrega(registro, {
      ...devolucaoDefinitiva(),
      tipo: 'SubtipoInventado',
    });

    assert.deepEqual(resultado, { novo: true, suprimiu: false, subtipoDesconhecido: true });
    assert.deepEqual(registro.suprimidos, []);
  });

  void it('evento definitivo SEM destinatário grava e não inventa alvo', async () => {
    const registro = registroFiel([TUTOR]);
    const resultado = await registrarEventoDeEntrega(registro, {
      ...devolucaoDefinitiva(),
      destinatario: undefined,
    });

    assert.deepEqual(resultado, { novo: true, suprimiu: false, subtipoDesconhecido: false });
    assert.equal(registro.gravados.length, 1, 'o rastro do evento continua existindo');
    assert.deepEqual(registro.suprimidos, []);
  });

  void it('endereço que não é de nenhuma conta não é erro', async () => {
    const registro = registroFiel([]);
    const resultado = await registrarEventoDeEntrega(registro, devolucaoDefinitiva());

    assert.deepEqual(resultado, { novo: true, suprimiu: false, subtipoDesconhecido: false });
  });

  void it('grava o evento ANTES de decidir, e por isso nada escapa da trilha', async () => {
    const registro = registroFiel([TUTOR]);
    await registrarEventoDeEntrega(registro, { ...devolucaoDefinitiva(), tipo: 'Transient' });
    const repetido = await registrarEventoDeEntrega(registro, {
      ...devolucaoDefinitiva(),
      tipo: 'Transient',
    });

    assert.equal(repetido.novo, false);
    assert.equal(registro.gravados.length, 1);
  });
});
