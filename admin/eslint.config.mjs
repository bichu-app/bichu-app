// Lint do backoffice. Mesma base da raiz (eslint.config.mjs): recomendado do
// ESLint, `recommendedTypeChecked` do typescript-eslint com servico de projeto,
// e analise sem tipo para `.mjs`. Acrescenta as regras de hooks do React.
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'src/api/generated/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },

  {
    files: ['src/**/*.{ts,tsx}', 'test/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
    languageOptions: { globals: globals.browser },
  },

  {
    files: ['**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['scripts/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { globals: globals.node },
  },

  {
    rules: {
      'no-console': 'error',
    },
  },
);
