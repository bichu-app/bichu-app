// Lint do site (web/). Ele NAO EXISTIA ate hoje, e a ausencia estava escrita
// como DIVIDA no `eslint.config.mjs` da raiz, que ignora `web/**`.
//
// A exclusao da raiz esta CERTA e continua: o site tem `package.json`,
// `tsconfig.json` e toolchain proprios (Astro, runtime de navegador), o servico
// de projeto da raiz nao conhece o tsconfig daqui, e `eslint .` da raiz sobre
// `web/` produzia mais de mil erros de parser. O que estava errado era o
// SILENCIO -- e ele foi medido, com um `console.log` plantado em
// `web/src/api/chamar.ts`:
//
//   `eslint .` na raiz                    exit 0, ZERO mensagens
//   `eslint web/src/api/chamar.ts`        exit 0 -- "File ignored because of a
//                                         matching ignore pattern" e WARNING
//   `make verificar-lint`                 exit 0
//
// E o mesmo desfecho que `admin/**` dava antes do PR #129, e o conserto e o
// dele: `verificar-lint` do `Makefile` passa a depender de
// `verificar-lint-do-site`, que roda o eslint de DENTRO de `web/`. Dois (agora
// tres) processos de eslint, cada um com a raiz de tsconfig do proprio config
// (`tsconfigRootDir` aponta para o diretorio deste arquivo) -- e por isso o
// parser nao morre. O que morreria e um unico `eslint .` cobrindo as tres
// arvores com o servico de projeto da raiz.
//
// A BASE E A DA CASA, de proposito: recomendado do ESLint,
// `recommendedTypeChecked` do typescript-eslint com servico de projeto, e
// analise sem tipo para `.mjs`. Mesmas versoes maiores que a raiz e o `admin/`
// (eslint 9, typescript-eslint 8), para nao haver tres gramaticas de lint neste
// repositorio.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.astro/**',
      'test-results/**',
      'tests/relatorio/**',
      // Gerado de `api/openapi.yaml` por `scripts/gerar-tipos-da-api.mjs`, do
      // mesmo jeito que `admin/` ignora o dele. O cabecalho diz NAO EDITE, e o
      // portao que vale sobre ele e `verify:api`, que REGERA e compara.
      'src/api/generated/**',
      // As iscas do varredor de valor solto: arvore de mentira que existe para
      // ser REPROVADA por `scripts/verificar-valores-soltos.mjs`. Lintar
      // fixture de defeito e cobrar qualidade de codigo que existe para estar
      // errado -- a raiz faz o mesmo com `infra/verificacao/iscas/**`.
      'tests/iscas/**',
      // ---------------------------------------------------------------------
      // `.astro` NAO ENTRA, E ISSO E UMA FRONTEIRA MEDIDA, NAO UM ESQUECIMENTO
      // ---------------------------------------------------------------------
      // Lintar `.astro` exige `eslint-plugin-astro` + `astro-eslint-parser`.
      // Consultado hoje: `eslint-plugin-astro@3.2.1` (e tambem o 2.x) declara
      // `peerDependencies: { eslint: '>=10.0.0', 'eslint-plugin-jsx-a11y':
      // '>=6.10.2', '@typescript-eslint/parser': '>=8.61.0' }`. A raiz e o
      // `admin/` estao em eslint 9; puxar o plugin poria o site em outra versao
      // MAIOR de eslint que os outros dois, mais dois pacotes novos. Trocar a
      // versao maior da ferramenta de lint do projeto nao e decisao de quem
      // esta fechando um silencio de portao.
      //
      // O QUE COBRE `.astro` HOJE, e por isso este vao nao e do tipo que este
      // trabalho conserta: `npm run check` (`astro check`) typecheca o
      // frontmatter dos 37 arquivos e ja esta em `make verificar-site` e no job
      // `web` da esteira. Ou seja: `.astro` tem portao, so nao tem REGRA DE
      // LINT. O caso de `web/**` na raiz era diferente -- ali nao havia portao
      // nenhum, e era por isso que o verde nao verificava.
      //
      // SE ALGUEM TROUXER O PLUGIN: apagar esta linha e acrescentar
      // `...astro.configs.recommended`; a contagem do alvo do `Makefile` sobe
      // de 46 para 83 e o numero de la precisa subir com ela.
      '**/*.astro',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },

  // O que roda no NAVEGADOR: `src/scripts/` e o que as paginas importam. Sem
  // isto, `document` e `window` reprovariam por `no-undef`.
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },

  // `src/middleware.ts`, `src/pages/*.ts` (robots.txt, sitemap.xml) e o
  // servidor rodam no Node da imagem, nao no navegador.
  {
    files: ['src/middleware.ts', 'src/pages/**/*.ts', 'servidor.mjs'],
    languageOptions: { globals: globals.node },
  },

  // `.mjs` nao esta no `tsconfig.json`, entao o servico de projeto nao os
  // encontra e o parser falharia antes de qualquer regra rodar. Eles continuam
  // lintados; o que sai e a analise com tipos, que nao se aplica a eles.
  // Mesmo arranjo da raiz e do `admin/`.
  {
    files: ['**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: globals.node },
  },

  // A suite de unidade e a de ponta a ponta rodam no Node.
  //
  // `no-floating-promises` SAI AQUI, e so aqui. `test()` do `node:test` devolve
  // uma promessa que o EXECUTOR possui: a forma documentada e chamar sem
  // `await`, e quem espera por ela e o `node --test`. Com a regra ligada as
  // 29 chamadas dos tres arquivos de unidade reprovavam -- 29 de 43 mensagens
  // da primeira execucao, todas pela mesma linha de `test('...', () => {`.
  // Escrever `void test(...)` 29 vezes seria dobrar o codigo a ferramenta.
  //
  // O QUE COBRE O QUE ELA COBRIRIA: promessa esquecida dentro de um caso faz o
  // caso passar sem rodar a assercao, e isso aparece na CONTAGEM -- a suite diz
  // quantos casos rodaram (`npm run test:unidade`), e o numero esta escrito no
  // alvo do `Makefile`. A regra continua valendo em `src/` inteiro, que e onde
  // promessa solta vira pagina errada para quem visita.
  {
    files: ['tests/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: { '@typescript-eslint/no-floating-promises': 'off' },
  },

  // `console` no codigo do site e vazamento para o navegador de quem visita, e
  // o painel ja proibia (`admin/eslint.config.mjs`). Medido antes de ligar:
  // `console.` nao aparece em `web/src/` em arquivo nenhum hoje, so em
  // `web/scripts/*.mjs`.
  {
    files: ['src/**/*.ts'],
    rules: { 'no-console': 'error' },
  },
  // `scripts/` sao CLI de portao -- `gerar-tokens-css.mjs`, `orcamento.mjs`,
  // `verificar-valores-soltos.mjs` e as iscas. IMPRIMIR E O TRABALHO DELES: o
  // veredito de um portao sai em `console.log`/`console.error`. Proibir ali
  // seria pedir que o portao ficasse calado.
  {
    files: ['scripts/**/*.mjs', 'tests/mock/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
);
