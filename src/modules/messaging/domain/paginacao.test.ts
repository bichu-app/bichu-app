/**
 * O cursor, e o teto de `limit` que o servidor impõe.
 *
 * Coleção sem paginação é incidente esperando a base crescer, e cursor que
 * vira `NaN` é o mesmo incidente com a página inteira na resposta.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { comoData } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';
import {
  codificarCursor,
  decodificarCursor,
  limiteEfetivo,
  LIMITE_MAXIMO,
  LIMITE_PADRAO,
} from './paginacao.js';

const QUANDO = comoData(Date.parse('2026-09-22T18:30:00.123Z') as Instant);
const ID = '018f3a2b-0000-7000-8000-0000000000aa';

void describe('o cursor volta exatamente como foi', () => {
  void it('instante e id sobrevivem à ida e à volta, com milissegundo', () => {
    const volta = decodificarCursor(codificarCursor({ criadaEm: QUANDO, id: ID }));
    assert.equal(volta?.criadaEm.toISOString(), QUANDO.toISOString());
    assert.equal(volta?.id, ID);
  });
});

void describe('cursor ilegível é tratado como ausente, nunca como zero', () => {
  void it('texto qualquer, vazio e indefinido devolvem `undefined`', () => {
    for (const entrada of [undefined, '', 'nao-e-base64url!!', Buffer.from('sem-separador').toString('base64url')]) {
      assert.equal(decodificarCursor(entrada), undefined, `aceitou ${String(entrada)}`);
    }
  });

  void it('data inválida não vira `NaN` e não vira início da lista', () => {
    // Este é o caso caro: um `new Date('xyz')` comparado no `WHERE` devolve
    // linha nenhuma, ou, dependendo do driver, a tabela inteira.
    const torto = Buffer.from(`nao-e-data|${ID}`, 'utf8').toString('base64url');
    assert.equal(decodificarCursor(torto), undefined);
  });

  void it('id vazio é recusado', () => {
    const semId = Buffer.from(`${QUANDO.toISOString()}|`, 'utf8').toString('base64url');
    assert.equal(decodificarCursor(semId), undefined);
  });
});

void describe('o teto de `limit` é do servidor, não do cliente', () => {
  void it('ausente vira o padrão do contrato', () => {
    assert.equal(limiteEfetivo(undefined), LIMITE_PADRAO);
  });

  void it('pedido acima do teto é preso no teto', () => {
    assert.equal(limiteEfetivo(1000), LIMITE_MAXIMO);
    assert.equal(limiteEfetivo(Number.POSITIVE_INFINITY), LIMITE_PADRAO);
  });

  void it('zero e negativo viram um', () => {
    assert.equal(limiteEfetivo(0), 1);
    assert.equal(limiteEfetivo(-5), 1);
  });
});
