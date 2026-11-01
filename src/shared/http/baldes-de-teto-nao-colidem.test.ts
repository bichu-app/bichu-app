import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { montarChave } from './aplicacao-de-teto.js';
import { carregarContrato } from './contract.js';
import { inicioDaJanela, janelaEmSegundos } from './rate-limit.js';
import type { RateLimitEntry } from './route-definition.js';

const CONTRATO = carregarContrato('api/openapi.yaml');

function aplicaveisDoContrato(bruto: readonly Record<string, unknown>[]): RateLimitEntry[] {
  const entradas: RateLimitEntry[] = [];
  for (const cru of bruto) {
    const counts = cru['counts'];
    if (counts !== undefined && counts !== 'requests') continue;
    if (cru['when'] !== undefined) continue;
    const base = {
      dimension: cru['dimension'] as readonly string[],
      limit: cru['limit'] as number,
      window: cru['window'] as string,
      onExceed: cru['on_exceed'] as RateLimitEntry['onExceed'],
    };
    const aplicaA = cru['applies_to'];
    entradas.push(
      aplicaA === undefined
        ? base
        : { ...base, appliesTo: aplicaA as 'invalid_attempts' },
    );
  }
  return entradas;
}

const COM_DUAS_OU_MAIS = [...CONTRATO.operacoes.values()]
  .map((operacao) => ({
    operationId: operacao.operationId,
    entradas: aplicaveisDoContrato(
      (operacao.raw['x-rate-limit'] as readonly Record<string, unknown>[] | undefined) ?? [],
    ),
  }))
  .filter(({ entradas }) => entradas.length > 1);

void describe('duas entradas na mesma dimensão são dois baldes', () => {
  for (const { operationId, entradas } of COM_DUAS_OU_MAIS) {
    void it(`${operationId}: as entradas declaradas não compartilham chave`, () => {
      const chaves = entradas.map((entrada) => montarChave(operationId, entrada, ['VALOR']));
      assert.equal(
        new Set(chaves).size,
        chaves.length,
        `duas entradas de ${operationId} montaram a mesma chave, e o contador soma as duas ali: cada requisição conta duas vezes e o teto recusa na metade — ${chaves.join(' / ')}`,
      );
    });
  }

  void it('a varredura tem o que varrer', () => {
    assert.ok(
      COM_DUAS_OU_MAIS.length >= 5,
      `o contrato deveria ter ao menos 5 operacoes com duas entradas aplicaveis, e a leitura achou ${String(COM_DUAS_OU_MAIS.length)}: a varredura parou de varrer`,
    );
  });

  void it('os inícios de `1h` e `24h` coincidem na primeira hora do dia UTC', () => {
    const naPrimeiraHora = Date.parse('2026-09-29T00:30:00Z');
    assert.equal(
      inicioDaJanela(naPrimeiraHora, janelaEmSegundos('1h')).getTime(),
      inicioDaJanela(naPrimeiraHora, janelaEmSegundos('24h')).getTime(),
    );
    const depois = Date.parse('2026-09-29T01:30:00Z');
    assert.notEqual(
      inicioDaJanela(depois, janelaEmSegundos('1h')).getTime(),
      inicioDaJanela(depois, janelaEmSegundos('24h')).getTime(),
      'fora da primeira hora os inícios precisam DIVERGIR, senão a colisão seria o dia inteiro',
    );
  });

  void it('ISCA — duas entradas idênticas são o MESMO balde', () => {
    const entrada: RateLimitEntry = {
      dimension: ['account'],
      limit: 10,
      window: '24h',
      onExceed: 'deny_429',
    };
    assert.equal(
      montarChave('algumaOperacao', entrada, ['VALOR']),
      montarChave('algumaOperacao', { ...entrada }, ['VALOR']),
    );
  });

  void it('a dimensão, o operationId e os valores continuam separando baldes', () => {
    const entrada: RateLimitEntry = {
      dimension: ['account'],
      limit: 10,
      window: '24h',
      onExceed: 'deny_429',
    };
    const base = montarChave('umaOperacao', entrada, ['VALOR']);
    assert.notEqual(base, montarChave('outraOperacao', entrada, ['VALOR']));
    assert.notEqual(base, montarChave('umaOperacao', entrada, ['OUTRO_VALOR']));
    assert.notEqual(
      base,
      montarChave('umaOperacao', { ...entrada, dimension: ['ip'] }, ['VALOR']),
    );
    assert.notEqual(
      base,
      montarChave('umaOperacao', { ...entrada, appliesTo: 'invalid_attempts' }, ['VALOR']),
    );
  });
});
