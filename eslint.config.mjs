// Fiacao do ESLint. O CONTEUDO das regras esta em `src/architecture.rules.mjs`,
// que e da arquitetura; este arquivo so as liga na ferramenta.
//
// Enquanto este arquivo nao existia, quatro regras da arquitetura estavam
// documentadas e NAO impostas: fronteira de modulo, pureza de dominio,
// confinamento de SDK de provedor e proibicao de `Date.now()`. Regra que
// depende de disciplina humana nao e regra: e torcida. docs/07-devops.md 5.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import regras from './src/architecture.rules.mjs';

const {
  MODULES,
  moduleBoundaries,
  domainPurity,
  providerSdkConfinement,
  injectableClock,
} = regras;

/**
 * Fronteira de modulo: um modulo so enxerga `ports/` de outro.
 *
 * Gera um bloco por modulo em vez de uma regra generica porque o ESLint nao
 * expressa "qualquer modulo menos o meu" num padrao so. A lista vem de
 * `MODULES`, entao acrescentar um modulo la basta: esta fiacao acompanha.
 */
const fronteiraDeModulo = MODULES.map((mod) => ({
  files: [`src/modules/${mod}/**/*.ts`],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: MODULES.filter((outro) => outro !== mod).flatMap((outro) => [
        {
          group: [
            `**/modules/${outro}/domain/**`,
            `**/modules/${outro}/application/**`,
            `**/modules/${outro}/adapters/**`,
            `**/modules/${outro}/persistence/**`,
          ],
          message: moduleBoundaries.message,
        },
      ]),
    }],
  },
}));

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'src/shared/types/generated/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },

  // --- Confinamento de SDK de provedor -----------------------------------
  // Vale em `src/` inteiro; a excecao e adapters/external, liberada abaixo.
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: providerSdkConfinement.packages.flatMap((p) => [p, `${p}/**`]),
          message: providerSdkConfinement.message,
        }],
      }],
    },
  },
  {
    files: [`${providerSdkConfinement.allowedOnly.replace(/\[\^\/\]\+/g, '*')}**/*.ts`],
    rules: { 'no-restricted-imports': 'off' },
  },

  // --- Fronteira entre modulos -------------------------------------------
  ...fronteiraDeModulo,

  // --- Pureza do dominio --------------------------------------------------
  // O dominio nao conhece framework, banco, HTTP nem nuvem. `import` de ORM
  // dentro de regra de negocio e violacao estrutural, nao estilo.
  {
    files: ['src/modules/*/domain/**/*.ts', 'src/modules/*/application/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: domainPurity.forbiddenPackages.flatMap((p) => [p, `${p}/**`]),
          message: domainPurity.message,
        }],
      }],
      // --- Relogio injetavel -------------------------------------------
      // A excecao e UM arquivo, declarada por caminho e liberada abaixo, e
      // nao por comentario de supressao: comentario ancora numa linha, o
      // formatador move a linha, e a supressao deixa de cobrir o que deveria
      // sem ninguem alterar regra nem codigo.
      'no-restricted-syntax': ['error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: injectableClock.message,
        },
        {
          selector: "NewExpression[callee.name='Date']",
          message: injectableClock.message,
        },
      ],
    },
  },
  {
    files: [injectableClock.soleException],
    rules: { 'no-restricted-syntax': 'off' },
  },

  // --- Ferramenta e teste -------------------------------------------------
  {
    files: ['tests/**/*.ts', '**/*.test.ts'],
    rules: { '@typescript-eslint/no-unsafe-assignment': 'off' },
  },
  {
    files: ['tests/portabilidade/**'],
    // As iscas do portao de portabilidade existem para conter defeito de
    // proposito. Reprova-las aqui seria pedir que fossem corrigidas, e
    // corrigi-las cega o portao. Ver docs/07-devops.md 3.6.
    rules: { 'no-restricted-imports': 'off', 'no-restricted-syntax': 'off' },
  },
);
