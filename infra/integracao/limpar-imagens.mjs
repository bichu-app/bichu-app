#!/usr/bin/env node
/* global console, process */
// A diretiva acima segue a convencao de infra/verificacao/*.mjs: o ESLint deste
// repositorio nao declara os globais de Node para `**/*.mjs` fora de `src/`.
/**
 * `npm run limpar:imagens-de-integracao` -- as imagens de pilha ORFA.
 *
 * ===========================================================================
 * O QUE ISTO LIMPA, E O QUE NAO
 * ===========================================================================
 * Desde que a tag da pilha efemera passou a ser por worktree, `rodar.mjs`
 * apaga as duas imagens dele ao derrubar a pilha. O caminho comum ja nao
 * acumula nada, e nao e dele que este comando trata.
 *
 * Sobram dois casos que aquele apagar nao alcanca:
 *
 * 1. A execucao morreu de forma que `derrubar()` nao rodou (`kill -9`, sessao
 *    encerrada, maquina reiniciada).
 * 2. O worktree foi removido depois de rodar a suite. A imagem fica com a tag
 *    de um caminho que nao existe mais, e ninguem volta para apaga-la.
 *
 * ===========================================================================
 * A REGRA, E POR QUE ELA E ESTREITA DE PROPOSITO
 * ===========================================================================
 * Apaga `bichu-app:int-<sufixo>` e `bichu-migrador:int-<sufixo>` cujo
 * `<sufixo>` NAO corresponde a nenhum worktree vivo.
 *
 * Nunca apaga a imagem de um worktree que existe, ainda que nenhuma pilha
 * esteja de pe: entre o `build` e o `run` da suite ha uma janela em que a
 * imagem esta sozinha, e apaga-la ali derrubaria a execucao de outra pessoa.
 * Trocar um defeito de contaminacao por um defeito de corrida seria o mesmo
 * defeito com o sinal invertido.
 *
 * Nunca toca em `:local`, `:prod`, `:base`, `:integracao` nem em imagem de
 * terceiro. `:integracao` em especial: ela e o resto do defeito antigo e pode
 * estar SENDO USADA por um worktree que ainda nao pegou esta correcao.
 *
 * `--dizer` (padrao) so lista. `--apagar` executa.
 */
import { execFileSync, spawnSync } from 'node:child_process';

import { identidadeDaPilha } from './identidade-da-pilha.mjs';

const apagarDeVerdade = process.argv.includes('--apagar');

const raiz = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

// `--porcelain` e nao a saida legivel: a legivel alinha em colunas e quebra
// quando um caminho tem espaco, e ha worktree em /private/tmp com nome gerado.
const vivos = new Set(
  execFileSync('git', ['-C', raiz, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' })
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => identidadeDaPilha(l.slice('worktree '.length).trim()).tagDaPilha),
);

const todas = execFileSync(
  'docker',
  ['images', '--format', '{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.Size}}'],
  { encoding: 'utf8' },
)
  .split('\n')
  .filter((l) => l.trim() !== '')
  .map((l) => {
    const [referencia, id, tamanho] = l.split('\t');
    return { referencia, id, tamanho, tag: referencia.slice(referencia.lastIndexOf(':') + 1) };
  })
  .filter(
    (i) =>
      (i.referencia.startsWith('bichu-app:int-') || i.referencia.startsWith('bichu-migrador:int-')) &&
      !vivos.has(i.tag),
  );

console.log(`worktrees vivos: ${String(vivos.size)}`);
if (todas.length === 0) {
  console.log('nenhuma imagem de pilha orfa. Nada a fazer.');
  process.exit(0);
}

console.log(`\nimagens de pilha SEM worktree correspondente: ${String(todas.length)}`);
for (const i of todas) console.log(`    ${i.referencia}  ${i.id}  ${i.tamanho}`);

if (!apagarDeVerdade) {
  console.log(
    '\nnada foi apagado. Rode com `--apagar` para executar:\n' +
      '    npm run limpar:imagens-de-integracao -- --apagar',
  );
  process.exit(0);
}

let apagadas = 0;
for (const i of todas) {
  const r = spawnSync('docker', ['image', 'rm', i.referencia], { encoding: 'utf8' });
  if (r.status === 0) {
    apagadas += 1;
  } else {
    // Imagem em uso por conteiner e o caso esperado, e nao e erro: alguem pode
    // ter subido a pilha de um worktree que acabou de ser removido. Dizer e o
    // suficiente; forcar (`-f`) mataria a referencia debaixo do conteiner.
    console.log(`    nao apagada (${i.referencia}): ${(r.stderr ?? '').trim().split('\n')[0]}`);
  }
}
console.log(`\n${String(apagadas)} de ${String(todas.length)} apagadas.`);
