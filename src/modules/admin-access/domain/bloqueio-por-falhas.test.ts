import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Instant } from '../../../shared/types/brands.js';
import {
  FALHAS_QUE_BLOQUEIAM,
  JANELA_DAS_FALHAS_EM_MS,
  atingiuOBloqueio,
  inicioDaJanela,
} from './bloqueio-por-falhas.js';

void describe('bloqueio da conta do painel por falhas de login (D44)', () => {
  void it('o numero e o do contrato: 10 falhas em 24 horas', () => {
    assert.equal(FALHAS_QUE_BLOQUEIAM, 10);
    assert.equal(JANELA_DAS_FALHAS_EM_MS, 86_400_000);
  });

  void it('a decima falha bloqueia; a nona nao', () => {
    assert.equal(atingiuOBloqueio(8), false, 'a nona falha bloqueou');
    assert.equal(atingiuOBloqueio(9), true, 'a decima falha nao bloqueou');
    assert.equal(atingiuOBloqueio(15), true);
  });

  void it('ISCA: sem falha anterior, a primeira nunca bloqueia', () => {
    assert.equal(atingiuOBloqueio(0), false);
  });

  void it('contagem negativa ou fracionaria e defeito de quem conta, e lanca', () => {
    assert.throws(() => atingiuOBloqueio(-1), RangeError);
    assert.throws(() => atingiuOBloqueio(1.5), RangeError);
  });

  void it('a janela comeca 24 horas antes da tentativa', () => {
    const agora = Date.UTC(2026, 8, 28, 12, 0, 0) as Instant;
    assert.equal(inicioDaJanela(agora).toISOString(), '2026-09-27T12:00:00.000Z');
  });
});
