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
 * 4. **O placar e o codigo de saida tem que FECHAR.** Ver `conferirInvariante`.
 *    Ate 19/10 este arquivo lia 3 dos 6 rotulos do TAP, e caso CANCELADO -- que
 *    conta em `# tests`, nao conta em `# pass` e nao conta em `# fail` -- saia
 *    invisivel: dava para imprimir "0 caso(s) reprovaram" e sair 1. A unitaria
 *    ganhou a conta certa depois de ter sido medida assim na esteira; este
 *    arquivo tinha o MESMO defeito, linha por linha, e ficou de fora daquele
 *    conserto.
 *
 * 5. **Nenhum arquivo pode ter produzido ZERO casos.** Ver `arquivosSemCaso`. O
 *    piso pelo total nao alcanca isto: o runner reporta o arquivo vazio como um
 *    teste APROVADO com o nome do proprio caminho, entao ele sobe `# tests` e
 *    `# pass` juntos e o piso continua satisfeito enquanto os arquivos se
 *    esvaziam um a um.
 *
 * As regras 3, 4 e 5 tem isca propria: `node infra/integracao/executar-suite.mjs
 * --autoteste` nao precisa de banco, de Docker nem de compilacao.
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
 * O PROJETO QUE SE COMPILA, e nao o `tsconfig.json` da raiz. O motivo inteiro,
 * com a bisseccao de memoria que o justifica, esta no cabecalho de
 * `tsconfig.integracao.json`. Em uma linha: o da raiz arrasta os 235 arquivos
 * da suite UNITARIA, e o compilador morria de monte dentro do `mem_limit: 1g`
 * antes do primeiro caso de integracao.
 */
const PROJETO = 'tsconfig.integracao.json';

/**
 * Teto de monte velho do compilador, EM MEGABYTES.
 *
 * Isto NAO sobe teto de memoria nenhum: o `mem_limit: 1g` do servico `testes`
 * fica exatamente onde esta. O que isto corrige e o V8 deixar 1 GB de orcamento
 * no prato: dentro de um grupo de controle de 1 GB ele escolhe sozinho um teto
 * de monte de ~520 MB (lido do estouro: `Mark-Compact 503.8 (520.8) MB`) e
 * aborta com `Ineffective mark-compacts near heap limit` -- com ~480 MB do
 * limite que ele JA TINHA nunca tocados.
 *
 * 768 e nem o que ele precisa nem o que ele pode: o projeto estreitado passa
 * com 512 e reprova com 448 (bisseccao no cabecalho do `tsconfig.integracao.json`),
 * entao 768 e 50% de folga sobre o medido, e sobram 256 MB do grupo de controle
 * para o processo de fora, o `npm` e o `npx`. Numero SEM folga aqui voltaria a
 * estourar no proximo modulo novo, que e o defeito que isto conserta.
 */
const TETO_DE_MONTE_MB = 768;

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
// `destinoDoPlacar` e nao `placar`: `placar()` e a funcao que LE o relatorio,
// mais abaixo, e dois nomes iguais no mesmo modulo nem carregam.
const destinoDoPlacar = indiceDoPlacar === -1 ? undefined : argv[indiceDoPlacar + 1];
if (indiceDoPlacar !== -1 && (destinoDoPlacar === undefined || destinoDoPlacar.startsWith('-'))) {
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

// ===========================================================================
// O PLACAR, A INVARIANTE E O PISO POR ARQUIVO
// ===========================================================================
// Estas quatro funcoes sao a metade que faltava deste executor. A forma e a
// MESMA de `infra/suite/executar-unitaria.mjs`, de proposito e palavra por
// palavra onde da: duas formas diferentes para a mesma conta divergem, e a que
// diverge para menos mede menos sem avisar.
//
// A unitaria ganhou isto depois de ter sido medida lendo 3 dos 6 rotulos do TAP
// e contando um caso CANCELADO como invisivel. Este arquivo tinha o mesmo
// defeito, linha por linha, e ficou de fora daquele conserto.

/**
 * `# tests 856` e companhia. `undefined` quando o rotulo nao esta no relatorio.
 *
 * Os SEIS rotulos de contagem que o runner do Node emite, e nao tres:
 *
 *   # tests 5      # pass 1   # fail 2
 *   # suites 0     # cancelled 0   # skipped 1   # todo 1
 *
 * A identidade e `tests = pass + fail + cancelled + skipped + todo`. Em
 * particular `skipped` e `todo` NAO estao dentro de `pass`: ler so tres rotulos
 * deixa tres formas de desfecho fora da conta.
 */
function placar(tap) {
  const numero = (rotulo) => {
    const casado = new RegExp(`^# ${rotulo} (\\d+)$`, 'm').exec(tap);
    return casado === null ? undefined : Number.parseInt(casado[1], 10);
  };
  return {
    total: numero('tests'),
    passaram: numero('pass'),
    falharam: numero('fail'),
    cancelados: numero('cancelled'),
    pulados: numero('skipped'),
    pendentes: numero('todo'),
  };
}

/**
 * Quantos casos REPROVARAM, e nao quantos "falharam".
 *
 * Reprovado = `fail` + `cancelled` + o RESIDUO, onde o residuo e
 * `tests - (pass + fail + cancelled + skipped + todo)`: o que o runner contou e
 * nao atribuiu a nenhum rotulo que este arquivo conhece.
 *
 * O residuo e a parte que nao envelhece. Enumerar rotulos conhecidos protege
 * contra as formas de hoje; o residuo protege contra a que o Node acrescentar
 * amanha, porque rotulo novo aparece como caso contado e nao classificado, e cai
 * em REPROVADO por falta de classificacao -- e nao em aprovado por omissao. A
 * direcao do erro e a escolha que importa aqui.
 *
 * `skipped` e `todo` ficam FORA de reprovado de proposito -- pular e marcar
 * pendente sao decisoes de quem escreveu o teste --, mas entram na conta do
 * residuo, senao cada caso pulado apareceria como nao classificado e a suite
 * reprovaria por estar certa.
 */
function contarReprovados(lido) {
  const n = (v) => (v === undefined ? 0 : v);
  const classificados =
    n(lido.passaram) + n(lido.falharam) + n(lido.cancelados) + n(lido.pulados) + n(lido.pendentes);
  const semClassificacao = Math.max(0, n(lido.total) - classificados);
  return {
    semClassificacao,
    reprovados: n(lido.falharam) + n(lido.cancelados) + semClassificacao,
  };
}

/**
 * A INVARIANTE, e e ela que importa mais que a lista de rotulos:
 *
 *   O CODIGO DE SAIDA E O PLACAR NUNCA PODEM DISCORDAR.
 *
 *   - saida diferente de zero  =>  o placar mostra PELO MENOS UM reprovado;
 *   - placar com zero reprovados  =>  a saida e ZERO.
 *
 * Recebe o codigo JA DECIDIDO em vez de decidi-lo: conferir o codigo que o
 * executor realmente vai devolver pega tambem o dia em que alguem mudar a forma
 * de decidi-lo. Conferencia que recalcula o que ela mesma confere so testa a
 * propria aritmetica.
 *
 * Devolve as violacoes; lista vazia e aprovacao.
 */
function conferirInvariante(codigoDeSaida, reprovados) {
  const violacoes = [];
  if (codigoDeSaida !== 0 && reprovados === 0) {
    violacoes.push(
      `saida ${String(codigoDeSaida)} com placar de zero reprovados: o runner reprovou de um modo ` +
        'que o placar nao contou. Placar limpo com saida de erro e o defeito que faz todo mundo ' +
        'repassar o numero errado.',
    );
  }
  if (codigoDeSaida === 0 && reprovados > 0) {
    violacoes.push(
      `saida 0 com ${String(reprovados)} reprovado(s) no placar: aprovacao em cima de placar que ` +
        'nomeia reprovacao.',
    );
  }
  return violacoes;
}

/**
 * O PISO POR ARQUIVO, que e o que o piso pelo TOTAL nao alcanca.
 *
 * Quando um arquivo de teste nao produz caso nenhum -- importacao que estourou,
 * `describe` que ficou vazio, arquivo que virou so `export {}` --, o runner do
 * Node o reporta como UM teste APROVADO com o nome do proprio caminho. O
 * `# tests` sobe, o `# pass` sobe, e um piso derivado do numero de arquivos
 * continua satisfeito enquanto os arquivos se esvaziam um a um.
 *
 * `# Subtest: <nome>` e a linha que o distingue: num arquivo exercitado o nome
 * e o do CASO; num arquivo vazio o nome e o CAMINHO que se passou ao runner.
 */
function arquivosSemCaso(tap, caminhos) {
  const nomes = new Set();
  for (const casado of tap.matchAll(/^# Subtest: (.*)$/gm)) nomes.add(casado[1]);
  return caminhos.filter((c) => nomes.has(c));
}

// ===========================================================================
// AUTOTESTE: `node infra/integracao/executar-suite.mjs --autoteste`
// ===========================================================================
// Um caso por regra, sem cadeia, mais o outro lado de cada uma. Nao toca banco,
// nao toca Docker e nao compila nada: ele exercita as quatro funcoes acima
// contra TAP literal, que e a unica forma de provar que elas reprovam SEM
// precisar de uma suite quebrada de verdade.
//
// Prova por desligamento, medida: trocando o `n(lido.cancelados)` de
// `contarReprovados` por zero, as duas primeiras iscas reprovam; trocando o
// corpo de `conferirInvariante` por `return []`, a terceira e a quarta
// reprovam; trocando o `nomes.has(c)` de `arquivosSemCaso` por `false`, a
// setima reprova.
function autoteste() {
  /** O placar literal medido na esteira: 2782 casos, 2781 passaram, zero falharam, UM cancelado. */
  const TAP_DA_ESTEIRA =
    'TAP version 13\n# tests 2782\n# suites 199\n# pass 2781\n# fail 0\n# cancelled 1\n# skipped 0\n# todo 0\n';
  /** O mesmo buraco de um caso, mas SEM rotulo nenhum para ele: o residuo. */
  const TAP_COM_RESIDUO = 'TAP version 13\n# tests 3\n# pass 2\n# fail 0\n';
  /** Placar limpo de verdade: tudo que foi contado passou. */
  const TAP_LIMPO = 'TAP version 13\n# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
  /** Pular e marcar pendente nao sao reprovacao -- e tambem nao sao residuo. */
  const TAP_PULADO = 'TAP version 13\n# tests 4\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 1\n';
  /** Suite que nao executou NADA. O desfecho que esta esteira teve de verdade. */
  const TAP_VAZIO = 'TAP version 13\n1..0\n# tests 0\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';

  const CAMINHO = `${COMPILADO}/vazio.test.js`;
  const TAP_DO_ARQUIVO_VAZIO = `TAP version 13\n# Subtest: ${CAMINHO}\nok 1 - ${CAMINHO}\n1..1\n# tests 1\n# pass 1\n# fail 0\n`;
  const TAP_DO_ARQUIVO_CHEIO =
    'TAP version 13\n# Subtest: grava o apelido como texto\nok 1 - grava o apelido como texto\n1..1\n# tests 1\n# pass 1\n# fail 0\n';

  const casos = [
    ['ISCA: o placar da esteira (2782/2781/fail 0/cancelled 1) conta o cancelado como reprovado',
      contarReprovados(placar(TAP_DA_ESTEIRA)).reprovados > 0, true],
    ['ISCA: caso contado e nao classificado por rotulo nenhum conta como reprovado',
      contarReprovados(placar(TAP_COM_RESIDUO)).reprovados > 0, true],
    ['ISCA: saida diferente de zero com placar de zero reprovados e VIOLACAO',
      conferirInvariante(1, contarReprovados(placar(TAP_LIMPO)).reprovados).length > 0, true],
    ['ISCA: placar que nomeia reprovado com saida zero e VIOLACAO',
      conferirInvariante(0, contarReprovados(placar(TAP_DA_ESTEIRA)).reprovados).length > 0, true],
    ['ISCA: ZERO casos executados nao e aprovacao -- nenhum caso passou',
      placar(TAP_VAZIO).passaram === 0, true],
    ['ISCA: ZERO casos executados fica ABAIXO do piso de 44 arquivos',
      (placar(TAP_VAZIO).total ?? 0) < 44, true],
    ['ISCA: arquivo reportado com o nome do proprio caminho (zero caso) e acusado',
      arquivosSemCaso(TAP_DO_ARQUIVO_VAZIO, [CAMINHO]).length > 0, true],
    ['ISCA: placar ausente REPROVA -- relatorio sem `# tests`',
      placar('TAP version 13\n').total === undefined, true],
    ['o outro lado: placar limpo com saida zero NAO e violacao',
      conferirInvariante(0, contarReprovados(placar(TAP_LIMPO)).reprovados).length > 0, false],
    ['o outro lado: pulado e pendente NAO sao reprovacao (senao a suite reprova por estar certa)',
      contarReprovados(placar(TAP_PULADO)).reprovados > 0, false],
    ['o outro lado: pulado e pendente tambem NAO sao residuo sem classificacao',
      contarReprovados(placar(TAP_PULADO)).semClassificacao > 0, false],
    ['o outro lado: arquivo com caso de verdade nao e acusado de vazio',
      arquivosSemCaso(TAP_DO_ARQUIVO_CHEIO, [CAMINHO]).length > 0, false],
  ];

  let falhas = 0;
  console.log(`autoteste do executor da suite de integracao (${String(casos.length)} casos)`);
  for (const [nome, reprovou, precisaReprovar] of casos) {
    if (reprovou === precisaReprovar) {
      console.log(`  [    ok   ] ${nome}`);
    } else {
      falhas += 1;
      console.log(`  [ FALHOU  ] ${nome}: precisava ${precisaReprovar ? 'REPROVAR' : 'aprovar'}`);
    }
  }
  if (falhas > 0) {
    // `console.log` e nao `console.error`: os dois fluxos drenam separado, e
    // veredito fora de ordem e a primeira coisa que faz alguem ler o log errado.
    console.log(
      `\nREPROVADO: ${String(falhas)} caso(s) de autoteste. O executor da suite de integracao ` +
        'deixou de enxergar o que ele existe para enxergar, e o verde dele parou de significar ' +
        'alguma coisa.\n',
    );
    return 1;
  }
  console.log('\nAPROVADO: cada regra reprova sozinha, e o placar limpo passa');
  return 0;
}

// O autoteste vem ANTES da guarda de banco e antes de qualquer compilacao, de
// proposito: ele existe para ser rodavel em qualquer lugar -- inclusive num
// estagio da esteira que nao tem pilha de pe -- e exigir banco para conferir
// aritmetica de TAP o tornaria inalcancavel justamente quando a pilha esta
// quebrada, que e quando ele mais importa.
if (argv.includes('--autoteste')) process.exit(autoteste());

const naFonte = varrer(ORIGEM, '.test.ts').map((c) => c.replace(/\.ts$/, '.js'));
if (naFonte.length === 0) {
  morrer(
    `nenhum arquivo *.test.ts em ${ORIGEM}/. A suite de integracao nao tem o que rodar, ` +
      'e sair zero aqui seria anunciar cobertura que nao existe.',
  );
}

await exigirBancoDescartavel();

// `node --max-old-space-size=... ./node_modules/typescript/bin/tsc` e nao
// `npx tsc`: a bandeira e do PROCESSO, e `npx` nao a repassa ao filho. Pela
// variavel `NODE_OPTIONS` ela chegaria -- e chegaria tambem ao `node --test`
// logo abaixo, que nao precisa dela e cujo consumo nao foi medido com ela.
// Quem precisa do teto e so o compilador, entao ele e quem o recebe.
//
// O caminho explicito do binario, e nao `npx`: `npx` resolve pela rede quando
// nao acha o pacote localmente, e falha de rede no meio de um portao vira
// "compilacao falhou" sem dizer que foi a rede.
const compilar = spawnSync(
  'node',
  [
    `--max-old-space-size=${String(TETO_DE_MONTE_MB)}`,
    './node_modules/typescript/bin/tsc',
    '-p',
    PROJETO,
    '--outDir',
    'dist/_tests',
  ],
  { stdio: 'inherit' },
);
if (compilar.status !== 0) {
  morrer(
    `a compilacao de ${PROJETO} falhou (saida ${String(compilar.status)}); a suite de integracao ` +
      'nao chegou a rodar, e nao rodar NAO e aprovar. Se a saida foi 134 com ' +
      '`Ineffective mark-compacts near heap limit`, o compilador estourou o monte: leia o ' +
      `cabecalho de ${PROJETO} antes de mexer em \`mem_limit\`, porque a correcao de 19/10 foi ` +
      'de ESCOPO (1188 arquivos para 949) e de teto de monte do V8 dentro do mesmo 1 GB, e nao ' +
      'de teto de memoria do conteiner.',
  );
}

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
if (destinoDoPlacar !== undefined) {
  mkdirSync(destinoDoPlacar, { recursive: true });
  writeFileSync(join(destinoDoPlacar, 'integracao.tap'), saida);
  console.log(`copia do relatorio TAP em ${join(destinoDoPlacar, 'integracao.tap')}`);
}

const lido = placar(saida);
const totalDeCasos = lido.total;
const passaram = lido.passaram;

if (totalDeCasos === undefined || passaram === undefined || lido.falharam === undefined) {
  morrer(
    'o relatorio TAP nao trouxe o placar (`# tests`, `# pass`, `# fail`). Sem placar nao da ' +
      'para afirmar que a suite rodou, e aprovar sem afirmar e o defeito que este portao existe ' +
      'para impedir.',
  );
}

const { reprovados, semClassificacao } = contarReprovados(lido);

// A linha que se repassa. Ela diz REPROVARAM, e nao "falharam": `falharam` e um
// dos rotulos do runner, e foi exatamente lendo aquele rotulo como se ele fosse
// o total de reprovacoes que a unitaria chegou a imprimir "0 falharam" numa
// execucao que saiu com erro.
console.log(
  `\nplacar: ${String(totalDeCasos)} casos em ${String(caminhos.length)} arquivos, ` +
    `${String(passaram)} passaram, ${String(reprovados)} reprovaram`,
);
// A quebra por rotulo so aparece quando ha o que mostrar, e ai aparece SEMPRE:
// cancelado invisivel no detalhe e cancelado que volta a sumir.
const detalhe = [
  ['falharam', lido.falharam],
  ['cancelados', lido.cancelados],
  ['sem classificacao', semClassificacao],
  ['pulados', lido.pulados],
  ['pendentes (todo)', lido.pendentes],
].filter(([, quantos]) => quantos !== undefined && quantos > 0);
if (detalhe.length > 0) {
  console.log(`por rotulo: ${detalhe.map(([r, q]) => `${r} ${String(q)}`).join(', ')}`);
}

// ===========================================================================
// O PISO. TRES CAMADAS, E NENHUMA DELAS BASTA SOZINHA.
// ===========================================================================

// 1. Por ARQUIVO. O runner reporta o arquivo que nao produziu nenhum caso como
//    um teste APROVADO com o nome do proprio caminho: ele infla `# tests` e
//    `# pass` sem exercitar nada, e por isso passa pelas duas camadas abaixo.
const vazios = arquivosSemCaso(saida, caminhos);
if (vazios.length > 0) {
  morrer(
    `${String(vazios.length)} arquivo(s) de teste de integracao nao produziram NENHUM caso: ` +
      `${vazios.join(', ')}. O runner os reporta como um teste aprovado com o nome do proprio ` +
      'caminho, e eles inflam o total sem exercitar nada.',
  );
}

// 2. Pelo TOTAL, com piso derivado do disco. Cada arquivo carrega pelo menos um
//    caso; numero fixo aqui viraria mentira no proximo arquivo novo.
if (totalDeCasos < caminhos.length) {
  morrer(
    `${String(totalDeCasos)} casos executados para ${String(caminhos.length)} arquivos de teste. ` +
      'Arquivo que nao produziu nenhum caso nao foi exercitado, e a suite estaria verde por ' +
      'omissao.',
  );
}

// 3. Pelo ZERO absoluto. `node --test` com um padrao que nao casa nada sai ZERO,
//    e um placar de 0/0/0 satisfaz qualquer comparacao que nao olhe para isto.
if (passaram === 0) {
  morrer('nenhum caso passou. Suite que nao executa nada sai zero, e zero aqui nao e aprovacao.');
}

// ===========================================================================
// A INVARIANTE, conferida contra o codigo que este executor VAI devolver.
// ===========================================================================
const codigoDeSaida = reprovados > 0 || execucao.status !== 0 ? 1 : 0;
const violacoes = conferirInvariante(codigoDeSaida, reprovados);
if (violacoes.length > 0) {
  // Aqui o executor se recusa a mentir: ele nao tem reprovado para nomear e
  // tambem nao tem como aprovar, entao acusa a propria contradicao. Sai 1 pelo
  // `morrer`, o que mantem a invariante do lado seguro.
  morrer(
    `o placar e o codigo de saida nao fecham. ${violacoes.join(' ')} ` +
      `Lido do relatorio: tests ${String(totalDeCasos)}, pass ${String(passaram)}, ` +
      `fail ${String(lido.falharam ?? 0)}, cancelled ${String(lido.cancelados ?? 0)}, ` +
      `skipped ${String(lido.pulados ?? 0)}, todo ${String(lido.pendentes ?? 0)}; ` +
      `saida do runner ${String(execucao.status)}. Procure a forma de reprovacao que o runner ` +
      'emitiu e este executor ainda nao classifica, e acrescente-a a `contarReprovados`.',
  );
}
if (reprovados > 0) {
  morrer(`${String(reprovados)} caso(s) reprovaram.`);
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
