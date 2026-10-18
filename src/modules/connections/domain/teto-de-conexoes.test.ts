/**
 * **ISCA (c): o teto de 150 recusa o 151º, e o CONTRAPESO é o 150º passar.**
 *
 * As duas metades juntas, porque um teto só testado pelo lado que recusa pode
 * estar recusando tudo — e um teto só testado pelo lado que passa pode não
 * existir. Os outros dois tetos (20 pendentes, 10 por dia) ganham o mesmo par.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  TETO_DE_CONEXOES,
  TETO_DE_PEDIDOS_POR_DIA,
  TETO_DE_PENDENTES_ENVIADOS,
  pedidosQueAindaCabemHoje,
  recusaDoAceite,
  recusaDoPedido,
  type ContagensDaConta,
} from './teto-de-conexoes.js';

function contagens(parcial: Partial<ContagensDaConta> = {}): ContagensDaConta {
  return { conexoes: 0, pendentesEnviados: 0, pedidosNasUltimas24h: 0, ...parcial };
}

void describe('os números são os que o cliente confirma, e estão num lugar só', () => {
  void it('150 conexões, 20 pendentes enviados, 10 pedidos por dia', () => {
    assert.equal(TETO_DE_CONEXOES, 150);
    assert.equal(TETO_DE_PENDENTES_ENVIADOS, 20);
    assert.equal(TETO_DE_PEDIDOS_POR_DIA, 10);
  });
});

void describe('o teto de 150 conexões', () => {
  void it('CONTRAPESO: com 149 conexões, o 150º pedido passa', () => {
    assert.equal(recusaDoPedido(contagens({ conexoes: 149 }), { conexoes: 0 }), undefined);
  });

  void it('ISCA: com 150 conexões, o 151º é recusado', () => {
    assert.equal(
      recusaDoPedido(contagens({ conexoes: 150 }), { conexoes: 0 }),
      'connection_limit_reached',
    );
  });

  void it('vale para o OUTRO lado também: quem está cheio não recebe pedido', () => {
    assert.equal(
      recusaDoPedido(contagens(), { conexoes: 150 }),
      'addressee_connection_limit_reached',
    );
    assert.equal(recusaDoPedido(contagens(), { conexoes: 149 }), undefined);
  });

  void it('o teto do PRÓPRIO lado é anunciado primeiro quando os dois estão cheios', () => {
    // "Você já tem 150 conexões" é acionável; "a outra pessoa está cheia" não é.
    // E anunciar o teto do outro primeiro contaria sobre a outra conta algo que
    // não precisava ser contado.
    assert.equal(
      recusaDoPedido(contagens({ conexoes: 150 }), { conexoes: 150 }),
      'connection_limit_reached',
    );
  });

  void it('o ACEITE é cobrado nos dois lados, com o mesmo par isca/contrapeso', () => {
    assert.equal(recusaDoAceite({ conexoes: 149 }, { conexoes: 149 }), undefined);
    assert.equal(recusaDoAceite({ conexoes: 150 }, { conexoes: 0 }), 'connection_limit_reached');
    assert.equal(
      recusaDoAceite({ conexoes: 0 }, { conexoes: 150 }),
      'addressee_connection_limit_reached',
    );
  });
});

void describe('o teto de 20 pendentes enviados', () => {
  void it('CONTRAPESO: com 19 pendentes, o 20º passa', () => {
    assert.equal(recusaDoPedido(contagens({ pendentesEnviados: 19 }), { conexoes: 0 }), undefined);
  });

  void it('ISCA: com 20 pendentes, o 21º é recusado', () => {
    assert.equal(
      recusaDoPedido(contagens({ pendentesEnviados: 20 }), { conexoes: 0 }),
      'pending_limit_reached',
    );
  });
});

void describe('o teto de 10 pedidos por dia', () => {
  void it('CONTRAPESO: com 9 pedidos nas últimas 24 h, o 10º passa', () => {
    assert.equal(recusaDoPedido(contagens({ pedidosNasUltimas24h: 9 }), { conexoes: 0 }), undefined);
  });

  void it('ISCA: com 10 pedidos nas últimas 24 h, o 11º é recusado', () => {
    assert.equal(
      recusaDoPedido(contagens({ pedidosNasUltimas24h: 10 }), { conexoes: 0 }),
      'daily_limit_reached',
    );
  });

  void it('o saldo do dia nunca é negativo, nem com a contagem acima do teto', () => {
    assert.equal(pedidosQueAindaCabemHoje(contagens({ pedidosNasUltimas24h: 0 })), 10);
    assert.equal(pedidosQueAindaCabemHoje(contagens({ pedidosNasUltimas24h: 10 })), 0);
    assert.equal(pedidosQueAindaCabemHoje(contagens({ pedidosNasUltimas24h: 99 })), 0);
  });
});

void describe('a ordem de avaliação não esconde um teto atrás do outro', () => {
  void it('o pendente é anunciado antes do diário, e o diário existe sozinho', () => {
    assert.equal(
      recusaDoPedido(contagens({ pendentesEnviados: 20, pedidosNasUltimas24h: 10 }), {
        conexoes: 0,
      }),
      'pending_limit_reached',
    );
    assert.equal(
      recusaDoPedido(contagens({ pendentesEnviados: 0, pedidosNasUltimas24h: 10 }), { conexoes: 0 }),
      'daily_limit_reached',
    );
  });

  void it('conta vazia passa — a conferência não recusa por princípio', () => {
    assert.equal(recusaDoPedido(contagens(), { conexoes: 0 }), undefined);
  });
});
