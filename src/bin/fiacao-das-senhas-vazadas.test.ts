/**
 * A fiacao da base de senhas vazadas do login do painel em `src/bin/api.ts`,
 * conferida por TEXTO, pelo mesmo motivo de `fiacao-das-bases.test.ts`: nada de
 * `api.ts` e carregado por teste, e a fiacao e o arquivo.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const CAMINHO = 'src/bin/api.ts';

void describe('fiacao da base de senhas vazadas no login do painel', () => {
  void it('usa a mesma base por faixa do conta-admin, e nao a dubla indisponivel', () => {
    const texto = readFileSync(CAMINHO, 'utf8');
    assert.match(texto, /senhasVazadas:\s*criarListaDeSenhasVazadasPorFaixa\(\)/, 'o login do painel nao usa a base real');
    assert.doesNotMatch(texto, /listaDeSenhasVazadasIndisponivel/, 'a dubla indisponivel voltou para a composicao');
  });
});
