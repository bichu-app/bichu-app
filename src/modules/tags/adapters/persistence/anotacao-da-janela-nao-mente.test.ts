/**
 * REL-002: a anotação da janela de emissão não pode voltar a mentir.
 *
 * ## O achado, e por que ele não era onde a ferramenta apontou
 *
 * O SonarCloud acusou `S3403 — comparação sempre falsa` na guarda
 * `maisAntiga === null || maisAntiga === undefined`, dentro de `emitir`. A
 * acusação está certa **contra o tipo declarado** e errada contra o banco:
 * `fn.min<Date>('created_at')` promete `Date` não-anulável, e `MIN()` sobre
 * zero linhas devolve `NULL` em SQL. Quem mentia era a anotação.
 *
 * A correção foi trocar a anotação para `Date | null` e **manter a guarda**.
 * Aceitar a sugestão da ferramenta — apagar a comparação — deixaria
 * `new Date(null).getTime()` valer época zero e o `Retry-After` do 429 sair
 * como 1 segundo no dia em que a consulta mudasse de forma.
 *
 * ## Por que este arquivo existe
 *
 * Porque desfazer a correção **não acusa em lugar nenhum**, e isso foi medido,
 * não suposto: com `fn.min<Date>` de volta, `npx tsc --noEmit` sai **0**.
 * TypeScript não reclama de `x === null` sobre um tipo não-anulável; ele apenas
 * estreita para `never`. O único portão que via o problema era o SonarCloud, e
 * ele está dispensado.
 *
 * Então a prova precisa ser de TIPO, e em tempo de compilação: o caso abaixo
 * não roda nada de útil: **ele reprova no `tsc`**, antes de existir teste para
 * executar. Prova negativa que vive numa frase evapora.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { construtorDaJanelaDeEmissao } from './kysely-tag-repository.js';

/** O tipo da coluna `mais_antiga` como o construtor a declara hoje. */
type MaisAntiga = Awaited<
  ReturnType<ReturnType<typeof construtorDaJanelaDeEmissao>['executeTakeFirstOrThrow']>
>['mais_antiga'];

/**
 * `true` só quando `null` cabe no tipo.
 *
 * Se alguém devolver `fn.min<Date>` ao construtor, `null extends Date` vira
 * `false`, e a linha seguinte deixa de compilar com
 * "Type 'true' is not assignable to type 'false'". É esse erro de compilação
 * que é a isca — não o `assert` do caso.
 */
type NullCabeEmMaisAntiga = null extends MaisAntiga ? true : false;

const A_ANOTACAO_ADMITE_NULO: NullCabeEmMaisAntiga = true;

void describe('REL-002 — a anotação da janela de emissão admite o nulo que o SQL devolve', () => {
  void it('`mais_antiga` é anulável no tipo, porque `MIN()` sobre zero linhas é NULL', () => {
    // O valor deste `assert` é secundário: quem reprova é o `tsc`, na
    // declaração acima. O caso existe para que a reprovação tenha um nome no
    // relatório quando alguém rodar a suíte, e para que o arquivo não pareça
    // morto para quem o abrir.
    assert.equal(
      A_ANOTACAO_ADMITE_NULO,
      true,
      'REL-002: `fn.min<...>` da janela de emissão voltou a prometer não-nulo o que o ' +
        'banco pode devolver nulo. A guarda de `emitir` volta a ser "comparação sempre ' +
        'falsa" para a análise estática, e apagá-la faria o `Retry-After` do 429 sair 1s',
    );
  });
});
