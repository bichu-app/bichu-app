#!/usr/bin/env node
/* global console, process */
// A diretiva acima segue a convencao de infra/verificacao/*.mjs e de
// infra/integracao/*.mjs: o ESLint deste repositorio nao declara os globais de
// Node para `**/*.mjs` fora de `src/`, entao `console` e `process` reprovariam
// em `no-undef`.
/**
 * Roda a suite UNITARIA. Chamado por `npm test`.
 *
 *   node infra/suite/executar-unitaria.mjs [--lcov <arquivo>]
 *
 * =========================================================================
 * O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR
 * =========================================================================
 *
 * Ate a BICHUS-219 o script `test` terminava em
 *
 *   node --test --experimental-test-coverage "dist/_tests/src/**\/*.test.js"
 *
 * com o curinga ENTRE ASPAS, ou seja entregue ao runner. Medido no Node
 * 22.23.2 -- a versao da imagem `node:22`, que e a que `actions/setup-node@v4`
 * com `node-version: "22"` instala na esteira -- padrao que nao casa nada
 * produz:
 *
 *   1..0
 *   # tests 0
 *   saida 0
 *
 * Zero teste, sucesso. A esteira aprovava.
 *
 * A BICHUS-204 ja tinha resolvido exatamente isto para a suite de
 * INTEGRACAO, em `infra/integracao/executar-suite.mjs`. A unitaria ficou de
 * fora, e e ela que o job `codigo` roda. Este arquivo e a outra metade daquele
 * conserto, na mesma forma e pelo mesmo motivo.
 *
 * Um zero TOTAL ainda seria pego de raspao por
 * `infra/verificacao/verificar-cobertura-lcov.mjs`, no job `sonar`, que reprova
 * relatorio vazio. Silencio PARCIAL -- alguem estreita o `include` do
 * `tsconfig.json`, metade dos arquivos deixa de ser compilada, o curinga casa
 * menos e a suite fica verde com menos casos -- nao era pego por nada.
 *
 * =========================================================================
 * A PROPRIEDADE, E POR QUE NAO UM NUMERO
 * =========================================================================
 *
 * "Pelo menos N testes", com N escrito a mao, envelhece na primeira semana: o
 * numero fica velho, a suite reprova por estar CERTA, e a correcao que todo
 * mundo faz e baixar o numero. Ai o portao vira cerimonia -- ele mede a
 * paciencia de quem mantem, nao a suite.
 *
 * A propriedade daqui nao tem numero para baixar. Ela e:
 *
 *   TODO `*.test.ts` da FONTE tem compilado correspondente, esse compilado vai
 *   EXPLICITO para o runner, e cada um deles produziu pelo menos um caso.
 *
 * As tres pontas sao derivadas do disco e se ajustam sozinhas a cada arquivo
 * novo ou apagado. Em ordem:
 *
 * 1. **Nenhum arquivo de teste sem suite.** Todo `*.test.ts` do repositorio
 *    pertence a uma das duas suites: `src/**` e a unitaria, `tests/integration/**`
 *    e a de integracao. A varredura parte da RAIZ, e nao de uma lista de arvores
 *    permitidas: renomear `src/tools/` para `tools/` tira os testes do curinga E
 *    da lista ao mesmo tempo, e o arquivo sumiria das duas pontas calado.
 *
 * 2. **Fonte e compilado casam nos DOIS sentidos.** `.test.ts` sem `.test.js`
 *    nao rodaria, e a suite terminaria verde com um caso a menos; `.test.js` sem
 *    `.test.ts` e codigo que ninguem consegue ler sendo executado (o `tsc` so
 *    acrescenta -- ver `src/tools/portao-de-suite-limpa.ts`, que confere a
 *    limpeza do lado do `package.json`).
 *
 * 3. **Cada arquivo produziu caso.** Isto nao e o total: e por arquivo. O
 *    runner do Node reporta o arquivo que nao produziu nenhum caso como um
 *    teste APROVADO com o nome do proprio caminho -- medido: tres arquivos, um
 *    deles vazio, saem como `# tests 4` e `# pass 4`. Um total continuaria
 *    subindo enquanto arquivos esvaziassem um a um. A assinatura por arquivo,
 *    nao.
 *
 * Por isso os caminhos vao EXPLICITOS para o `node --test`, calculados do
 * disco, e nunca um curinga entregue ao runner: curinga que casa menos nao tem
 * como ser distinguido, de dentro do runner, de um projeto que tem menos teste.
 *
 * =========================================================================
 * AUTOTESTE
 * =========================================================================
 *
 * `--autoteste` monta arvores descartaveis em diretorio temporario e exige que
 * cada regra acima REPROVE sozinha, mais um caso limpo que precisa APROVAR.
 * Um caso por regra, e nenhuma cadeia `if/elif/else`: numa cadeia o `else`
 * recolhe o que os ramos deixam cair, e uma isca que reprova por DOIS motivos
 * deixa o autoteste verde no dia em que a regra que ela testava for desligada.
 * O autoteste roda no job `rapidos`, sem npm e em milissegundos.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

/** Onde o `tsc` do script `test` escreve. `rootDir` e a raiz, entao o caminho da fonte se preserva. */
const COMPILADO = 'dist/_tests';
/** Arvore da suite unitaria. */
const UNITARIA = 'src';
/** Arvore da suite de integracao, que tem executor proprio e nao e rodada aqui. */
const INTEGRACAO = join('tests', 'integration');
/**
 * Diretorios que a varredura de "teste sem suite" NAO entra.
 *
 * A varredura parte da RAIZ, e nao de uma lista de arvores permitidas, porque a
 * lista permitida erra justamente no caso que interessa: mover `src/tools/`
 * para `tools/` tira os testes do curinga E da lista, e o arquivo desaparece
 * das duas pontas ao mesmo tempo. Partindo da raiz, mover para qualquer lugar
 * acusa.
 *
 * O que fica de fora aqui nao hospeda teste TypeScript que alguem espere rodar:
 * dependencia, saida de build, o app Flutter (Dart) e o `.git`. Os testes de
 * ponta a ponta do Cypress sao `*.cy.ts` e nao entram nesta conta.
 */
const NAO_VARRER = new Set(['node_modules', '.git', 'dist', 'coverage', 'app', 'build', '.dart_tool']);
/** Onde o placar e escrito para ser LIDO, e nao adivinhado. */
const RELATORIO = join(COMPILADO, 'unitaria.tap');

function morrer(mensagem) {
  console.error(`\nREPROVADO: ${mensagem}\n`);
  process.exit(1);
}

/** Todo arquivo terminado em `sufixo` sob `raiz`, em caminho relativo a `base`. */
function varrer(raiz, sufixo, base, pular = new Set()) {
  if (!existsSync(raiz)) return [];
  const saida = [];
  const andar = (dir) => {
    for (const nome of readdirSync(dir)) {
      if (pular.has(nome)) continue;
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else if (nome.endsWith(sufixo)) saida.push(relative(base, caminho));
    }
  };
  andar(raiz);
  return saida.sort();
}

// =========================================================================
// AS TRES REGRAS, EM FUNCOES PURAS -- e o autoteste chama estas mesmas.
// =========================================================================

/**
 * Regra 1. Arquivo de teste que nao pertence a nenhuma suite.
 *
 * Devolve os caminhos orfaos. Lista vazia e aprovacao.
 */
function testesSemSuite(raiz) {
  return varrer(raiz, '.test.ts', raiz, NAO_VARRER).filter(
    (c) => !c.startsWith(`${UNITARIA}/`) && !c.startsWith(`${INTEGRACAO}/`),
  );
}

/** Os `*.test.ts` da suite unitaria, em caminho relativo a raiz do repositorio. */
function fontesDaUnitaria(raiz) {
  return varrer(join(raiz, UNITARIA), '.test.ts', raiz);
}

/**
 * Regra 2, ida: fonte sem compilado. Ele NAO rodaria.
 */
function fontesSemCompilado(raiz, fontes) {
  return fontes.filter((f) => !existsSync(join(raiz, COMPILADO, f.replace(/\.ts$/, '.js'))));
}

/**
 * Regra 2, volta: compilado sem fonte. Ele AINDA rodaria, e ninguem le o que ele testa.
 */
function compiladosSemFonte(raiz) {
  const base = join(raiz, COMPILADO, UNITARIA);
  return varrer(base, '.test.js', join(raiz, COMPILADO))
    .filter((c) => !existsSync(join(raiz, c.replace(/\.js$/, '.ts'))));
}

/**
 * Regra 3. Arquivos que o runner reportou como teste de nome igual ao proprio
 * caminho -- a assinatura de "este arquivo nao produziu nenhum caso".
 */
function arquivosSemCaso(tap, caminhos) {
  const nomes = new Set();
  for (const casado of tap.matchAll(/^# Subtest: (.*)$/gm)) nomes.add(casado[1]);
  return caminhos.filter((c) => nomes.has(c));
}

/** `# tests 856` e companhia. `undefined` quando o placar nao esta no relatorio. */
function placar(tap) {
  const numero = (rotulo) => {
    const casado = new RegExp(`^# ${rotulo} (\\d+)$`, 'm').exec(tap);
    return casado === null ? undefined : Number.parseInt(casado[1], 10);
  };
  return { total: numero('tests'), passaram: numero('pass'), falharam: numero('fail') };
}

// =========================================================================
// AUTOTESTE. Um caso por regra, sem cadeia, mais um caso limpo que aprova.
// =========================================================================

function montarArvore(raiz, arquivos) {
  for (const [caminho, conteudo] of Object.entries(arquivos)) {
    const destino = join(raiz, caminho);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, conteudo);
  }
}

const ARVORE_LIMPA = {
  'src/modulo/vivo.test.ts': 'export {};\n',
  'tests/integration/banco.test.ts': 'export {};\n',
  'dist/_tests/src/modulo/vivo.test.js': '',
};

function autoteste() {
  const casos = [
    {
      nome: 'a arvore limpa APROVA (sem isto, as outras podem estar reprovando por qualquer coisa)',
      arvore: ARVORE_LIMPA,
      regra: (raiz) => [
        ...testesSemSuite(raiz),
        ...fontesSemCompilado(raiz, fontesDaUnitaria(raiz)),
        ...compiladosSemFonte(raiz),
      ],
      precisaReprovar: false,
    },
    {
      nome: 'regra 1, isolada: `*.test.ts` em tests/, fora de tests/integration/',
      // A arvore limpa MAIS um arquivo sem suite. So a regra 1 muda de resposta.
      arvore: { ...ARVORE_LIMPA, 'tests/avulso/perdido.test.ts': 'export {};\n' },
      regra: (raiz) => testesSemSuite(raiz),
      precisaReprovar: true,
    },
    {
      // O caso que uma lista de arvores permitidas NAO pegaria: renomear
      // `src/tools/` para `tools/` tira os testes do curinga e da lista ao mesmo
      // tempo. A varredura parte da raiz justamente por isto.
      nome: 'regra 1, isolada: diretorio de teste renomeado para fora de src/',
      arvore: { ...ARVORE_LIMPA, 'ferramentas/movido.test.ts': 'export {};\n' },
      regra: (raiz) => testesSemSuite(raiz),
      precisaReprovar: true,
    },
    {
      nome: 'regra 2 (ida), isolada: fonte sem compilado -- ele nao rodaria',
      // O `tsconfig.json` estreitado tira o `.js` e deixa o `.ts`. Nada mais muda.
      arvore: {
        'src/modulo/vivo.test.ts': 'export {};\n',
        'tests/integration/banco.test.ts': 'export {};\n',
      },
      regra: (raiz) => fontesSemCompilado(raiz, fontesDaUnitaria(raiz)),
      precisaReprovar: true,
    },
    {
      nome: 'regra 2 (volta), isolada: compilado sem fonte -- ele ainda rodaria',
      arvore: { ...ARVORE_LIMPA, 'dist/_tests/src/modulo/morto.test.js': '' },
      regra: (raiz) => compiladosSemFonte(raiz),
      precisaReprovar: true,
    },
    {
      nome: 'descoberta vazia REPROVA: arvore sem nenhum `*.test.ts` na unitaria',
      arvore: { 'src/modulo/vivo.ts': 'export {};\n' },
      regra: (raiz) => (fontesDaUnitaria(raiz).length === 0 ? ['(nenhuma fonte)'] : []),
      precisaReprovar: true,
    },
  ];

  let falhas = 0;
  console.log(`autoteste do executor da suite unitaria (${String(casos.length)} casos de arvore)`);
  for (const caso of casos) {
    const raiz = mkdtempSync(join(tmpdir(), 'bichu-unitaria-'));
    try {
      montarArvore(raiz, caso.arvore);
      const achados = caso.regra(raiz);
      const reprovou = achados.length > 0;
      if (reprovou === caso.precisaReprovar) {
        console.log(`  [    ok   ] ${caso.nome}`);
      } else {
        falhas += 1;
        const esperado = caso.precisaReprovar ? 'REPROVAR' : 'aprovar';
        console.log(`  [ FALHOU  ] ${caso.nome}: precisava ${esperado}`);
        console.log(`               achou: ${achados.join(', ') || '(nada)'}`);
      }
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  }

  // A regra 3 nao tem arvore: ela le TAP. Dois casos, tambem isolados.
  const CAMINHO = 'dist/_tests/src/modulo/vazio.test.js';
  const tapDoVazio = `TAP version 13\n# Subtest: ${CAMINHO}\nok 1 - ${CAMINHO}\n1..1\n# tests 1\n# pass 1\n# fail 0\n`;
  const tapDoCheio = 'TAP version 13\n# Subtest: faz alguma coisa\nok 1 - faz alguma coisa\n1..1\n# tests 1\n# pass 1\n# fail 0\n';
  const casosDeTap = [
    ['regra 3, isolada: arquivo reportado com o nome do proprio caminho (zero caso)',
      arquivosSemCaso(tapDoVazio, [CAMINHO]).length > 0, true],
    ['regra 3, o outro lado: arquivo com caso de verdade nao e acusado',
      arquivosSemCaso(tapDoCheio, [CAMINHO]).length > 0, false],
    ['placar ausente REPROVA: relatorio sem `# tests`',
      placar('TAP version 13\n1..0\n').total === undefined, true],
  ];
  for (const [nome, reprovou, precisaReprovar] of casosDeTap) {
    if (reprovou === precisaReprovar) {
      console.log(`  [    ok   ] ${nome}`);
    } else {
      falhas += 1;
      console.log(`  [ FALHOU  ] ${nome}: precisava ${precisaReprovar ? 'REPROVAR' : 'aprovar'}`);
    }
  }

  if (falhas > 0) {
    // `console.log`, e nao `console.error`: misturar os dois fluxos fazia a
    // linha do veredito aparecer NO MEIO da lista de casos no log da esteira,
    // porque stdout e stderr drenam separado. Veredito fora de ordem e a
    // primeira coisa que faz alguem ler o log errado.
    console.log(
      `\nREPROVADO: ${String(falhas)} caso(s) de autoteste. O executor da suite unitaria deixou ` +
        'de enxergar o que ele existe para enxergar, e o verde dele parou de significar alguma coisa.\n',
    );
    return 1;
  }
  console.log('\nAPROVADO: cada regra reprova sozinha, e a arvore limpa passa');
  return 0;
}

// =========================================================================
// A SUITE DE VERDADE
// =========================================================================

function executar(argv) {
  const raiz = process.cwd();

  const semSuite = testesSemSuite(raiz);
  if (semSuite.length > 0) {
    morrer(
      `arquivo de teste que nenhuma suite roda: ${semSuite.join(', ')}. ` +
        `A unitaria varre \`${UNITARIA}/\` e a de integracao varre \`${INTEGRACAO}/\`; ` +
        'fora dessas duas arvores o arquivo nasce morto e nada acusa. Mova-o, ou ' +
        'acrescente a arvore nova a este executor.',
    );
  }

  const fontes = fontesDaUnitaria(raiz);
  if (fontes.length === 0) {
    morrer(
      `nenhum arquivo *.test.ts em ${UNITARIA}/. A suite unitaria nao tem o que rodar, e sair ` +
        'zero aqui seria anunciar cobertura que nao existe.',
    );
  }

  const semCompilado = fontesSemCompilado(raiz, fontes);
  if (semCompilado.length > 0) {
    morrer(
      `arquivo de teste sem contrapartida compilada em ${COMPILADO}/: ${semCompilado.join(', ')}. ` +
        'Ele NAO rodaria, e a suite terminaria verde com um caso a menos. A causa costuma ser o ' +
        '`include`/`exclude` do tsconfig.json, que tira o arquivo da compilacao sem tirar nada do ' +
        'repositorio.',
    );
  }

  const orfaos = compiladosSemFonte(raiz);
  if (orfaos.length > 0) {
    morrer(
      `${COMPILADO}/ tem teste unitario que nao existe mais na fonte: ${orfaos.join(', ')}. ` +
        'Ele ainda seria executado, e ninguem consegue ler o que ele testa. Apague ' +
        `${COMPILADO} e rode de novo.`,
    );
  }

  const caminhos = fontes.map((f) => join(COMPILADO, f.replace(/\.ts$/, '.js')));

  // `--lcov <arquivo>`: o job `sonar` precisa de lcov com `--enable-source-maps`.
  // Ele chamava `node --test ...` com os MESMOS argumentos copiados do
  // package.json, e o comentario de la registrava a consequencia: "se o script
  // `test` mudar de forma, esta linha fica medindo outra coisa". Com a bandeira
  // aqui, a forma e uma so e a copia deixa de existir.
  const indiceDoLcov = argv.indexOf('--lcov');
  const lcov = indiceDoLcov === -1 ? undefined : argv[indiceDoLcov + 1];
  if (indiceDoLcov !== -1 && (lcov === undefined || lcov.startsWith('-'))) {
    morrer('`--lcov` exige o caminho do arquivo de saida.');
  }

  console.log(`\nsuite unitaria: ${String(caminhos.length)} arquivos\n`);

  mkdirSync(dirname(join(raiz, RELATORIO)), { recursive: true });
  const argumentos = [];
  // SEM ESSA FLAG o lcov sai apontando para `dist/_tests/**/*.js`, o Sonar nao
  // casa nenhum arquivo, nao reclama, e publica 0% de cobertura.
  if (lcov !== undefined) argumentos.push('--enable-source-maps');
  argumentos.push(
    '--test',
    '--experimental-test-coverage',
    '--test-reporter=spec',
    '--test-reporter-destination=stdout',
    '--test-reporter=tap',
    `--test-reporter-destination=${RELATORIO}`,
  );
  if (lcov !== undefined) {
    argumentos.push('--test-reporter=lcov', `--test-reporter-destination=${lcov}`);
  }
  const execucao = spawnSync('node', [...argumentos, ...caminhos], { stdio: 'inherit' });

  if (!existsSync(join(raiz, RELATORIO))) {
    morrer(
      `o relatorio TAP nao foi escrito em ${RELATORIO}. Sem ele nao ha placar para conferir, ` +
        'e aprovar sem placar e exatamente o que este executor existe para impedir.',
    );
  }
  const tap = readFileSync(join(raiz, RELATORIO), 'utf8');

  // A copia do TAP para fora de `dist/`, para o acumulado de
  // `infra/suite/acumular-reprovados.mjs` conseguir le-la. ANTES do veredito:
  // copiar depois de `morrer()` registraria so as execucoes verdes, que e a
  // lista que nao serve para nada. Ausente a bandeira, nada muda.
  const indiceDoPlacar = argv.indexOf('--placar');
  const destinoDoPlacar = indiceDoPlacar === -1 ? undefined : argv[indiceDoPlacar + 1];
  if (indiceDoPlacar !== -1 && (destinoDoPlacar === undefined || destinoDoPlacar.startsWith('-'))) {
    morrer('`--placar` exige o caminho do diretorio de saida.');
  }
  if (destinoDoPlacar !== undefined) {
    mkdirSync(join(raiz, destinoDoPlacar), { recursive: true });
    writeFileSync(join(raiz, destinoDoPlacar, 'unitaria.tap'), tap);
    console.log(`copia do relatorio TAP em ${join(destinoDoPlacar, 'unitaria.tap')}`);
  }

  const { total, passaram, falharam } = placar(tap);
  if (total === undefined || passaram === undefined || falharam === undefined) {
    morrer(
      'o relatorio TAP nao trouxe o placar (`# tests`, `# pass`, `# fail`). Sem placar nao da ' +
        'para afirmar que a suite rodou, e aprovar sem afirmar e o defeito que este executor ' +
        'existe para impedir.',
    );
  }

  console.log(
    `\nplacar: ${String(total)} casos em ${String(caminhos.length)} arquivos, ` +
      `${String(passaram)} passaram, ${String(falharam)} falharam`,
  );

  // Por ARQUIVO, e nao pelo total. O runner do Node reporta o arquivo que nao
  // produziu nenhum caso como um teste aprovado com o nome do proprio caminho;
  // o total sobe do mesmo jeito, e um piso derivado do numero de arquivos
  // continuaria satisfeito enquanto os arquivos esvaziassem um a um.
  const vazios = arquivosSemCaso(tap, caminhos);
  if (vazios.length > 0) {
    morrer(
      `${String(vazios.length)} arquivo(s) de teste nao produziram NENHUM caso: ` +
        `${vazios.join(', ')}. O runner os reporta como um teste aprovado com o nome do proprio ` +
        'caminho, e eles inflam o total sem exercitar nada.',
    );
  }

  if (passaram === 0) {
    morrer('nenhum caso passou. Suite que nao executa nada sai zero, e zero aqui nao e aprovacao.');
  }
  if (falharam > 0 || execucao.status !== 0) {
    morrer(`${String(falharam)} caso(s) reprovaram.`);
  }

  console.log('suite unitaria: APROVADA');
  return 0;
}

const argv = process.argv.slice(2);
process.exit(argv.includes('--autoteste') ? autoteste() : executar(argv));
