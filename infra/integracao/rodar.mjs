#!/usr/bin/env node
/* global console, process */
// A diretiva acima segue a convencao de infra/verificacao/*.mjs: o ESLint
// deste repositorio nao declara os globais de Node para `**/*.mjs` fora de
// `src/`, entao `console` e `process` reprovariam em `no-undef`.
/**
 * `npm run test:integration` -- de dentro de QUALQUER worktree.
 *
 * ===========================================================================
 * AS DUAS TRAVAS QUE ISTO DESFAZ
 * ===========================================================================
 * 1. **O worktree nao tem `.env`.** Ele e ignorado pelo git e nao acompanha
 *    `git worktree add`. Sem ele o compose nem interpola (`${...:?}`) e
 *    `loadAppConfig()` morre no primeiro `requireEnv`. A saida NAO e copiar o
 *    `.env` da arvore principal -- ele carrega token do Postmark, do Atlassian
 *    e do GitHub, e espalhar isso por oito diretorios em /private/tmp seria
 *    trocar uma inconveniencia por um vazamento. O worktree GERA o seu, com
 *    valores falsos que se anunciam como falsos. Ver
 *    `gerar-env-de-integracao.mjs`.
 *
 * 2. **`compose.yaml` fixa `name: bichu`.** Nome de projeto fixo significa que
 *    `docker compose` rodado de um worktree resolve para os conteineres da
 *    PILHA PRINCIPAL. `make test-int` de dentro de um worktree nao colidia com
 *    ela: migrava e escrevia dentro dela, em silencio. E dar nome proprio a
 *    pilha inteira nao resolve, porque `edge` e `mail` publicam portas fixas
 *    (3000, 3001, 8443, 8025) e a segunda pilha colide no hospedeiro.
 *
 *    A pilha de integracao nao publica porta nenhuma: quem roda a suite e um
 *    servico DENTRO da rede dela. E o nome do projeto sai do caminho do
 *    worktree, entao oito worktrees dao oito pilhas que nunca se encontram.
 * ===========================================================================
 *
 * A pilha e derrubada com `-v` ao fim, inclusive quando a suite reprova: o
 * proximo `npm run test:integration` parte de banco vazio e migra do zero, que
 * e o mesmo que `make reset` prova na pilha principal.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { gerar } from './gerar-env-de-integracao.mjs';
import { MARCA } from './guarda-de-banco-descartavel.mjs';

const ARQUIVO = 'infra/integracao/compose.integracao.yaml';
const ENV = '.env.integracao';

const raiz = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(raiz);

/**
 * O nome do projeto sai do CAMINHO do worktree, e nao do nome da branch.
 *
 * Caminho e unico por definicao; nome de branch nao (dois worktrees da mesma
 * branch nao existem, mas um `git worktree move` mudaria o caminho sem mudar a
 * branch e o inverso tambem). O que precisa ser unico e o diretorio de onde a
 * suite roda, porque e ele que carrega o codigo sob teste.
 *
 * Nunca `bichu`: o prefixo garante que esta pilha nao possa, por acidente de
 * nome, resolver para a pilha principal.
 */
const projeto = `bichu-int-${createHash('sha1').update(raiz).digest('hex').slice(0, 10)}`;

const compose = (args, opcoes = {}) =>
  spawnSync('docker', ['compose', '-p', projeto, '-f', ARQUIVO, '--env-file', ENV, ...args], {
    stdio: 'inherit',
    ...opcoes,
  });

function exigir(resultado, oque) {
  if (resultado.status !== 0) {
    console.error(`\nREPROVADO: ${oque} (saida ${String(resultado.status)})\n`);
    derrubar();
    process.exit(resultado.status === null ? 1 : resultado.status);
  }
}

let derrubando = false;
function derrubar() {
  if (derrubando) return;
  derrubando = true;
  compose(['down', '-v', '--remove-orphans', '--timeout', '5'], { stdio: 'inherit' });
}
process.on('SIGINT', () => {
  derrubar();
  process.exit(130);
});

console.log(`worktree:  ${raiz}`);
console.log(`projeto:   ${projeto}  (a pilha principal e \`bichu\`; esta nunca e)`);

const { conferidas } = gerar();
console.log(`ambiente:  ${ENV} gerado, ${String(conferidas)} variaveis exigidas pelo codigo preenchidas`);

// Uma pilha anterior interrompida deixaria conteiner de pe com dado velho. A
// suite precisa migrar do zero para provar o que ela afirma sobre o esquema.
compose(['down', '-v', '--remove-orphans', '--timeout', '5'], { stdio: 'ignore' });

exigir(compose(['build', 'testes', 'migracao']), 'a construcao da imagem de teste falhou');
exigir(compose(['up', '-d', '--wait', 'db', 'mail']), 'o banco ou o receptor de e-mail nao ficaram saudaveis');

// A marca de descartabilidade. Ela e aplicada AQUI, por quem provisionou o
// banco, e conferida la dentro pela guarda antes da primeira escrita. Quem
// provisiona declara; quem escreve confere. Sem isto a guarda recusaria a
// propria pilha efemera, que e o desfecho certo: a guarda pergunta ao banco, e
// nao ao ambiente de quem chama.
exigir(
  compose([
    'exec', '-T', 'db',
    'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'bichu', '-d', 'bichu',
    '-c', `COMMENT ON DATABASE "bichu" IS '${MARCA}'`,
  ]),
  'nao consegui marcar o banco efemero como descartavel',
);

const suite = compose(['run', '--rm', 'testes', 'npm', 'run', 'test:integration:executar']);
derrubar();

if (suite.status !== 0) process.exit(suite.status === null ? 1 : suite.status);
console.log(`\nintegracao APROVADA no worktree ${raiz}`);
