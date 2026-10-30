/** REL-002: a anotação da janela de emissão não pode voltar a mentir. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { construtorDaJanelaDeEmissao } from './kysely-tag-repository.js';

/** O tipo da coluna `mais_antiga` como o construtor a declara hoje. */
type MaisAntiga = Awaited<
  ReturnType<ReturnType<typeof construtorDaJanelaDeEmissao>['executeTakeFirstOrThrow']>
>['mais_antiga'];

/** `true` só quando `null` cabe no tipo. */
type NullCabeEmMaisAntiga = null extends MaisAntiga ? true : false;

const A_ANOTACAO_ADMITE_NULO: NullCabeEmMaisAntiga = true;

void describe('REL-002 — a anotação da janela de emissão admite o nulo que o SQL devolve', () => {
  void it('`mais_antiga` é anulável no tipo, porque `MIN()` sobre zero linhas é NULL', () => {
    assert.equal(
      A_ANOTACAO_ADMITE_NULO,
      true,
      'REL-002: `fn.min<...>` da janela de emissão voltou a prometer não-nulo o que o ' +
        'banco pode devolver nulo. A guarda de `emitir` volta a ser "comparação sempre ' +
        'falsa" para a análise estática, e apagá-la faria o `Retry-After` do 429 sair 1s',
    );
  });
});
