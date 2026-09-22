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

const RAIZ_DO_PROJETO = path.resolve(import.meta.dirname);
const RAIZ_DOS_MODULOS = path.resolve(RAIZ_DO_PROJETO, moduleBoundaries.root);

/**
 * As marcas de tipo que têm PORTA, e onde a porta mora.
 *
 * Uma marca (`Brand<string, 'ObjectKey'>`) some na compilação: em tempo de
 * execução ela é `string`. O que a torna verdadeira é a função que confere o
 * valor antes de devolvê-lo marcado. `as` não é essa função — ele só promete ao
 * compilador que alguém já conferiu, e quando esse alguém não existe a marca
 * vira documentação falsa.
 *
 * Esta tabela devia morar em `src/architecture.rules.mjs`, junto do resto do
 * CONTEÚDO da arquitetura. Ficou aqui porque este trabalho estava confinado a
 * `src/modules/media/` e a este arquivo; mover é uma linha e não muda a regra.
 */
const MARCAS_COM_PORTA = [
  {
    marca: 'ObjectKey',
    porta: 'comoObjectKey',
    dominio: 'src/modules/media/domain',
  },
];

/** `absoluto` está dentro de `relativoDaRaiz`? Por componente, nunca por texto. */
function dentroDe(absoluto, relativoDaRaiz) {
  const relativo = path.relative(path.resolve(RAIZ_DO_PROJETO, relativoDaRaiz), absoluto);
  return relativo !== '' && !relativo.startsWith('..') && !path.isAbsolute(relativo);
}

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

    /**
     * Marca de tipo só pela porta que valida — nunca por `as`.
     *
     * O BICHUS-134 fechou `ObjectKey` atrás de `comoObjectKey`, e o QA reabriu
     * o buraco inteiro desfazendo seis linhas e repondo um `import type`:
     * `npm test` continuou verde e o lint não tinha nada a dizer. Uma porta
     * única que depende de ninguém escrever `as` não é porta: é convenção. É o
     * mesmo motivo de `fronteira-de-modulo` existir, e o desenho é o dele —
     * caminho resolvido e comparado por componente, nunca glob de texto.
     *
     * A regra pega `x as ObjectKey` e `<ObjectKey>x`. Ela NÃO pega
     * `x as unknown as string as ObjectKey`? Pega: o `as` de fora é o que ela
     * inspeciona, e ele cita a marca. O que ela não alcança é um apelido
     * (`type Chave = ObjectKey`) ou um genérico que devolva a marca sem citá-la
     * — ambos precisariam de informação de tipos, que esta regra não usa de
     * propósito, para continuar rodando sobre qualquer arquivo. O teste de
     * persistência é o outro lado: ele exige que a conferência ACONTEÇA, e não
     * só que o `as` não esteja escrito.
     */
    'marca-so-pela-porta': {
      meta: {
        type: 'problem',
        docs: { description: 'Marca de tipo só se obtém pela função que valida, nunca por `as`.' },
        schema: [],
        messages: {
          foraDaPorta:
            '`as {{marca}}` fora de {{dominio}}/. `as` não confere nada: promete ao ' +
            'compilador que alguém já validou, e quando esse alguém não existe a marca ' +
            'é documentação falsa. Use `{{porta}}(...)`, que é a única porta (BICHUS-134).',
        },
      },
      create(context) {
        // Uma marca por vez: o arquivo pode ser o domínio de uma e não o de outra.
        const proibidas = MARCAS_COM_PORTA.filter((m) => !dentroDe(context.filename, m.dominio));
        if (proibidas.length === 0) return {};

        function verificar(no, anotacao) {
          if (anotacao?.type !== 'TSTypeReference') return;
          if (anotacao.typeName?.type !== 'Identifier') return;
          const alvo = proibidas.find((m) => m.marca === anotacao.typeName.name);
          if (alvo === undefined) return;
          context.report({ node: no, messageId: 'foraDaPorta', data: alvo });
        }

        return {
          TSAsExpression: (no) => verificar(no, no.typeAnnotation),
          TSTypeAssertion: (no) => verificar(no, no.typeAnnotation),
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
      // Iscas do portao de saida: arvores de mentira que existem para ser
      // REPROVADAS por `verificar-colunas-que-nao-saem.sh`. Elas imitam
      // `src/`, `api/` e `migrations/` e nao estao no tsconfig, entao o
      // servico de projeto nao as acha e o parser morre antes de qualquer
      // regra. Lintar fixture de defeito e cobrar qualidade de codigo que
      // existe para estar errado.
      'infra/verificacao/iscas/**',
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
  // `cypress.config.ts` mora na raiz por exigencia do Cypress, que so procura ali.
  // Ele nao entra no `tsconfig.json` do backend de proposito: `include` e
  // `src/**` e `tests/**`, e puxar a raiz para dentro arrastaria todo arquivo de
  // configuracao para a analise com tipos. Os specs tem `cypress/tsconfig.json`
  // proprio; sobra este, que vai sem analise de tipo pelo mesmo motivo dos .mjs.
  {
    ...tseslint.configs.disableTypeChecked,
    files: ['cypress.config.ts'],
  },

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

  // --- Marca de tipo só pela porta ---------------------------------------
  // Escopo largo de propósito: a porta única não vale só dentro do módulo de
  // mídia. Teste e teste de integração entram também — foi um teste que o QA
  // usou para mostrar que dava para reverter tudo com a suíte verde, e uma
  // regra que parasse em `src/` deixaria `tests/` recriar a marca falsa.
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    plugins: { arquitetura },
    rules: { 'arquitetura/marca-so-pela-porta': 'error' },
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
