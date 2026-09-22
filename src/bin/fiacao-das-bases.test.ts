/**
 * A fiação das três bases em `src/bin/api.ts`, conferida por TEXTO.
 *
 * Por que por texto, que é feio: **nada de `src/bin/api.ts` é carregado por
 * teste.** O `main()` abre porta, banco e SMTP, e o repositório já pagou por
 * isso uma vez — o aviso de reuso ao titular ficou em 0% de cobertura enquanto
 * morou lá dentro (BICHUS-129). A montagem pode sair do arquivo; a fiação, não:
 * ela é o arquivo. Então ou se confere o texto, ou não se confere.
 *
 * O que esta guarda protege é a única linha do sistema que vira plástico. Até
 * 19/09, `baseDaTag` e `baseDaWeb` recebiam a MESMA variável (`PUBLIC_BASE_URL`),
 * e por isso trocar uma pela outra não mudava nada e não deixava rastro. Com os
 * hosts separados — `TAG_BASE_URL` na plaquinha, `WEB_BASE_URL` nas páginas do
 * time web —, a troca passa a mandar o estranho que leu o QR para um host que
 * não serve aquela página. E o que o QR codifica não se corrige depois que a
 * plaquinha é prensada (ADR-0004): não há migração, não há redirecionamento,
 * não há aviso. Há um adesivo na coleira de um animal apontando para lugar
 * nenhum.
 *
 * Isca: troque `config.tagBaseUrl` por `config.publicBaseUrl` (ou por
 * `config.webBaseUrl`) na fiação do serviço de tags e este arquivo reprova.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * Lido do diretório de trabalho, que é a raiz do repositório — a mesma
 * convenção de `OPENAPI_SPEC_PATH`. Se um dia deixar de ser, a mensagem abaixo
 * diz isso em voz alta, em vez de o teste passar sobre um arquivo vazio.
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
    // `publicBaseUrl` continua existindo e continua certo onde está (o `type`
    // do problem+json, o endereço que a borda atende). O que ele não pode mais
    // ser é a base de uma página: esse era o acúmulo de papéis que o ADR-0017
    // item 2 desfez.
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
    // Três hoje: e-mail de identidade, conversa do achador e cartaz do caso.
    // A conferência é sobre TODAS, e não sobre um número — uma quarta nascendo
    // errada precisa reprovar sem ninguém lembrar de atualizar este teste.
    assert.ok(declaracoes.length > 0, 'nenhuma `baseDaWeb` na fiação: o texto mudou de forma');
    for (const declaracao of declaracoes) {
      assert.equal(declaracao.replace(/\s+/g, ' '), 'baseDaWeb: config.webBaseUrl');
    }
  });
});
