/** A decisão "este evento derruba o endereço ou não" (BICHUS-13, critérios 7 e 9). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decidir, ehTipoDoContrato } from './evento-de-entrega.js';

void describe('decidir: o que cada evento do provedor significa', () => {
  void it('reclamação de spam suprime, e não depende de subtipo', () => {
    assert.equal(decidir({ recordType: 'SpamComplaint', tipo: undefined }), 'suprimir');
    assert.equal(decidir({ recordType: 'SpamComplaint', tipo: 'QualquerCoisa' }), 'suprimir');
  });

  void it('devolução definitiva suprime', () => {
    for (const tipo of ['HardBounce', 'BadEmailAddress', 'ManuallyDeactivated', 'Blocked']) {
      assert.equal(decidir({ recordType: 'Bounce', tipo }), 'suprimir', `${tipo} devia suprimir`);
    }
  });

  void it('devolução TRANSITÓRIA não suprime nada', () => {
    for (const tipo of ['Transient', 'SoftBounce', 'DnsError', 'SMTPApiError', 'InboundError']) {
      assert.equal(decidir({ recordType: 'Bounce', tipo }), 'registrar', `${tipo} NÃO devia suprimir`);
    }
  });

  void it('devolução com subtipo desconhecido NÃO suprime: erra para o lado seguro', () => {
    assert.equal(decidir({ recordType: 'Bounce', tipo: 'SubtipoQueNaoExiste' }), 'desconhecido');
    assert.equal(decidir({ recordType: 'Bounce', tipo: undefined }), 'desconhecido');
    assert.equal(decidir({ recordType: 'Bounce', tipo: '' }), 'desconhecido');
  });

  void it('entrega, abertura e mudança de inscrição nunca suprimem', () => {
    assert.equal(decidir({ recordType: 'Delivery', tipo: undefined }), 'registrar');
    assert.equal(decidir({ recordType: 'Open', tipo: undefined }), 'registrar');
    assert.equal(decidir({ recordType: 'SubscriptionChange', tipo: undefined }), 'registrar');

    assert.equal(decidir({ recordType: 'Delivery', tipo: 'HardBounce' }), 'registrar');
    assert.equal(decidir({ recordType: 'Open', tipo: 'HardBounce' }), 'registrar');
  });
});

void describe('ehTipoDoContrato: a união fechada do `enum` da especificação', () => {
  void it('aceita exatamente os cinco do contrato', () => {
    for (const tipo of ['Delivery', 'Bounce', 'SpamComplaint', 'Open', 'SubscriptionChange']) {
      assert.equal(ehTipoDoContrato(tipo), true, `${tipo} está no contrato`);
    }
  });

  void it('recusa o que não está no contrato, incluindo caixa trocada', () => {
    for (const tipo of ['bounce', 'BOUNCE', 'Delivered', '', 'Bounce ']) {
      assert.equal(ehTipoDoContrato(tipo), false, `${tipo} NÃO está no contrato`);
    }
    for (const tipo of [undefined, null, 42, {}, ['Bounce']]) {
      assert.equal(ehTipoDoContrato(tipo), false);
    }
  });
});
