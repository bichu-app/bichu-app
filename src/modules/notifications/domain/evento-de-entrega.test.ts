/**
 * A decisão "este evento derruba o endereço ou não" (BICHUS-13, critérios 7 e 9).
 *
 * Cada caso aqui é uma conta que perde, ou não perde, a capacidade de receber
 * aviso de pet encontrado. É por isso que a tabela é exaustiva sobre os cinco
 * `RecordType` do contrato em vez de exercitar só os dois interessantes: o
 * `Delivery` que suprimisse por engano não seria pego por nenhum outro teste
 * deste repositório, e o sintoma dele é um tutor que simplesmente para de
 * receber e-mail.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decidir, ehTipoDoContrato } from './evento-de-entrega.js';

void describe('decidir: o que cada evento do provedor significa', () => {
  void it('reclamação de spam suprime, e não depende de subtipo', () => {
    // O contrato é explícito sobre por que este é o evento mais importante dos
    // cinco: "e por este caminho que a lista de supressao do provedor chega ate
    // nos... sem ler o evento todo envio seguinte falha em silencio para
    // sempre". Quem marcou como spam já está suprimido DO LADO DO PROVEDOR; não
    // acompanhar aqui só nos deixa cegos para isso.
    assert.equal(decidir({ recordType: 'SpamComplaint', tipo: undefined }), 'suprimir');
    assert.equal(decidir({ recordType: 'SpamComplaint', tipo: 'QualquerCoisa' }), 'suprimir');
  });

  void it('devolução definitiva suprime', () => {
    for (const tipo of ['HardBounce', 'BadEmailAddress', 'ManuallyDeactivated', 'Blocked']) {
      assert.equal(decidir({ recordType: 'Bounce', tipo }), 'suprimir', `${tipo} devia suprimir`);
    }
  });

  void it('devolução TRANSITÓRIA não suprime nada', () => {
    // Caixa cheia e indisponibilidade momentânea não são endereço ruim. Suprimir
    // aqui desligaria o e-mail de um tutor por causa de um problema que se
    // resolve sozinho — e nada na tela dele explicaria o que houve.
    for (const tipo of ['Transient', 'SoftBounce', 'DnsError', 'SMTPApiError', 'InboundError']) {
      assert.equal(decidir({ recordType: 'Bounce', tipo }), 'registrar', `${tipo} NÃO devia suprimir`);
    }
  });

  void it('devolução com subtipo desconhecido NÃO suprime: erra para o lado seguro', () => {
    // Esta é a assimetria do topo de `evento-de-entrega.ts`, virada em teste.
    // Suprimir no escuro quebra o invariante nº 1 do contrato ("nenhum aviso ao
    // tutor e descartado") por decisão nossa; não suprimir no escuro custa
    // reputação de domínio, que é visível no painel do provedor e reversível.
    assert.equal(decidir({ recordType: 'Bounce', tipo: 'SubtipoQueNaoExiste' }), 'desconhecido');
    assert.equal(decidir({ recordType: 'Bounce', tipo: undefined }), 'desconhecido');
    assert.equal(decidir({ recordType: 'Bounce', tipo: '' }), 'desconhecido');
  });

  void it('entrega, abertura e mudança de inscrição nunca suprimem', () => {
    assert.equal(decidir({ recordType: 'Delivery', tipo: undefined }), 'registrar');
    assert.equal(decidir({ recordType: 'Open', tipo: undefined }), 'registrar');
    assert.equal(decidir({ recordType: 'SubscriptionChange', tipo: undefined }), 'registrar');

    // E continuam não suprimindo mesmo com um `Type` colado no corpo: o campo é
    // opcional no contrato e o provedor pode preenchê-lo em evento que não é
    // devolução. Ler `Type` sem olhar `RecordType` faria um `Delivery` com
    // `Type: HardBounce` suprimir — e esse corpo é trivial de forjar para quem
    // tiver o segredo do cabeçalho.
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
    // `bounce` minúsculo iria para a coluna e o CHECK de
    // `notification_deliveries` recusaria, o que vira 500 — e 500 é lido pelo
    // provedor como "reenvie". O erro precisa parar antes do banco.
    for (const tipo of ['bounce', 'BOUNCE', 'Delivered', '', 'Bounce ']) {
      assert.equal(ehTipoDoContrato(tipo), false, `${tipo} NÃO está no contrato`);
    }
    for (const tipo of [undefined, null, 42, {}, ['Bounce']]) {
      assert.equal(ehTipoDoContrato(tipo), false);
    }
  });
});
