/**
 * A idempotência do webhook de entrega (BICHUS-13, critérios 7 e 9).
 *
 * O contrato promete, com estas palavras: "Idempotente por `MessageID` mais
 * tipo de evento: o provedor reenvia". Este arquivo é o que transforma a frase
 * em comportamento verificado.
 *
 * ## A isca vive dentro deste arquivo
 *
 * Idempotência é o tipo de defesa que passa despercebida quando quebra: o
 * segundo efeito acontece e o sistema continua respondendo 204 em tudo. Por
 * isso aqui não há só o teste do caminho certo — há um **dobre deliberadamente
 * quebrado** (`registroQueIgnoraConflito`), que é o que a persistência viraria
 * se alguém trocasse `ON CONFLICT DO NOTHING` por um `INSERT` simples, ou
 * colocasse um `SELECT` antes. O caso que o usa exige o efeito DUPLICADO de
 * volta. Enquanto ele reprovar com o registro de verdade e passar com o dobre
 * quebrado, sabemos que a asserção do caso de cima tem dentes.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { registrarEventoDeEntrega, type EntradaDoEvento } from './registrar-evento-de-entrega.js';
import type { EventoParaGravar, RegistroDeEntregas } from '../ports/registro-de-entregas.js';
// `new Date(...)` e proibido em `application/**`, inclusive no teste: teste que
// le o relogio da maquina falha as 23h59 do ultimo dia do mes, numa execucao que
// ninguem reproduz. `dataFixa` e a porta.
import { dataFixa } from '../../../shared/time/relogio-de-teste.js';

interface RegistroDeMentira extends RegistroDeEntregas {
  readonly gravados: EventoParaGravar[];
  readonly suprimidos: string[];
}

/**
 * O dobre HONESTO: reproduz o índice único `(message_id, record_type)` da
 * migração 20260919000001. É o comportamento do `ON CONFLICT DO NOTHING`.
 */
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
      // Espelha o `WHERE email_deliverable = true` do adaptador: conta já
      // marcada não conta como alteração nova.
      if (!vivos.has(endereco)) return Promise.resolve(false);
      vivos.delete(endereco);
      return Promise.resolve(true);
    },
  };
}

/**
 * O dobre QUEBRADO, que é a isca: aceita a mesma chave quantas vezes vierem.
 * É o que a tabela vira sem o índice único, e o que o adaptador vira sem o
 * `ON CONFLICT`.
 */
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

    // A asserção que importa: `marcarEnderecoNaoEntregavel` NÃO foi chamada de
    // novo. Conferir só o `suprimiu: false` do retorno não bastaria — ele
    // também seria `false` se a chamada tivesse acontecido e a conta já
    // estivesse marcada, que é um caminho diferente com o mesmo resultado
    // aparente.
    assert.equal(registro.suprimidos.length, 1, 'o efeito não pode acontecer duas vezes');
  });

  void it('ISCA: sem o `ON CONFLICT`, o efeito acontece DUAS vezes', async () => {
    // Este caso existe para provar que o caso acima tem dentes. Ele exige o
    // defeito de volta: com o dobre que ignora o conflito, o reenvio do provedor
    // grava outra linha e chama a supressão outra vez.
    //
    // Se este caso um dia passar a devolver 1, é porque alguma outra coisa
    // passou a segurar a idempotência — e aí a asserção do caso de cima parou
    // de verificar o que ela diz verificar.
    const registro = registroQueIgnoraConflito([TUTOR]);
    await registrarEventoDeEntrega(registro, devolucaoDefinitiva());
    await registrarEventoDeEntrega(registro, devolucaoDefinitiva());

    assert.equal(registro.gravados.length, 2, 'a isca precisa reproduzir o efeito duplicado');
    assert.equal(registro.suprimidos.length, 2, 'a isca precisa reproduzir a supressão duplicada');
  });

  void it('a MESMA mensagem com OUTRO tipo de evento é um evento novo', async () => {
    // A chave é o par, e não a mensagem sozinha. Uma mensagem entregue e depois
    // marcada como spam produz dois eventos legítimos, e unicidade só por
    // `message_id` descartaria o segundo — que é justamente o que traz a lista
    // de supressão do provedor até nós.
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
    // `Recipient` é opcional no contrato. Sem ele não há o que suprimir, e
    // escolher uma conta qualquer para marcar seria muito pior do que não agir.
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
    // O provedor manda evento de qualquer envio nosso, e nem todo destinatário
    // tem conta (convite, aviso a achador sem conta). `suprimiu: false` é o
    // valor honesto; lançar aqui faria o provedor reenviar para sempre.
    const registro = registroFiel([]);
    const resultado = await registrarEventoDeEntrega(registro, devolucaoDefinitiva());

    assert.deepEqual(resultado, { novo: true, suprimiu: false, subtipoDesconhecido: false });
  });

  void it('grava o evento ANTES de decidir, e por isso nada escapa da trilha', async () => {
    // A ordem é a idempotência inteira (ver o comentário no caso de uso).
    // Consequência observável: mesmo o evento que não suprime nada já está
    // gravado, então a reentrega dele também é reconhecida como repetida.
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
