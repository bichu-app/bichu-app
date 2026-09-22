#!/usr/bin/env node
/* global console, process */
// A diretiva acima segue a convencao de infra/verificacao/*.mjs: o ESLint
// deste repositorio nao declara os globais de Node para `**/*.mjs` fora de
// `src/`, entao `console` e `process` reprovariam em `no-undef`.
/**
 * Roda a suite de integracao, DENTRO da pilha. Chamado por
 * `npm run test:integration:executar`.
 *
 * Tres coisas acontecem aqui, e as tres sao portao:
 *
 * 1. **O banco tem que se declarar descartavel.** Ver
 *    `guarda-de-banco-descartavel.mjs`.
 * 2. **Cada arquivo de `tests/integration/` tem que ter virado JavaScript.**
 *    Falta de arquivo compilado e falha com o nome do arquivo, nunca um caso a
 *    menos rodando calado.
 * 3. **A suite tem que ter EXECUTADO.** `node --test` com um padrao que nao
 *    casa nada sai ZERO. Suite que "passa" porque nao rodou e o pior desfecho
 *    possivel: o painel fica verde, ninguem procura, e a cobertura que se
 *    acredita ter nao existe.
 *
 * Por isso os caminhos vao EXPLICITOS para o `node --test`, calculados do disco,
 * e nao por curinga entregue ao runner. E por isso o total de casos e conferido
 * contra o numero de arquivos: zero caso reprova, e menos casos do que arquivos
 * reprova.
 *
 * ===========================================================================
 * `--lcov <arquivo>`: A MEDICAO QUE FALTAVA CHEGAR AO SONAR
 * ===========================================================================
 * Ate aqui esta suite nao emitia cobertura nenhuma, e a esteira alimentava o
 * SonarCloud so com o lcov de `npm test`. Consequencia medida: 40 arquivos de
 * producao de `src` -- quase todos os adaptadores `kysely-*` e os pontos de
 * entrada `api.ts`/`worker.ts` -- nao apareciam em relatorio algum. Para o
 * Sonar, arquivo de fonte SEM dado de cobertura e arquivo com 0%: eles estavam
 * testados, so que por ESTA suite, e a medicao nunca saia do container.
 *
 * A bandeira tem a mesma forma da do executor da unitaria
 * (`infra/suite/executar-unitaria.mjs`), de proposito: duas formas diferentes
 * para a mesma coisa divergem, e a que diverge para menos mede menos sem
 * avisar.
 *
 * `--enable-source-maps` so entra JUNTO com `--lcov`, e e ela que faz o
 * reporter atravessar o source map e gravar `src/**\/*.ts` em vez de
 * `dist/_tests/**\/*.js`. Sem ela o Sonar nao casa nenhum arquivo, nao
 * reclama, e publica 0% -- ver o cabecalho de
 * `infra/verificacao/verificar-cobertura-lcov.mjs`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { exigirBancoDescartavel } from './guarda-de-banco-descartavel.mjs';

const ORIGEM = 'tests/integration';
const COMPILADO = 'dist/_tests/tests/integration';

/**
 * `--lcov <arquivo>`. Mesma forma da bandeira do executor da unitaria.
 * Ausente, a suite roda sem instrumentar, como sempre rodou.
 */
const argv = process.argv.slice(2);

/**
 * `--placar <diretorio>`: onde deixar uma COPIA do relatorio TAP, para o
 * acumulado de `infra/suite/acumular-reprovados.mjs` conseguir le-la.
 *
 * Existe pelo mesmo motivo de `--lcov`: esta suite roda DENTRO de um container
 * que `docker compose run --rm` apaga no fim, e `dist/` nao e montado -- montar
 * `dist/` por cima cobriria o `dist/` compilado da propria imagem. Quem quer o
 * arquivo do lado de fora monta UM diretorio proprio e passa o caminho aqui.
 *
 * Ausente, nada muda: o TAP continua so em `dist/_tests/integracao.tap`.
 */
const indiceDoPlacar = argv.indexOf('--placar');
const placar = indiceDoPlacar === -1 ? undefined : argv[indiceDoPlacar + 1];
if (indiceDoPlacar !== -1 && (placar === undefined || placar.startsWith('-'))) {
  console.error('\nREPROVADO: `--placar` exige o caminho do diretorio de saida.\n');
  process.exit(1);
}

const indiceDoLcov = argv.indexOf('--lcov');
const lcov = indiceDoLcov === -1 ? undefined : argv[indiceDoLcov + 1];
if (indiceDoLcov !== -1 && (lcov === undefined || lcov.startsWith('-'))) {
  console.error('\nREPROVADO: `--lcov` exige o caminho do arquivo de saida.\n');
  process.exit(1);
}

function varrer(raiz, sufixo) {
  if (!existsSync(raiz)) return [];
  const saida = [];
  const andar = (dir) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else if (nome.endsWith(sufixo)) saida.push(relative(raiz, caminho));
    }
  };
  andar(raiz);
  return saida.sort();
}

function morrer(mensagem) {
  console.error(`\nREPROVADO: ${mensagem}\n`);
  process.exit(1);
}

const naFonte = varrer(ORIGEM, '.test.ts').map((c) => c.replace(/\.ts$/, '.js'));
if (naFonte.length === 0) {
  morrer(
    `nenhum arquivo *.test.ts em ${ORIGEM}/. A suite de integracao nao tem o que rodar, ` +
      'e sair zero aqui seria anunciar cobertura que nao existe.',
  );
}

await exigirBancoDescartavel();

const compilar = spawnSync('npx', ['tsc', '-p', 'tsconfig.json', '--outDir', 'dist/_tests'], {
  stdio: 'inherit',
});
if (compilar.status !== 0) morrer('a compilacao falhou; a suite de integracao nao chegou a rodar.');

const compilados = varrer(COMPILADO, '.test.js');

const semCompilar = naFonte.filter((c) => !compilados.includes(c));
if (semCompilar.length > 0) {
  morrer(
    `arquivo de teste sem contrapartida compilada: ${semCompilar.join(', ')}. ` +
      'Ele NAO rodaria, e a suite terminaria verde com um caso a menos.',
  );
}

// O outro sentido. `npm test` e `npm run test:integration` nao limpam
// `dist/_tests`, entao um teste APAGADO da fonte continua em disco e continua
// rodando -- ja houve falha fantasma num commit verde por causa disso. Este
// portao nao conserta a limpeza (ha trabalho em curso nisso, no worktree
// `wt-params`); ele faz o sintoma parar de ser silencioso.
const sobrando = compilados.filter((c) => !naFonte.includes(c));
if (sobrando.length > 0) {
  morrer(
    `dist/_tests tem teste de integracao que nao existe mais na fonte: ${sobrando.join(', ')}. ` +
      'Ele ainda seria executado. Apague dist/_tests e rode de novo.',
  );
}

const caminhos = naFonte.map((c) => join(COMPILADO, c));
console.log(`\nsuite de integracao: ${String(caminhos.length)} arquivos\n${caminhos.join('\n')}\n`);

// Dois relatorios: `spec` na tela, para quem esta olhando, e `tap` em arquivo,
// para o placar ser LIDO e nao adivinhado.
//
// Capturar a saida em memoria e imprimi-la no fim NAO serve: a aplicacao loga
// cada requisicao, a suite de revogacao faz milhares delas, e um
// `process.stdout.write` de dezenas de megabytes seguido de `process.exit`
// TRUNCA -- a escrita em pipe e assincrona e o processo morre antes de drenar.
// Isso ja apareceu aqui: o placar sumia do fim do arquivo e so o veredito
// restava. Portao que perde a evidencia em que se baseia nao e portao.
const RELATORIO = 'dist/_tests/integracao.tap';
const argumentos = [];
// SEM ESSA FLAG o lcov sai apontando para `dist/_tests/**/*.js`, o Sonar nao
// casa nenhum arquivo, nao reclama, e publica 0% de cobertura. Ela vem antes
// de `--test` porque e opcao do PROCESSO, nao do runner.
if (lcov !== undefined) argumentos.push('--enable-source-maps');
argumentos.push(
  '--test',
  ...(lcov === undefined ? [] : ['--experimental-test-coverage']),
  '--test-reporter=spec',
  '--test-reporter-destination=stdout',
  '--test-reporter=tap',
  `--test-reporter-destination=${RELATORIO}`,
);
if (lcov !== undefined) {
  mkdirSync(dirname(lcov), { recursive: true });
  argumentos.push('--test-reporter=lcov', `--test-reporter-destination=${lcov}`);
}
const execucao = spawnSync('node', [...argumentos, ...caminhos], { stdio: 'inherit' });

if (!existsSync(RELATORIO)) {
  morrer(
    `o relatorio TAP nao foi escrito em ${RELATORIO}. Sem ele nao ha placar para conferir, ` +
      'e aprovar sem placar e exatamente o que este portao existe para impedir.',
  );
}
const saida = readFileSync(RELATORIO, 'utf8');

// A COPIA SAI ANTES DO VEREDITO, E ISSO E O PONTO INTEIRO.
//
// O acumulado de casos que piscam existe para registrar a execucao que
// REPROVOU. Copiar depois de `morrer()` seria copiar so as execucoes verdes,
// que e exatamente a lista que nao serve para nada.
if (placar !== undefined) {
  mkdirSync(placar, { recursive: true });
  writeFileSync(join(placar, 'integracao.tap'), saida);
  console.log(`copia do relatorio TAP em ${join(placar, 'integracao.tap')}`);
}

const numero = (rotulo) => {
  const casado = new RegExp(`^# ${rotulo} (\\d+)$`, 'm').exec(saida);
  return casado === null ? undefined : Number.parseInt(casado[1], 10);
};
const totalDeCasos = numero('tests');
const passaram = numero('pass');
const falharam = numero('fail');

if (totalDeCasos === undefined || passaram === undefined || falharam === undefined) {
  morrer(
    'o relatorio TAP nao trouxe o placar (`# tests`, `# pass`, `# fail`). Sem placar nao da ' +
      'para afirmar que a suite rodou, e aprovar sem afirmar e o defeito que este portao existe ' +
      'para impedir.',
  );
}

console.log(`\nplacar: ${String(totalDeCasos)} casos, ${String(passaram)} passaram, ${String(falharam)} falharam`);

// Cada arquivo carrega pelo menos um caso. Numero fixo aqui viraria mentira no
// proximo arquivo novo; derivado do disco, ele acompanha.
if (totalDeCasos < caminhos.length) {
  morrer(
    `${String(totalDeCasos)} casos executados para ${String(caminhos.length)} arquivos de teste. ` +
      'Arquivo que nao produziu nenhum caso nao foi exercitado, e a suite estaria verde por ' +
      'omissao.',
  );
}
if (passaram === 0) {
  morrer('nenhum caso passou. Suite que nao executa nada sai zero, e zero aqui nao e aprovacao.');
}
if (falharam > 0 || execucao.status !== 0) {
  morrer(`${String(falharam)} caso(s) reprovaram.`);
}

// Pedir cobertura e nao receber arquivo nenhum precisa REPROVAR aqui. O passo
// da esteira que consome este arquivo esta noutro job: se ele nao existir, o
// `upload-artifact` sobe vazio, o `download-artifact` nao traz nada, e o
// verificador do job `sonar` acusaria "relatorio nao encontrado" tres jobs
// depois, com o motivo perdido no caminho. Quem pediu a medicao e quem cobra.
if (lcov !== undefined && !existsSync(lcov)) {
  morrer(
    `a cobertura foi pedida em ${lcov} e o arquivo nao foi escrito. O reporter \`lcov\` do Node ` +
      'nao gravou nada: ou `--experimental-test-coverage` nao chegou ao processo, ou o destino ' +
      'nao e gravavel. Seguir daqui entregaria ao SonarCloud a ausencia, que ele publica como 0%.',
  );
}

console.log('suite de integracao: APROVADA');
