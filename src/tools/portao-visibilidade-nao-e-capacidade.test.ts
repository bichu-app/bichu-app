import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/**
 * **O PORTAO DA SEPARACAO QUE O CLIENTE DECIDIU EM 02/11/2026.**
 *
 * Ele foi explicito sobre o perfil publico: *"nao tem relacao com permissoes
 * dentro do sistema, apenas de visibilidade"*. Sao duas coisas, e elas moram em
 * dois arquivos:
 *
 *  - **capacidade** -- o que a pessoa PODE FAZER -- em
 *    `shared/autorizacao/matriz-de-capacidades.ts`;
 *  - **visibilidade** -- o que os OUTROS VEEM dela -- em
 *    `shared/perfil-publico/perfil-publico-de-pessoa.ts`.
 *
 * **A separacao vale enquanto nao existir aresta entre os dois**, e prosa nao
 * impede `import`. Este portao impede. Ele mora em `src/tools/` e nao junto das
 * regras porque le arquivo, e `domain/` nao conhece `node:fs` -- a regra de
 * camada do ESLint reprovou a primeira versao, que estava no lugar errado.
 */
const MATRIZ = join('src', 'shared', 'autorizacao', 'matriz-de-capacidades.ts');
const VISIBILIDADE = join('src', 'shared', 'perfil-publico', 'perfil-publico-de-pessoa.ts');

/**
 * A fonte **sem a prosa** -- o mesmo critério de `portao-regua-do-canal-de-contato`.
 *
 * A medição é sobre o que o compilador lê, e não sobre o que o comentário diz: os
 * dois arquivos CITAM um ao outro por escrito, de propósito, para que quem abrir
 * um saiba da existência do outro. O que não pode existir é a aresta de verdade.
 */
function apenasCodigo(caminho: string): string {
  return readFileSync(caminho, 'utf8')
    .split('\n')
    .filter((linha) => {
      const t = linha.trim();
      return !(t.startsWith('*') || t.startsWith('/*') || t.startsWith('//'));
    })
    .join('\n');
}

void describe('visibilidade e capacidade nao se tocam (cliente, 02/11/2026)', () => {
  void it('ISCA DA ISCA: a varredura ENXERGA os dois arquivos e o que eles declaram', () => {
    assert.ok(
      apenasCodigo(MATRIZ).includes('EXIGENCIA_DE_CANAL'),
      'a varredura nao achou a matriz na propria matriz: ela nao mede nada',
    );
    assert.ok(
      apenasCodigo(VISIBILIDADE).includes('perfilPublicoLigado'),
      'a varredura nao achou a regra de visibilidade nela mesma: ela nao mede nada',
    );
    assert.ok(apenasCodigo(MATRIZ).length > 0);
  });

  void it('a regra de VISIBILIDADE nao importa a matriz de CAPACIDADES', () => {
    assert.ok(
      !apenasCodigo(VISIBILIDADE).includes('matriz-de-capacidades'),
      'a regra de VISIBILIDADE passou a importar a matriz de CAPACIDADES. O cliente separou as ' +
        'duas em 02/11/2026: perfil publico nao libera nem bloqueia nada que a pessoa faz. Se a ' +
        'decisao mudou, mude a decisao -- e nao o `import`.',
    );
  });

  void it('a matriz de CAPACIDADES nao le perfil publico', () => {
    const codigo = apenasCodigo(MATRIZ);
    for (const nome of ['publicProfile', 'public_profile', 'perfilPublico', 'perfil-publico']) {
      assert.ok(
        !codigo.includes(nome),
        `a matriz de CAPACIDADES passou a mencionar \`${nome}\`. Perfil publico e ` +
          'visibilidade, e o cliente separou as duas coisas explicitamente em 02/11/2026.',
      );
    }
  });

  void it('nenhuma `Capacidade` tem nome de visibilidade', () => {
    const codigo = apenasCodigo(MATRIZ);
    const bloco = /export type Capacidade =([\s\S]*?);/.exec(codigo);
    assert.ok(bloco !== null, 'nao achei a uniao `Capacidade`: o portao perdeu o alvo');
    const nomes = [...bloco[1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
    assert.ok(nomes.length > 0, 'a uniao `Capacidade` saiu vazia');
    for (const nome of nomes) {
      assert.ok(
        !nome.includes('perfil_publico') && !nome.includes('visivel') && !nome.includes('aparecer'),
        `a capacidade \`${nome}\` tem nome de visibilidade. O que os outros VEEM nao e uma ` +
          'coisa que a pessoa FAZ, e misturar os dois vocabularios e o primeiro passo para ' +
          'misturar as duas decisoes.',
      );
    }
  });
});
