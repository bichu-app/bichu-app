/** A fiação das três bases em `src/bin/api.ts`, conferida por TEXTO. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * Lido do diretório de trabalho, que é a raiz do repositório — a mesma convenção
 * de `OPENAPI_SPEC_PATH`.
 */
const CAMINHO = 'src/bin/api.ts';

function fiacao(): string {
  try {
    return readFileSync(CAMINHO, 'utf8');
  } catch {
    throw new Error(
      `não foi possível ler ${CAMINHO} a partir de ${process.cwd()}. ` +
        'Este teste confere a fiação por texto e precisa rodar da raiz do ' +
        'repositório; um teste que não acha o arquivo precisa REPROVAR, e não ' +
        'passar por vacuidade.',
    );
  }
}

void describe('fiação das bases em src/bin/api.ts', () => {
  void it('a base da tag vem de TAG_BASE_URL, e de mais nada', () => {
    assert.match(fiacao(), /baseDaTag:\s*config\.tagBaseUrl,/);
  });

  void it('nenhuma base de página ainda recebe publicBaseUrl', () => {
    const texto = fiacao();
    assert.doesNotMatch(texto, /baseDaTag:\s*config\.publicBaseUrl/);
    assert.doesNotMatch(texto, /baseDaWeb:\s*config\.publicBaseUrl/);
  });

  void it('as duas nunca estão trocadas', () => {
    const texto = fiacao();
    assert.doesNotMatch(texto, /baseDaTag:\s*config\.webBaseUrl/);
    assert.doesNotMatch(texto, /baseDaWeb:\s*config\.tagBaseUrl/);
  });

  void it('toda base da web declarada aponta para WEB_BASE_URL', () => {
    const texto = fiacao();
    const declaracoes = texto.match(/baseDaWeb:\s*config\.\w+/g) ?? [];
    assert.ok(declaracoes.length > 0, 'nenhuma `baseDaWeb` na fiação: o texto mudou de forma');
    for (const declaracao of declaracoes) {
      assert.equal(declaracao.replace(/\s+/g, ' '), 'baseDaWeb: config.webBaseUrl');
    }
  });
});
