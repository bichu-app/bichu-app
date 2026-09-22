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

import { gerar } from './gerar-env-de-integracao.mjs';
import { MARCA } from './guarda-de-banco-descartavel.mjs';
import { identidadeDaPilha } from './identidade-da-pilha.mjs';

const ARQUIVO = 'infra/integracao/compose.integracao.yaml';
const ENV = '.env.integracao';

const raiz = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(raiz);

/**
 * Nome do projeto e tag das imagens, os dois derivados do caminho do worktree.
 *
 * A regra mora em `identidade-da-pilha.mjs`, e nao aqui, porque a isca de
 * isolamento precisa produzir a MESMA identidade para duas arvores. Leia o
 * cabecalho de la: ele explica por que o `-p` sozinho nao bastava e por que a
 * tag global fazia esta pilha migrar com o esquema de outra branch.
 */
const { projeto, tagDaPilha } = identidadeDaPilha(raiz);

// O Dockerfile EXIGE `BUILD_COMMIT` em todo alvo (BICHUS-210), e o compose desta
// pilha o declara como `${BUILD_COMMIT:-}`. Sem alguem fornecer, o build reprova --
// que e o portao funcionando, mas transformava a suite de integracao num comando
// que so rodava para quem lembrasse do prefixo. Quem sabe o commit e o executor.
//
// Nao entra no `.env.integracao` de proposito: aquele arquivo e derivado do
// exemplo, e um dia alguem pode le-lo como fonte da verdade do valor que o portao
// da BICHUS-216 existe para medir. Aqui ele e ambiente do processo, como no Makefile.
const commitDeBuild =
  process.env.BUILD_COMMIT?.trim() ||
  execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' }).trim();

const compose = (args, opcoes = {}) =>
  spawnSync('docker', ['compose', '-p', projeto, '-f', ARQUIVO, '--env-file', ENV, ...args], {
    stdio: 'inherit',
    ...opcoes,
    env: {
      ...process.env,
      BUILD_COMMIT: commitDeBuild,
      // Em TODA invocacao, e nao so no `build`: o compose interpola `${TAG_DA_PILHA:?}`
      // tambem em `down`, `run`, `exec` e `config`, e faltar em qualquer uma delas
      // derrubaria o comando com a mensagem do `:?`. O `:?` esta la de proposito,
      // para quem digitar `docker compose -f ...` a mao nao recriar a tag global.
      TAG_DA_PILHA: tagDaPilha,
      ...(opcoes.env ?? {}),
    },
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
  apagarAsImagensDestaPilha();
}

/**
 * As duas imagens desta pilha vao embora junto com ela.
 *
 * ===========================================================================
 * POR QUE APAGAR, SE ANTES NAO SE APAGAVA
 * ===========================================================================
 * Antes havia DUAS imagens de integracao na maquina inteira, porque a tag era
 * global -- o defeito e a contencao de disco eram a mesma coisa. Com a tag por
 * worktree sao duas POR WORKTREE, e aqui ha setenta. Medido em 22/09 com
 * `docker system df -v`: `bichu-app` tem 118 MB de camada unica e
 * `bichu-migrador` 111 MB, o resto sendo camada compartilhada com todas as
 * outras. Setenta worktrees dariam cerca de 16 GB de camada unica, numa maquina
 * que ja carrega 44 GB de imagem e 25 GB de cache de build.
 *
 * Apagar e barato porque o que custa nao e a imagem, e o CACHE DE BUILD, e ele
 * nao vai junto: `docker image rm` tira a referencia, e o `build` da proxima
 * execucao reaproveita as mesmas camadas. Medido aqui: reconstruir depois de
 * apagar levou cerca de um segundo.
 *
 * ===========================================================================
 * SO AS DESTA PILHA, E ISSO E GARANTIA E NAO CUIDADO
 * ===========================================================================
 * A tag sai do sha1 do caminho DESTE worktree. Nenhuma outra pilha pode ter
 * esta tag, entao este `rm` nao alcanca a imagem de quem esta com a suite no
 * meio. Era justamente o que a tag global nao garantia.
 *
 * `BICHU_MANTER_IMAGEM=1` guarda as duas, para quem precisa abrir a imagem
 * depois de uma reprovacao (`docker run --rm --entrypoint ls bichu-migrador:<tag> /app/migrations`).
 *
 * Imagem de worktree que sumiu sem rodar a suite de novo nao e alcancada por
 * aqui. Para essas, ver `infra/integracao/limpar-imagens.mjs`.
 */
function apagarAsImagensDestaPilha() {
  if (process.env.BICHU_MANTER_IMAGEM === '1') {
    console.log(`imagens mantidas por BICHU_MANTER_IMAGEM=1: bichu-app:${tagDaPilha}, bichu-migrador:${tagDaPilha}`);
    return;
  }
  for (const imagem of [`bichu-app:${tagDaPilha}`, `bichu-migrador:${tagDaPilha}`]) {
    spawnSync('docker', ['image', 'rm', '-f', imagem], { stdio: 'ignore' });
  }
}
process.on('SIGINT', () => {
  derrubar();
  process.exit(130);
});

console.log(`worktree:  ${raiz}`);
console.log(`projeto:   ${projeto}  (a pilha principal e \`bichu\`; esta nunca e)`);
console.log(`imagens:   bichu-app:${tagDaPilha} e bichu-migrador:${tagDaPilha}  (tag por worktree; a fixa \`:integracao\` migrava com o esquema alheio)`);

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

// O que vier depois de `npm run test:integration --` e repassado ao executor
// LA DENTRO. E assim que `--lcov coverage/lcov-integracao.info` chega ate ele
// de dentro de um worktree: a arvore inteira ja esta montada em `/app`, entao
// o relatorio nasce no proprio worktree, no mesmo caminho relativo.
const extras = process.argv.slice(2);
const suite = compose([
  'run', '--rm', 'testes',
  'npm', 'run', 'test:integration:executar', '--', ...extras,
]);
derrubar();

if (suite.status !== 0) process.exit(suite.status === null ? 1 : suite.status);
console.log(`\nintegracao APROVADA no worktree ${raiz}`);
