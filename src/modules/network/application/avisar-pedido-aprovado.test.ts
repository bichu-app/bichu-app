/**
 * O trabalho do push de pedido aprovado: pedido que sumiu ou deixou de estar
 * aprovado nao e falha e nao entrega nada; o aprovado entrega so o titulo.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { avisarPedidoAprovado } from './avisar-pedido-aprovado.js';
import { TRABALHO_DE_AVISO_DE_APROVACAO } from '../ports/aviso-de-aprovacao.js';

void describe('avisarPedidoAprovado', () => {
  void it('pedido que nao esta mais aprovado nao entrega nada', async () => {
    const entregues: string[] = [];
    const desfecho = await avisarPedidoAprovado(
      {
        pedidos: { pedidoAprovado: () => Promise.resolve(null) },
        entrega: {
          avisar: (u) => {
            entregues.push(u);
            return Promise.resolve({ aceitos: 1, falhos: 0, semAparelho: false });
          },
        },
      },
      'pedido-1',
    );
    assert.deepEqual(desfecho, { tipo: 'sem_pedido' });
    assert.deepEqual(entregues, []);
  });

  void it('o aprovado entrega a conta dele, com o titulo do encontro e nada mais', async () => {
    const entregues: [string, string][] = [];
    const desfecho = await avisarPedidoAprovado(
      {
        pedidos: { pedidoAprovado: () => Promise.resolve({ userId: 'conta-1', tituloDoEncontro: 'Encontro de galgos' }) },
        entrega: {
          avisar: (u, t) => {
            entregues.push([u, t]);
            return Promise.resolve({ aceitos: 2, falhos: 0, semAparelho: false });
          },
        },
      },
      'pedido-1',
    );
    assert.deepEqual(entregues, [['conta-1', 'Encontro de galgos']]);
    assert.deepEqual(desfecho, { tipo: 'avisado', aceitos: 2, falhos: 0, semAparelho: false });
    assert.equal(TRABALHO_DE_AVISO_DE_APROVACAO, 'network.join_request_approved');
  });
});
