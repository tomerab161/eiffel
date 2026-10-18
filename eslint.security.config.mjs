// ESLint is used ONLY for security rules here (Biome does lint and style). Humans own this file.
// Findings a human has judged safe go in .agent-kit/security-allowlist.json → eslint, never in code comments.
import { readFileSync } from 'node:fs';
import noUnsanitized from 'eslint-plugin-no-unsanitized';
import security from 'eslint-plugin-security';
import tseslint from 'typescript-eslint';

const allowlist = JSON.parse(readFileSync(new URL('./.agent-kit/security-allowlist.json', import.meta.url), 'utf8'));

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.stryker-tmp/**', '**/reports/**'] },
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'off' },
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { security },
    rules: {
      ...security.configs.recommended.rules,
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'no-unsanitized': noUnsanitized },
    rules: {
      'no-unsanitized/method': 'error',
      'no-unsanitized/property': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Render text. React escapes it; keep it that way.',
        },
      ],
    },
  },
  ...allowlist.eslint.map(({ files, rule }) => ({ files: [files], rules: { [rule]: 'off' } })),
];
