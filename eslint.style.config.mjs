// House style for the `lint` gate (D41, D43), next to Biome. Humans own this file (integrity gate).
// Rules live in agent-kit/scripts/eslint-style-rules.mjs. Agents never disable them (noInlineConfig).
import tseslint from 'typescript-eslint';

import houseStyle from './agent-kit/scripts/eslint-style-rules.mjs';

const noLet = {
  selector: "VariableDeclaration[kind='let']",
  message: 'Use `const`. Compute the value in one expression or a small helper instead of reassigning.',
};
const noDescribe = {
  selector: "CallExpression[callee.name='describe'], CallExpression[callee.object.name='describe']",
  message:
    "Keep unit tests flat: top-level `it(...)`. Stryker can't see tests inside `describe`, so their mutants survive.",
};

export default [
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['**/*.d.ts', 'agent-kit/**', '**/node_modules/**', '**/dist/**', '**/components/ui/**'],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'off' },
    plugins: { 'house-style': houseStyle, '@typescript-eslint': tseslint.plugin },
    rules: {
      'house-style/arrow-functions-only': 'error',
      'house-style/typed-arrow-constants': 'error',
      'house-style/single-return': 'error',
      'house-style/exports-at-end': 'error',
      'house-style/blank-line-before': 'error',
      'house-style/import-groups': ['error', { internalPrefixes: ['@/', '@app/'] }],
      curly: ['error', 'all'],
      'prefer-const': 'error',
      'no-var': 'error',
      'house-style/no-magic-strings': 'error',
      '@typescript-eslint/no-magic-numbers': [
        'error',
        {
          ignore: [-1, 0, 1],
          ignoreArrayIndexes: true,
          enforceConst: true,
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreTypeIndexes: true,
          ignoreReadonlyClassProperties: true,
        },
      ],
      'max-depth': ['error', 2],
      'max-nested-callbacks': ['error', 2],
      'max-params': ['error', 3],
      'no-nested-ternary': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
      'no-param-reassign': ['error', { props: true }],
      'no-implicit-coercion': 'error',
      'prefer-template': 'error',
      'object-shorthand': 'error',
      'no-restricted-syntax': ['error', noLet],
    },
  },
  {
    // Constants files are where named values live. Tests pin exact boundary values (59, 60, 61), so they may use literals.
    files: [
      '**/constants/**',
      '**/constants.ts',
      '**/*.constants.ts',
      '**/*.{test,spec,steps,support}.{ts,tsx}',
      '**/e2e/**',
      '**/*.config.ts',
    ],
    rules: { 'house-style/no-magic-strings': 'off', '@typescript-eslint/no-magic-numbers': 'off' },
  },
  {
    // Unit tests stay flat (D49): Stryker's Vitest runner can't match tests inside `describe` blocks.
    files: ['**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', noLet, noDescribe] },
  },
  {
    // Only the config module reads the environment (D49): everything else gets AppConfig.
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/config/env.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read settings from AppConfig: apps/api/src/config/env.ts parses process.env once.',
        },
      ],
    },
  },
];
