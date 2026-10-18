#!/usr/bin/env node
/* global console, process */
// A diretiva acima segue a convencao de `infra/verificacao/*.mjs` e de
// `infra/suite/*.mjs`: o ESLint deste repositorio nao declara os globais de
// Node para `**/*.mjs` fora de `src/`, entao `console` e `process`
// reprovariam em `no-undef`.
/**
 * PORTAO: ARQUIVO QUE PARECE TESTE E ESTA FORA DO ALCANCE DO EXECUTOR.
 *
 *   node infra/verificacao/verificar-teste-fora-do-alcance.mjs [--autoteste]
 *
 * =========================================================================
 * O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR
 * =========================================================================
 *
 * `admin/src/diretorio/dominio.test.ts` e `admin/src/formato/telefone.test.ts`
 * moravam sob `admin/src/`. Tinham cabecalho de isca, `describe`, `it` e
 * assercoes de verdade -- 24 casos. O `include` do vitest em
 * `admin/vite.config.ts` e `test/**\/*.test.{ts,tsx}`, ancorado em `admin/`.
 * Nenhum dos dois arquivos casava. Nunca rodaram. Moveram-se para
 * `admin/test/` e os 24 casos passaram no primeiro tiro: nao havia defeito
 * escondido, havia COBERTURA FALSA -- o pior dos dois, porque defeito
 * escondido ao menos aparece quando alguem roda o arquivo.
 *
 * A sessao que fez aquele conserto deixou escrito que "nada impede um proximo
 * teste de nascer orfao sob `admin/src/` outra vez -- nao ha portao para
 * isso". Este arquivo e esse portao.
 *
 * A metade da raiz do problema JA tinha portao: a regra 1 de
 * `infra/suite/executar-unitaria.mjs` varre da raiz e acusa `*.test.ts` fora
 * de `src/` e de `tests/integration/`. Mas o `NAO_VARRER` dela exclui
 * `admin/`, `web/` e `app/` -- de proposito, porque sao subprojetos com
 * executor proprio (ADR-0027, ADR-0028) e ela nao sabe o alcance deles. Os
 * dois orfaos do painel caiam exatamente nesse vao. Este portao fecha o vao:
 * ele conhece o alcance dos SETE executores e varre o repositorio INTEIRO.
 *
 * =========================================================================
 * A PROPRIEDADE, E POR QUE ELA NAO TEM NUMERO
 * =========================================================================
 *
 *   TODO arquivo com nome de teste que existe no disco e coletado por pelo
 *   menos UM executor.
 *
 * Nao ha piso de quantidade para alguem baixar no dia em que der trabalho. As
 * duas pontas -- a lista de arquivos e o alcance de cada executor -- saem do
 * disco, e se ajustam sozinhas a cada arquivo novo ou apagado.
 *
 * A varredura parte da RAIZ, e nao de uma lista de arvores permitidas. Uma
 * lista permitida erra justamente no caso que interessa: mover `admin/test/`
 * para `admin/testes/` tiraria os arquivos do `include` E da lista ao mesmo
 * tempo, e eles desapareceriam das duas pontas calados.
 *
 * =========================================================================
 * O ALCANCE MEDIDO DE CADA EXECUTOR (18/10/2026)
 * =========================================================================
 *
 * Medido lendo as configuracoes, nao presumido:
 *
 *   1. unitaria da raiz  `npm test` -> infra/suite/executar-unitaria.mjs
 *                        `src/**\/*.test.ts`, recursivo.
 *   2. integracao        `npm run test:integration`
 *                        `tests/integration/**\/*.test.ts`, recursivo.
 *   3. painel            `cd admin && vitest run`
 *                        `include: ['test/**\/*.test.{ts,tsx}']`, ancorado em
 *                        `admin/`. Recursivo. NAO alcanca `admin/src/`, e e
 *                        esse o defeito historico.
 *   4. site, unidade     `cd web && npm run test:unidade`
 *                        `node --experimental-strip-types --test
 *                        tests/unidade/*.test.ts`. O curinga e de UM NIVEL e e
 *                        expandido pelo shell: `web/tests/unidade/sub/x.test.ts`
 *                        NAO e coletado. Nao recursivo, e isto e medido, nao
 *                        suposto.
 *   5. site, ponta a ponta  `cd web && playwright test`
 *                        `testDir: 'tests/e2e'`, sufixo `.spec.ts`, recursivo.
 *   6. Cypress           `npx cypress run`
 *                        `cypress.config.ts` nao declara `specPattern`, entao
 *                        vale o padrao `cypress/e2e/**\/*.cy.{js,jsx,ts,tsx}`.
 *   7. app Flutter       `cd app && flutter test`
 *                        `app/test/**\/*_test.dart`, recursivo -- e SEM
 *                        atravessar link simbolico, que e a parte que importa
 *                        aqui (ver a secao da ponte, abaixo).
 *
 * =========================================================================
 * A PONTE DO app/test/a11y, E POR QUE ELA NAO PODE SER IGNORADA
 * =========================================================================
 *
 * `test/a11y/` mora na RAIZ do repositorio, ao lado de `design/tokens.json`,
 * porque a fonte dos tokens e unica e fica fora do pacote Flutter. Sao sete
 * `*_test.dart` em `test/a11y/`. `app/test/a11y` e um LINK SIMBOLICO para la.
 *
 * A descoberta automatica do `flutter test` nao atravessa link simbolico. Quem
 * faz esses sete arquivos rodarem e `app/test/a11y_suite_test.dart`, que os
 * importa um a um e os roda em `group()`. Uma varredura ingenua os acusaria
 * como orfaos -- sete falsos positivos no primeiro dia, e portao que acusa
 * quem esta certo e desligado na primeira semana.
 *
 * Entao a regra aqui e a regra DE VERDADE, e nao a aproximacao:
 *
 *   arquivo `*_test.dart` sob o alvo de um link simbolico de `app/test/` e
 *   alcancado SE, E SOMENTE SE, alguma ponte de `app/test/` o importa pelo
 *   nome.
 *
 * Arquivo novo em `test/a11y/` que ninguem registrou na ponte e orfao de
 * verdade, e ESTE portao o acusa -- offline, sem Flutter, em milissegundos.
 * `a11y_suite_test.dart` ja tem uma guarda propria para isso, mas ela so fala
 * quando `flutter test` roda, que exige o SDK; aqui a mesma propriedade e
 * cobrada no conjunto rapido.
 *
 * =========================================================================
 * CONFIGURACAO QUE MUDA: ELE REPROVA PEDINDO REVISAO, NAO ADIVINHA
 * =========================================================================
 *
 * O alcance acima foi MEDIDO contra textos exatos. Se alguem mexer no
 * `include` do vitest, no script `test:unidade`, no `testDir` do Playwright ou
 * no `specPattern` do Cypress, este portao para de saber o alcance de verdade.
 *
 * Nesse caso ele NAO estica a regra e NAO chuta: ele REPROVA dizendo que a
 * configuracao mudou e que a medicao precisa ser refeita por gente. Portao que
 * chuta e pior do que portao ausente, porque o verde dele e lido como resposta.
 *
 * Mudar o alcance de um executor nao e conserto, e decisao: `include` mais
 * largo acorda teste quebrado. Por isso este portao nunca mexe em
 * configuracao, so a confere.
 *
 * =========================================================================
 * O QUE ELE **NAO** FAZ -- dito em voz alta, e nao implicito na ausencia
 * =========================================================================
 *
 *   1. **Teste cego.** Assercao que nao pode falhar -- `findsNothing` sobre
 *      texto que a tela nao diz mais, rotulo de semantica vazio, assercao
 *      verdadeira por vacuidade. Isto e analise semantica, nao varredura de
 *      arquivo, e um portao que tenta e erra vira ruido que alguem desliga.
 *      Fica de fora de proposito.
 *   2. **Caso que passa vazio.** Zero aparelho registrado, laco sobre colecao
 *      vazia. Para a unitaria da raiz, a regra 3 de
 *      `infra/suite/executar-unitaria.mjs` ja pega o arquivo que nao produziu
 *      NENHUM caso, lendo o TAP. Dentro do arquivo, caso a caso, nada pega.
 *   3. **Caso que morre no `before`.** Exige executar. Este portao le disco.
 *   4. **Cabecalho que afirma cobrir o que nao cobre.** Prosa contra conduta:
 *      semantico.
 *   5. **O estreitamento por projeto do Playwright.** Os tres projetos de
 *      `web/playwright.config.ts` tem `testMatch`/`testIgnore` proprios. Este
 *      portao cobra o `testDir`, e nao a uniao dos projetos: um `.spec.ts`
 *      dentro de `tests/e2e/` que NENHUM projeto casasse passaria por aqui.
 *      Medido em 18/10/2026, os seis arquivos de hoje sao cobertos por pelo
 *      menos um projeto. A ideia esta registrada na entrega como proxima
 *      rodada, e nao como esquecimento.
 *
 * =========================================================================
 * AUTOTESTE
 * =========================================================================
 *
 * `--autoteste` monta arvores descartaveis em diretorio temporario -- com link
 * simbolico e ponte de verdade, no caso do app -- e exige que cada regra
 * REPROVE sozinha, mais um contrapeso limpo que precisa APROVAR. Um caso por
 * regra, e nenhuma cadeia `if/elif/else`: numa cadeia o `else` recolhe o que os
 * ramos deixam cair, e uma isca que reprova por DOIS motivos deixa o autoteste
 * verde no dia em que a regra que ela testava for desligada.
 *
 * Roda offline, sem npm, sem Docker, sem Flutter, em milissegundos.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * Sufixos que fazem um arquivo PARECER teste. Medidos no repositorio: hoje
 * existem `.test.ts`, `.test.tsx`, `_test.dart`, `.spec.ts` e `.cy.ts`. Os
 * primos (`.test.js`, `.spec.mjs`, `.cy.jsx`, ...) entram tambem, para que um
 * arquivo novo na forma que ainda nao foi usada tambem seja cobrado -- e nao
 * nasca orfao justamente porque ninguem tinha usado aquela extensao antes.
 */
const SUFIXOS_DE_TESTE = [
  '.test.ts',
  '.test.tsx',
  '.test.js',
  '.test.jsx',
  '.test.mjs',
  '.test.cjs',
  '.spec.ts',
  '.spec.tsx',
  '.spec.js',
  '.spec.jsx',
  '.spec.mjs',
  '.spec.cjs',
  '.cy.ts',
  '.cy.tsx',
  '.cy.js',
  '.cy.jsx',
  '_test.dart',
];

/**
 * Diretorios em que a varredura NAO entra.
 *
 * Nenhum deles hospeda fonte de teste que alguem espere rodar: `node_modules`
 * e dependencia; `dist`, `build`, `.dart_tool` e `coverage` sao saida de build
 * (e `dist/_tests/` esta cheio de `*.test.js` COMPILADO, que e justamente o
 * que nao se deve contar duas vezes); `docs/`, `.jarvis/`, `workspace/` e
 * `backup/` nao vao para o git e sao rascunho de sessao.
 */
const NAO_VARRER = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.dart_tool',
  '.jarvis',
  'docs',
  'workspace',
  'backup',
]);

/**
 * Os sete executores, com o alcance MEDIDO de cada um.
 *
 * `raiz` e relativa a raiz do repositorio. `recursivo: false` quer dizer
 * curinga de UM nivel -- o do shell, em `web`. `conferencia` e o texto exato da
 * configuracao contra o qual o alcance foi medido: mudou o texto, o portao
 * reprova pedindo revisao em vez de continuar afirmando um alcance velho.
 */
const EXECUTORES = [
  {
    nome: 'unitaria da raiz',
    comando: 'npm test (infra/suite/executar-unitaria.mjs)',
    raiz: 'src',
    sufixos: ['.test.ts'],
    recursivo: true,
  },
  {
    nome: 'integracao da raiz',
    comando: 'npm run test:integration',
    raiz: join('tests', 'integration'),
    sufixos: ['.test.ts'],
    recursivo: true,
  },
  {
    nome: 'painel (admin/)',
    comando: 'cd admin && vitest run',
    raiz: join('admin', 'test'),
    sufixos: ['.test.ts', '.test.tsx'],
    recursivo: true,
    conferencia: {
      arquivo: join('admin', 'vite.config.ts'),
      trecho: "include: ['test/**/*.test.{ts,tsx}']",
      porque: "o `include` do vitest do painel. E ele que deixava `admin/src/**/*.test.ts` de fora.",
    },
  },
  {
    nome: 'site, unidade (web/)',
    comando: 'cd web && npm run test:unidade',
    raiz: join('web', 'tests', 'unidade'),
    sufixos: ['.test.ts'],
    recursivo: false,
    conferencia: {
      arquivo: join('web', 'package.json'),
      trecho: 'node --experimental-strip-types --test tests/unidade/*.test.ts',
      porque: 'o script `test:unidade` do site. O curinga e de UM nivel: subdiretorio nao entra.',
    },
  },
  {
    nome: 'site, ponta a ponta (web/)',
    comando: 'cd web && playwright test',
    raiz: join('web', 'tests', 'e2e'),
    sufixos: ['.spec.ts'],
    recursivo: true,
    conferencia: {
      arquivo: join('web', 'playwright.config.ts'),
      trecho: "testDir: 'tests/e2e'",
      porque: 'o `testDir` do Playwright do site.',
    },
  },
  {
    nome: 'ponta a ponta do Cypress',
    comando: 'npx cypress run',
    raiz: join('cypress', 'e2e'),
    sufixos: ['.cy.ts', '.cy.tsx', '.cy.js', '.cy.jsx'],
    recursivo: true,
  },
  {
    nome: 'app Flutter (app/)',
    comando: 'cd app && flutter test',
    raiz: join('app', 'test'),
    sufixos: ['_test.dart'],
    recursivo: true,
  },
];

/**
 * `cypress.config.ts` nao pode declarar `specPattern`: o alcance 6 acima e o
 * PADRAO do Cypress, e um `specPattern` proprio o substituiria calado.
 */
const CYPRESS_CONFIG = 'cypress.config.ts';

/** Onde vivem as pontes que importam teste de tras de link simbolico. */
const RAIZ_DO_APP = join('app', 'test');

function morrer(mensagem) {
  console.error(`\nREPROVADO: ${mensagem}\n`);
  process.exit(1);
}

/** Verdadeiro quando o nome do arquivo tem cara de teste. */
function pareceTeste(nome) {
  return SUFIXOS_DE_TESTE.some((s) => nome.endsWith(s));
}

/**
 * Todo arquivo com cara de teste sob `raiz`, em caminho relativo a `raiz`.
 *
 * NAO atravessa link simbolico, por duas razoes independentes: e o
 * comportamento do `flutter test`, que e o que precisa ser reproduzido fielmente
 * aqui; e sem isso `app/test/a11y` faria os sete arquivos de `test/a11y/`
 * aparecerem DUAS vezes na varredura da raiz.
 */
function varrerTestes(raiz, pular = new Set()) {
  if (!existsSync(raiz)) return [];
  const saida = [];
  const andar = (dir) => {
    for (const nome of readdirSync(dir).sort()) {
      if (pular.has(nome)) continue;
      const caminho = join(dir, nome);
      const estado = lstatSync(caminho);
      if (estado.isSymbolicLink()) continue;
      if (estado.isDirectory()) andar(caminho);
      else if (estado.isFile() && pareceTeste(nome)) saida.push(relative(raiz, caminho));
    }
  };
  andar(raiz);
  return saida.sort();
}

/**
 * Os links simbolicos de diretorio de `app/test/`, com o alvo em caminho
 * relativo a raiz.
 *
 * A raiz passa por `realpathSync` antes do `relative`, e NAO e um detalhe: no
 * macOS `tmpdir()` devolve `/var/folders/...`, que e ele mesmo um link para
 * `/private/var/folders/...`. Sem normalizar as duas pontas, o alvo do link saia
 * como `../../../private/var/...`, nao casava com o caminho varrido da raiz, e o
 * portao acusava como orfaos justamente os sete arquivos que a ponte roda. O
 * contrapeso do autoteste pegou isso.
 */
function linksDoApp(raizDoRepo) {
  const base = join(raizDoRepo, RAIZ_DO_APP);
  if (!existsSync(base)) return [];
  const raizReal = realpathSync(raizDoRepo);
  const saida = [];
  for (const nome of readdirSync(base).sort()) {
    const caminho = join(base, nome);
    if (!lstatSync(caminho).isSymbolicLink()) continue;
    const alvo = resolve(dirname(caminho), readlinkSync(caminho));
    if (!existsSync(alvo) || !lstatSync(realpathSync(alvo)).isDirectory()) continue;
    saida.push({ nome, alvo: relative(raizReal, realpathSync(alvo)) });
  }
  return saida;
}

/** Tudo que as pontes de `app/test/` importam, como texto dos especificadores. */
function importesDasPontes(raizDoRepo) {
  const base = join(raizDoRepo, RAIZ_DO_APP);
  if (!existsSync(base)) return '';
  let texto = '';
  for (const nome of readdirSync(base)) {
    const caminho = join(base, nome);
    if (lstatSync(caminho).isSymbolicLink()) continue;
    if (!lstatSync(caminho).isFile() || !nome.endsWith('_test.dart')) continue;
    texto += readFileSync(caminho, 'utf8');
  }
  return texto;
}

// =========================================================================
// AS REGRAS, EM FUNCOES PURAS -- e o autoteste chama estas mesmas.
// =========================================================================

/**
 * Regra 1. Arquivo com cara de teste que nenhum executor coleta.
 *
 * Devolve os caminhos orfaos, relativos a raiz do repositorio. Lista vazia e
 * aprovacao.
 */
function testesForaDoAlcance(raizDoRepo) {
  const noDisco = varrerTestes(raizDoRepo, NAO_VARRER);

  /** Os que algum executor coleta direto, pelo caminho. */
  const alcancados = new Set();
  for (const executor of EXECUTORES) {
    const prefixo = `${executor.raiz}/`;
    for (const caminho of noDisco) {
      if (!caminho.startsWith(prefixo)) continue;
      if (!executor.sufixos.some((s) => caminho.endsWith(s))) continue;
      if (!executor.recursivo && dirname(caminho) !== executor.raiz) continue;
      alcancados.add(caminho);
    }
  }

  // E os que chegam ao `flutter test` por tras de um link simbolico de
  // `app/test/`, SE, E SOMENTE SE, uma ponte os importa pelo nome.
  const pontes = importesDasPontes(raizDoRepo);
  for (const { nome, alvo } of linksDoApp(raizDoRepo)) {
    for (const interno of varrerTestes(join(raizDoRepo, alvo))) {
      if (!interno.endsWith('_test.dart')) continue;
      if (!pontes.includes(`${nome}/${interno}`)) continue;
      alcancados.add(join(alvo, interno));
    }
  }

  return noDisco.filter((c) => !alcancados.has(c));
}

/**
 * Regra 2. A configuracao contra a qual o alcance foi medido ainda e a que esta
 * no disco.
 *
 * Devolve as queixas. Lista vazia e aprovacao. Esta regra NAO adivinha alcance
 * novo: ela reprova pedindo revisao.
 */
function configuracoesQueMudaram(raizDoRepo) {
  const queixas = [];
  for (const executor of EXECUTORES) {
    const { conferencia } = executor;
    if (conferencia === undefined) continue;
    const caminho = join(raizDoRepo, conferencia.arquivo);
    if (!existsSync(caminho)) {
      queixas.push(`${conferencia.arquivo} nao existe mais, e era de la que saia o alcance de "${executor.nome}"`);
      continue;
    }
    if (readFileSync(caminho, 'utf8').includes(conferencia.trecho)) continue;
    queixas.push(
      `${conferencia.arquivo} nao tem mais \`${conferencia.trecho}\` -- ${conferencia.porque} ` +
        `O alcance de "${executor.nome}" foi medido contra esse texto e nao pode mais ser afirmado`,
    );
  }

  const cypress = join(raizDoRepo, CYPRESS_CONFIG);
  if (existsSync(cypress) && readFileSync(cypress, 'utf8').includes('specPattern')) {
    queixas.push(
      `${CYPRESS_CONFIG} passou a declarar \`specPattern\`, e o alcance do Cypress aqui e o PADRAO ` +
        '`cypress/e2e/**/*.cy.{js,jsx,ts,tsx}`. Um padrao proprio o substitui calado',
    );
  }
  return queixas;
}

// =========================================================================
// AUTOTESTE. Um caso por regra, sem cadeia, mais o contrapeso que aprova.
// =========================================================================

function montarArvore(raiz, arquivos, links = {}) {
  for (const [caminho, conteudo] of Object.entries(arquivos)) {
    const destino = join(raiz, caminho);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, conteudo);
  }
  for (const [caminho, alvo] of Object.entries(links)) {
    const destino = join(raiz, caminho);
    mkdirSync(dirname(destino), { recursive: true });
    symlinkSync(alvo, destino);
  }
}

/** As configuracoes que a regra 2 confere, no texto exato de hoje. */
const CONFIGS_BOAS = {
  'admin/vite.config.ts': "    test: { include: ['test/**/*.test.{ts,tsx}'] },\n",
  'web/package.json':
    '{ "scripts": { "test:unidade": "node --experimental-strip-types --test tests/unidade/*.test.ts" } }\n',
  'web/playwright.config.ts': "export default defineConfig({ testDir: 'tests/e2e' });\n",
  'cypress.config.ts': 'export default defineConfig({ e2e: { supportFile: false } });\n',
};

/**
 * O CONTRAPESO: um arquivo no lugar certo de cada um dos sete executores, mais
 * a ponte do app com o link simbolico de verdade. Isto PRECISA aprovar -- sem
 * ele, as iscas poderiam estar reprovando por qualquer coisa.
 */
const ARVORE_LIMPA = {
  ...CONFIGS_BOAS,
  'src/modulo/vivo.test.ts': 'export {};\n',
  'tests/integration/banco.test.ts': 'export {};\n',
  'admin/test/formato/dinheiro.test.ts': 'export {};\n',
  'admin/test/entrar.test.tsx': 'export {};\n',
  'web/tests/unidade/textos.test.ts': 'export {};\n',
  'web/tests/e2e/conta.spec.ts': 'export {};\n',
  'cypress/e2e/fumaca.cy.ts': 'export {};\n',
  'app/test/widget_test.dart': 'void main() {}\n',
  'test/a11y/alvo_de_toque_test.dart': 'void main() {}\n',
  'app/test/a11y_suite_test.dart': "import 'a11y/alvo_de_toque_test.dart' as alvo;\nvoid main() { alvo.main(); }\n",
};

const LINKS_LIMPOS = { 'app/test/a11y': '../../test/a11y' };

function autoteste() {
  const casos = [
    {
      nome: 'o CONTRAPESO aprova: um teste no lugar certo de cada um dos sete executores',
      arvore: ARVORE_LIMPA,
      links: LINKS_LIMPOS,
      regra: (raiz) => [...testesForaDoAlcance(raiz), ...configuracoesQueMudaram(raiz)],
      precisaReprovar: false,
    },
    {
      // A ISCA HISTORICA, na forma exata dos dois orfaos do painel.
      nome: 'isca, regra 1: `*.test.ts` sob `admin/src/` -- o defeito que custou os 24 casos',
      arvore: { ...ARVORE_LIMPA, 'admin/src/formato/telefone.test.ts': 'export {};\n' },
      links: LINKS_LIMPOS,
      regra: (raiz) => testesForaDoAlcance(raiz),
      precisaReprovar: true,
    },
    {
      nome: 'isca, regra 1: `.test.tsx` sob `admin/src/` tambem (o `include` tem as duas extensoes)',
      arvore: { ...ARVORE_LIMPA, 'admin/src/paginas/lista.test.tsx': 'export {};\n' },
      links: LINKS_LIMPOS,
      regra: (raiz) => testesForaDoAlcance(raiz),
      precisaReprovar: true,
    },
    {
      // O curinga do shell e de UM nivel. Subdiretorio nao entra, e isto foi
      // medido no script `test:unidade`, nao suposto.
      nome: 'isca, regra 1: teste em subdiretorio de `web/tests/unidade/`, que o curinga nao alcanca',
      arvore: { ...ARVORE_LIMPA, 'web/tests/unidade/sub/telas.test.ts': 'export {};\n' },
      links: LINKS_LIMPOS,
      regra: (raiz) => testesForaDoAlcance(raiz),
      precisaReprovar: true,
    },
    {
      // Diretorio certo, sufixo que o `include` do vitest NAO casa.
      nome: 'isca, regra 1: `.spec.ts` em `admin/test/`, que o `include` do vitest nao casa',
      arvore: { ...ARVORE_LIMPA, 'admin/test/rotas.spec.ts': 'export {};\n' },
      links: LINKS_LIMPOS,
      regra: (raiz) => testesForaDoAlcance(raiz),
      precisaReprovar: true,
    },
    {
      // O caso que uma lista de arvores permitidas NAO pegaria.
      nome: 'isca, regra 1: arvore de teste inteira renomeada para fora de todo alcance',
      arvore: { ...ARVORE_LIMPA, 'ferramentas/movido.test.ts': 'export {};\n' },
      links: LINKS_LIMPOS,
      regra: (raiz) => testesForaDoAlcance(raiz),
      precisaReprovar: true,
    },
    {
      // A ponte: arquivo no disco de `test/a11y/` e fora dos imports. O
      // `flutter test` nao atravessa o link, entao ele nao roda.
      nome: 'isca, regra 1: `*_test.dart` em `test/a11y/` que a ponte do app nao importa',
      arvore: { ...ARVORE_LIMPA, 'test/a11y/contraste_texto_test.dart': 'void main() {}\n' },
      links: LINKS_LIMPOS,
      regra: (raiz) => testesForaDoAlcance(raiz),
      precisaReprovar: true,
    },
    {
      // O outro lado da ponte: sem o link, `test/a11y/` nao chega a ninguem.
      nome: 'isca, regra 1: o link simbolico `app/test/a11y` desaparece e a suite de a11y fica orfa',
      arvore: ARVORE_LIMPA,
      links: {},
      regra: (raiz) => testesForaDoAlcance(raiz),
      precisaReprovar: true,
    },
    {
      nome: 'o outro lado da ponte: COM o link e COM o import, o arquivo de `test/a11y/` nao e acusado',
      arvore: ARVORE_LIMPA,
      links: LINKS_LIMPOS,
      regra: (raiz) => testesForaDoAlcance(raiz).filter((c) => c.startsWith('test/a11y/')),
      precisaReprovar: false,
    },
    {
      nome: 'isca, regra 2: o `include` do painel mudou -- reprova pedindo revisao, nao adivinha',
      arvore: { ...ARVORE_LIMPA, 'admin/vite.config.ts': "    test: { include: ['**/*.test.{ts,tsx}'] },\n" },
      links: LINKS_LIMPOS,
      regra: (raiz) => configuracoesQueMudaram(raiz),
      precisaReprovar: true,
    },
    {
      nome: 'isca, regra 2: o script `test:unidade` do site mudou de curinga',
      arvore: {
        ...ARVORE_LIMPA,
        'web/package.json':
          '{ "scripts": { "test:unidade": "node --experimental-strip-types --test tests/unidade/**/*.test.ts" } }\n',
      },
      links: LINKS_LIMPOS,
      regra: (raiz) => configuracoesQueMudaram(raiz),
      precisaReprovar: true,
    },
    {
      nome: 'isca, regra 2: o `testDir` do Playwright do site mudou',
      arvore: { ...ARVORE_LIMPA, 'web/playwright.config.ts': "export default defineConfig({ testDir: 'tests' });\n" },
      links: LINKS_LIMPOS,
      regra: (raiz) => configuracoesQueMudaram(raiz),
      precisaReprovar: true,
    },
    {
      nome: 'isca, regra 2: o Cypress passou a declarar `specPattern` proprio',
      arvore: {
        ...ARVORE_LIMPA,
        'cypress.config.ts': "export default defineConfig({ e2e: { specPattern: 'e2e/**/*.ts' } });\n",
      },
      links: LINKS_LIMPOS,
      regra: (raiz) => configuracoesQueMudaram(raiz),
      precisaReprovar: true,
    },
    {
      nome: 'descoberta vazia REPROVA: arvore sem nenhum arquivo com cara de teste',
      arvore: CONFIGS_BOAS,
      links: {},
      regra: (raiz) => (varrerTestes(raiz, NAO_VARRER).length === 0 ? ['(nenhum arquivo de teste no disco)'] : []),
      precisaReprovar: true,
    },
    {
      nome: 'o que nao se varre nao se acusa: `*.test.js` COMPILADO em dist/ passa liso',
      arvore: { ...ARVORE_LIMPA, 'dist/_tests/src/modulo/vivo.test.js': '' },
      links: LINKS_LIMPOS,
      regra: (raiz) => testesForaDoAlcance(raiz),
      precisaReprovar: false,
    },
  ];

  let falhas = 0;
  console.log(`autoteste do portao de teste fora do alcance (${String(casos.length)} casos de arvore)`);
  for (const caso of casos) {
    const raiz = mkdtempSync(join(tmpdir(), 'bichu-fora-do-alcance-'));
    try {
      montarArvore(raiz, caso.arvore, caso.links);
      const achados = caso.regra(raiz);
      const reprovou = achados.length > 0;
      if (reprovou === caso.precisaReprovar) {
        console.log(`  [    ok   ] ${caso.nome}`);
      } else {
        falhas += 1;
        console.log(`  [ FALHOU  ] ${caso.nome}: precisava ${caso.precisaReprovar ? 'REPROVAR' : 'aprovar'}`);
        console.log(`               achou: ${achados.join(', ') || '(nada)'}`);
      }
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  }

  if (falhas > 0) {
    // `console.log`, e nao `console.error`: misturar os dois fluxos faz a linha
    // do veredito aparecer NO MEIO da lista de casos no log da esteira, porque
    // stdout e stderr drenam separado.
    console.log(
      `\nREPROVADO: ${String(falhas)} caso(s) de autoteste. O portao deixou de enxergar o arquivo de ` +
        'teste que nenhum executor coleta, e o verde dele parou de significar alguma coisa.\n',
    );
    return 1;
  }
  console.log('\nAPROVADO: cada isca reprova sozinha, e o contrapeso dos sete executores passa');
  return 0;
}

// =========================================================================
// A VARREDURA DE VERDADE
// =========================================================================

function executar(raizDoRepo) {
  // As iscas rodam ANTES da varredura. Portao cego varrendo o repositorio
  // inteiro imprime "APROVADO" com a mesma cara de quando esta enxergando.
  if (autoteste() !== 0) return 1;

  const mudaram = configuracoesQueMudaram(raizDoRepo);
  if (mudaram.length > 0) {
    console.error(`\nREPROVADO: ${String(mudaram.length)} configuracao(oes) de executor mudaram.\n`);
    for (const queixa of mudaram) console.error(`  - ${queixa}`);
    console.error(
      '\nEste portao NAO adivinha alcance novo: ele reprova pedindo revisao, porque portao que ' +
        'chuta e pior do que portao ausente. Confira o alcance de verdade, atualize EXECUTORES em ' +
        'infra/verificacao/verificar-teste-fora-do-alcance.mjs e rode o autoteste. Mudar o alcance ' +
        'de um executor nao e conserto, e decisao: `include` mais largo acorda teste quebrado.\n',
    );
    return 1;
  }

  const noDisco = varrerTestes(raizDoRepo, NAO_VARRER);
  if (noDisco.length === 0) {
    morrer(
      'nenhum arquivo com cara de teste no repositorio. Varredura que nao acha nada aprovaria ' +
        'qualquer coisa, e e exatamente o silencio que este portao existe para impedir.',
    );
  }

  const orfaos = testesForaDoAlcance(raizDoRepo);

  console.log(
    `\nportao de teste fora do alcance: ${String(noDisco.length)} arquivos com cara de teste, ` +
      `${String(EXECUTORES.length)} executores\n`,
  );
  for (const executor of EXECUTORES) {
    const quantos = noDisco.filter(
      (c) =>
        c.startsWith(`${executor.raiz}/`) &&
        executor.sufixos.some((s) => c.endsWith(s)) &&
        (executor.recursivo || dirname(c) === executor.raiz),
    ).length;
    const curinga = executor.recursivo ? '**/*' : '*';
    console.log(
      `  ${String(quantos).padStart(3)} em ${executor.raiz}/${curinga}{${executor.sufixos.join(',')}}` +
        `  -- ${executor.nome} (${executor.comando})`,
    );
  }
  const pontes = importesDasPontes(raizDoRepo);
  for (const { nome, alvo } of linksDoApp(raizDoRepo)) {
    const ligados = varrerTestes(join(raizDoRepo, alvo)).filter((c) => pontes.includes(`${nome}/${c}`));
    console.log(
      `  ${String(ligados.length).padStart(3)} em ${alvo}/  -- por tras do link ${RAIZ_DO_APP}/${nome}, ` +
        'ligados por ponte em app/test/*_test.dart',
    );
  }

  if (orfaos.length > 0) {
    console.error(
      `\nREPROVADO: ${String(orfaos.length)} arquivo(s) com cara de teste que NENHUM executor coleta.\n`,
    );
    for (const caminho of orfaos) console.error(`  - ${caminho}`);
    console.error(
      '\nCada um desses tem `describe`/`it`/`test` e assercoes, conta como cobertura na cabeca de quem ' +
        'le, e nao roda. Nao e defeito escondido, e COBERTURA FALSA -- pior, porque defeito escondido ' +
        'ao menos aparece quando alguem roda o arquivo. Mova-o para dentro do alcance do executor da ' +
        'superficie dele (as arvores estao listadas acima), ou, se o alcance e que esta errado, LEVE A ' +
        'DECISAO: `include` mais largo acorda teste quebrado e isso nao se decide de passagem.\n',
    );
    return 1;
  }

  console.log(`\nAPROVADO: os ${String(noDisco.length)} arquivos com cara de teste sao todos coletados`);
  return 0;
}

const raiz = process.argv[2] === undefined || process.argv[2].startsWith('--') ? process.cwd() : process.argv[2];
process.exit(process.argv.includes('--autoteste') ? autoteste() : executar(raiz));
