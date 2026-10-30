/**
 * O teto da pagina da fila, e por que ele existe DUAS vezes.
 *
 * O contrato ja recusa `limit=101` antes do handler (`AdminLimit`,
 * `maximum: 100`). Este servico repete a conta, e a repeticao e deliberada:
 * **o esquema do contrato so protege o caminho que passa por ele**. Um teste,
 * uma bancada, um caso de uso futuro que chame `listar` direto pediria a
 * tabela inteira numa consulta so, e a fila do painel viraria uma varredura.
 *
 * | mexa em `fila-de-ajuda-service.ts` | reprova |
 * |---|---|
 * | tirar o `Math.min` | `recorta o limite acima do teto` |
 * | tirar o `Math.max(1, ...)` da pagina | `pagina abaixo de 1 vira 1` |
 * | tirar o `Math.max(1, ...)` do limite | `limite zero vira 1` |
 * | tirar o `Math.trunc` | `numero quebrado e truncado` |
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DuvidasDeAjuda, PaginaDaFila } from '../ports/duvidas-de-ajuda.js';
import { criarFilaDeAjudaService } from './fila-de-ajuda-service.js';

const VAZIA: PaginaDaFila = { itens: [], total: 0 };

function bancada() {
  const pedidos: { pagina: number; limite: number }[] = [];
  const duvidas = {
    registrar: () => Promise.resolve(),
    listarAFila: (pagina: number, limite: number) => {
      pedidos.push({ pagina, limite });
      return Promise.resolve(VAZIA);
    },
  } as unknown as DuvidasDeAjuda;
  return { pedidos, servico: criarFilaDeAjudaService(duvidas) };
}

void describe('a fila de ajuda no painel', () => {
  void it('deixa passar o que esta dentro do teto', async () => {
    const { pedidos, servico } = bancada();
    await servico.listar(3, 50);
    assert.deepEqual(pedidos, [{ pagina: 3, limite: 50 }]);
  });

  void it('recorta o limite acima do teto', async () => {
    const { pedidos, servico } = bancada();
    await servico.listar(1, 5000);
    assert.equal(
      pedidos[0]?.limite,
      100,
      'REPROVA: um `limit` de 5000 chegou inteiro ao banco. O esquema do contrato so ' +
        'protege quem passa por ele; qualquer outro caminho pediria a tabela inteira ' +
        'numa consulta so.',
    );
  });

  void it('pagina abaixo de 1 vira 1', async () => {
    const { pedidos, servico } = bancada();
    await servico.listar(0, 50);
    assert.equal(
      pedidos[0]?.pagina,
      1,
      'REPROVA: pagina 0 passou. O deslocamento e `(pagina - 1) * limite`, entao a ' +
        'pagina 0 daria `offset` NEGATIVO e o Postgres recusaria a consulta -- um 500 ' +
        'por um numero que o chamador podia consertar.',
    );
  });

  void it('limite zero vira 1', async () => {
    const { pedidos, servico } = bancada();
    await servico.listar(1, 0);
    assert.equal(
      pedidos[0]?.limite,
      1,
      'REPROVA: `limit=0` passou. Uma pagina de zero linhas devolve fila vazia com ' +
        '`total` cheio, e o painel desenha "nada por aqui" sobre uma fila que tem ' +
        'trabalho esperando.',
    );
  });

  void it('numero quebrado e truncado, e nao arredondado para cima', async () => {
    const { pedidos, servico } = bancada();
    await servico.listar(2.9, 10.7);
    assert.deepEqual(
      pedidos[0],
      { pagina: 2, limite: 10 },
      'REPROVA: um numero quebrado chegou inteiro. `LIMIT 10.7` e erro de sintaxe no ' +
        'Postgres, e `OFFSET` quebrado tambem.',
    );
  });
});
