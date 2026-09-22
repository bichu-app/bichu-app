/**
 * A janela de 24 h, medida.
 *
 * Os casos de limite existem porque e neles que a regra se perde: um `>` no
 * lugar de um `>=` consuma um minuto cedo e ninguem percebe ate a primeira
 * plaquinha morrer antes da hora.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  JANELA_CANCELAVEL_EM_MS,
  JANELA_PARA_ACEITAR_EM_MS,
  conviteAindaVale,
  instanteDaConsumacao,
  instanteDoVencimentoDoConvite,
  mascararEmail,
  podeCancelar,
  podeConsumar,
  type EstadoDaTransferencia,
} from './janela-da-transferencia.js';
import type { Instant } from '../../../shared/types/brands.js';

const T0 = 1_758_000_000_000 as Instant;
const em = (ms: number): Instant => (T0 + ms) as Instant;

void describe('os dois prazos', () => {
  void it('o convite vence 72 h depois de criado', () => {
    assert.equal(JANELA_PARA_ACEITAR_EM_MS, 72 * 60 * 60 * 1000);
    assert.equal(instanteDoVencimentoDoConvite(T0), em(72 * 3_600_000));
  });

  void it('a consumacao acontece 24 h depois do aceite', () => {
    assert.equal(JANELA_CANCELAVEL_EM_MS, 24 * 60 * 60 * 1000);
    assert.equal(instanteDaConsumacao(T0), em(24 * 3_600_000));
  });
});

const pendente: EstadoDaTransferencia = {
  status: 'pending_acceptance',
  inviteExpiresAt: instanteDoVencimentoDoConvite(T0),
  effectiveAt: null,
};

const aceita: EstadoDaTransferencia = {
  status: 'accepted',
  inviteExpiresAt: instanteDoVencimentoDoConvite(T0),
  effectiveAt: instanteDaConsumacao(T0),
};

void describe('conviteAindaVale', () => {
  void it('vale um milissegundo antes das 72 h', () => {
    assert.equal(conviteAindaVale(pendente, em(72 * 3_600_000 - 1)), true);
  });

  void it('NAO vale no instante exato das 72 h', () => {
    assert.equal(conviteAindaVale(pendente, em(72 * 3_600_000)), false);
  });

  void it('nao vale para transferencia que ja saiu de pendente', () => {
    for (const status of ['accepted', 'effective', 'cancelled', 'expired'] as const) {
      assert.equal(conviteAindaVale({ ...pendente, status }, T0), false, status);
    }
  });
});

void describe('podeCancelar', () => {
  void it('pendente cancela a qualquer momento: desistir e sempre a direcao segura', () => {
    assert.equal(podeCancelar(pendente, em(71 * 3_600_000)), true);
  });

  void it('aceita cancela um milissegundo antes de consumar', () => {
    assert.equal(podeCancelar(aceita, em(24 * 3_600_000 - 1)), true);
  });

  void it('NAO cancela no instante exato da consumacao', () => {
    assert.equal(podeCancelar(aceita, em(24 * 3_600_000)), false);
  });

  void it('consumada nao cancela: o caminho passa a ser transferir de volta', () => {
    assert.equal(podeCancelar({ ...aceita, status: 'effective' }, T0), false);
  });

  void it('linha aceita com a janela ja vencida nao aceita cancelamento tardio', () => {
    // Worker parado, banco restaurado: o estado diz `accepted` e o mundo ja
    // passou do ponto. Responder 200 aqui prometeria um desfazer que o proximo
    // ciclo do worker desmentiria.
    assert.equal(podeCancelar(aceita, em(30 * 3_600_000)), false);
  });
});

void describe('podeConsumar', () => {
  void it('NAO consuma um milissegundo antes das 24 h', () => {
    assert.equal(podeConsumar(aceita, em(24 * 3_600_000 - 1)), false);
  });

  void it('consuma no instante exato das 24 h', () => {
    assert.equal(podeConsumar(aceita, em(24 * 3_600_000)), true);
  });

  void it('nao consuma o que nunca foi aceito, por mais tempo que passe', () => {
    assert.equal(podeConsumar(pendente, em(365 * 24 * 3_600_000)), false);
  });

  void it('nao consuma o que ja foi cancelado', () => {
    assert.equal(podeConsumar({ ...aceita, status: 'cancelled' }, em(48 * 3_600_000)), false);
  });

  void it('nao consuma aceita sem instante de consumacao gravado', () => {
    assert.equal(podeConsumar({ ...aceita, effectiveAt: null }, em(48 * 3_600_000)), false);
  });
});

void describe('mascararEmail', () => {
  void it('mostra duas letras e o dominio inteiro', () => {
    assert.equal(mascararEmail('marina@exemplo.com.br'), 'ma****@exemplo.com.br');
  });

  void it('o numero de asteriscos nao conta o tamanho do que foi escondido', () => {
    const curto = mascararEmail('abc@x.com');
    const longo = mascararEmail('abcdefghijklmnop@x.com');
    assert.equal(curto, 'ab****@x.com');
    assert.equal(longo, 'ab****@x.com');
  });

  void it('parte local de uma letra nao revela a letra', () => {
    assert.equal(mascararEmail('m@exemplo.com'), '******@exemplo.com');
    assert.equal(mascararEmail('m@exemplo.com').startsWith('m'), false);
  });

  void it('texto sem arroba nao vaza nada', () => {
    assert.equal(mascararEmail('sem-arroba'), '****');
  });
});
