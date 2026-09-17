// Fiacao do ESLint. O CONTEUDO das regras esta em `src/architecture.rules.mjs`,
// que e da arquitetura; este arquivo so as liga na ferramenta.
//
// Enquanto este arquivo nao existia, quatro regras da arquitetura estavam
// documentadas e NAO impostas: fronteira de modulo, pureza de dominio,
// confinamento de SDK de provedor e proibicao de `Date.now()`. Regra que
// depende de disciplina humana nao e regra: e torcida. docs/07-devops.md 5.

import path from 'node:path';

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

const RAIZ_DOS_MODULOS = path.resolve(import.meta.dirname, moduleBoundaries.root);

/**
 * Onde um caminho ABSOLUTO mora: `{ modulo, camada }`, ou `null` se ele nao
 * esta sob `src/modules/`.
 *
 * Esta funcao e o ponto inteiro da regra. A versao anterior usava
 * `no-restricted-imports`, que casa o TEXTO do import contra um glob. O texto
 * que alguem escreve de verdade saindo de `pets/adapters/` e
 * `../../identity/domain/x.js`, sem a palavra `modules` em lugar nenhum, entao
 * o glob `**\/modules/identity/domain/**` nao casava e a fronteira so pegava a
 * forma que ninguem escreve. Aqui o caminho e resolvido primeiro e comparado
 * por componente, nunca por prefixo de texto.
 */
function localizar(absoluto) {
  const relativo = path.relative(RAIZ_DOS_MODULOS, absoluto);
  if (relativo === '' || relativo.startsWith('..') || path.isAbsolute(relativo)) {
    return null;
  }
  const partes = relativo.split(path.sep);
  if (partes.length < 2) return null;
  return { modulo: partes[0], camada: partes[1] };
}

/**
 * Fronteira de modulo: um modulo so enxerga `ports/` de outro.
 *
 * Uma regra so, sem gerar um bloco por modulo: o modulo de origem sai do
 * caminho do arquivo, e nao de uma lista de padroes. `MODULES` continua
 * carregando peso, como catalogo do que a arquitetura reconhece - diretorio
 * novo sob `src/modules/` reprova ate ser declarado la, porque fronteira que
 * nao sabe quem sao os modulos nao vigia os que aparecem depois dela.
 */
const arquitetura = {
  rules: {
    'fronteira-de-modulo': {
      meta: {
        type: 'problem',
        docs: { description: 'Um modulo so importa `ports/` de outro modulo.' },
        schema: [],
        messages: {
          fronteira: `Import de '{{origem}}' para '{{alvo}}/{{camada}}'. ${moduleBoundaries.message}`,
          naoDeclarado: `'{{modulo}}'. ${moduleBoundaries.undeclaredMessage}`,
        },
      },
      create(context) {
        const origem = localizar(context.filename);
        if (!origem) return {};
        const diretorio = path.dirname(context.filename);

        function verificar(no, valor) {
          if (typeof valor !== 'string' || valor === '') return;

          // Especificador nao-relativo. Nao ha alias de caminho no
          // tsconfig.json, entao um pacote que cite `modules/` e caminho
          // disfarcado: reprova em vez de deixar passar por nao saber resolver.
          if (!valor.startsWith('.')) {
            if (valor.includes('modules/')) {
              context.report({
                node: no,
                messageId: 'fronteira',
                data: { origem: origem.modulo, alvo: valor, camada: '?' },
              });
            }
            return;
          }

          const alvo = localizar(path.resolve(diretorio, valor));
          if (!alvo) return;
          if (alvo.modulo === origem.modulo) return;
          if (alvo.camada === moduleBoundaries.publicLayer) return;

          context.report({
            node: no,
            messageId: 'fronteira',
            data: { origem: origem.modulo, alvo: alvo.modulo, camada: alvo.camada },
          });
        }

        return {
          Program(no) {
            if (MODULES.includes(origem.modulo)) return;
            context.report({
              node: no,
              messageId: 'naoDeclarado',
              data: { modulo: origem.modulo },
            });
          },
          ImportDeclaration: (no) => verificar(no.source, no.source.value),
          ExportNamedDeclaration: (no) => no.source && verificar(no.source, no.source.value),
          ExportAllDeclaration: (no) => no.source && verificar(no.source, no.source.value),
          ImportExpression: (no) => verificar(no.source, no.source.value),
        };
      },
    },
  },
};

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'src/shared/types/generated/**',
      // Saida de build do app iOS/Flutter: dependencia de terceiro vendorizada
      // pelo SwiftPM, nao codigo deste repositorio. Ja esta no .gitignore; o
      // ESLint nao le .gitignore, entao precisa ser dito aqui tambem.
      'app/build/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },

  // --- Arquivos de configuracao em .mjs -----------------------------------
  // Este arquivo e `src/architecture.rules.mjs` nao sao TypeScript e nao estao
  // no `tsconfig.json`, entao o servico de projeto nao os encontra e o parser
  // falha antes de qualquer regra rodar. Eles continuam lintados; o que sai e
  // a analise com tipos, que nao se aplica a eles.
  {
    ...tseslint.configs.disableTypeChecked,
    files: ['**/*.mjs'],
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
  // Regra propria, e nao `no-restricted-imports`, por dois motivos: ela resolve
  // o caminho em vez de casar texto, e ocupa um nome de regra separado - o
  // arranjo anterior, por sobrepor `no-restricted-imports`, apagava dentro de
  // `src/modules/` o confinamento de SDK declarado logo acima.
  {
    files: ['src/modules/**/*.ts'],
    plugins: { arquitetura },
    rules: { 'arquitetura/fronteira-de-modulo': 'error' },
  },

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
