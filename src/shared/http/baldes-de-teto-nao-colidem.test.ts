/**
 * Duas entradas de teto declaradas na mesma dimensão são DOIS baldes.
 *
 * ## O defeito que este arquivo impede de voltar
 *
 * `montarChave` não levava a janela, nem o limite, nem o `on_exceed`. Duas
 * entradas declaradas na mesma dimensão montavam a MESMA chave, e o contador
 * somava as duas ali: cada requisição contava duas vezes, e o teto recusava na
 * metade do número que o contrato escreveu.
 *
 * O contrato declara **cinco** operações com duas entradas aplicáveis na mesma
 * dimensão, e as três formas do defeito aparecem entre elas:
 *
 * - janelas diferentes cujos inícios coincidem de vez em quando
 *   (`postConversationMessage`, `1h` + `24h`: a primeira hora de todo dia UTC);
 * - janelas diferentes cujos inícios coincidem raramente e por muito tempo
 *   (`createStrayFoundReport`, `24h` + `30d`: um dia a cada trinta);
 * - **a mesma janela** (`openLostCase`, `24h` + `24h`), em que nada separa os
 *   baldes e a contagem em dobro vale o dia inteiro, todo dia.
 *
 * A terceira forma é a razão de a chave carregar `limit` e `onExceed` e não só a
 * janela: uma correção que só acrescentasse a janela deixaria `openLostCase`
 * contando em dobro para sempre, e a suíte ficaria verde por cima disso.
 *
 * ## O que é varrido
 *
 * Toda operação de `api/openapi.yaml` que declare duas ou mais entradas
 * APLICÁVEIS — hoje dezessete delas, das quais cinco declaram duas na mesma
 * dimensão. A leitura sai do contrato, e não de uma cópia aqui: uma operação
 * nova que declare duas entradas colidentes reprova no dia em que for
 * declarada.
 *
 * O que este arquivo guarda é uma propriedade de `montarChave`. O caso que prova
 * que a ROTA de verdade obedece ao número dela vive em
 * `teto-da-rota-de-envio.test.ts`, com o servidor real e o relógio preso na hora
 * da colisão.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { montarChave } from './aplicacao-de-teto.js';
import { carregarContrato } from './contract.js';
import { inicioDaJanela, janelaEmSegundos } from './rate-limit.js';
import type { RateLimitEntry } from './route-definition.js';

/**
 * As entradas saem do CONTRATO, e não de uma cópia aqui.
 *
 * Uma lista copiada provaria que as cinco operações de hoje estão certas e
 * ficaria calada na sexta. É a forma do defeito original da BICHUS-178: uma
 * proteção que se acredita existir. Lendo `api/openapi.yaml`, uma operação nova
 * que declare duas entradas colidentes reprova no dia em que for declarada.
 */
const CONTRATO = carregarContrato('api/openapi.yaml');

/** O mesmo recorte de `entradasAplicaveis`: o que a borda de fato conta. */
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

  /**
   * Varredura que não varre nada APROVA por falta do que checar, e foi assim que
   * o portão anterior ficou verde por semanas. O contrato declara hoje dezessete
   * operações com duas ou mais entradas aplicáveis; o piso é conservador de
   * propósito, porque o que ele precisa pegar é a leitura quebrar e devolver
   * lista vazia, não o contrato perder uma operação.
   */
  void it('a varredura tem o que varrer', () => {
    assert.ok(
      COM_DUAS_OU_MAIS.length >= 5,
      `o contrato deveria ter ao menos 5 operacoes com duas entradas aplicaveis, e a leitura achou ${String(COM_DUAS_OU_MAIS.length)}: a varredura parou de varrer`,
    );
  });

  /**
   * A premissa do defeito, medida e não suposta.
   *
   * Se `inicioDaJanela` deixar de fazer os inícios de `1h` e `24h` coincidirem na
   * primeira hora do dia UTC, o caso preso às 00:30 em
   * `teto-da-rota-de-envio.test.ts` para de exercer o que existe para exercer, e
   * ninguém fica sabendo. Esta é a asserção que avisa.
   */
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

  /**
   * ISCA. Sem ela, os casos acima passariam numa `montarChave` que devolvesse a
   * dimensão e mais nada de distinto — bastaria o limite entrar no nome por
   * acidente. Duas entradas IDÊNTICAS são a mesma política declarada duas vezes,
   * e aí compartilhar o balde é o comportamento certo.
   */
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
