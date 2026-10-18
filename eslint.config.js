import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import svelte from 'eslint-plugin-svelte';
import tseslint from 'typescript-eslint';

const MAX_COMPLEXITY = 10;
const MAX_NESTING_DEPTH = 3;
const MAX_PARAMETERS = 3;
const MAX_FUNCTION_LINES = 40;

const readabilityRules = {
  complexity: ['error', MAX_COMPLEXITY],
  'max-depth': ['error', MAX_NESTING_DEPTH],
  'max-params': ['error', MAX_PARAMETERS],
  'max-lines-per-function': ['error', { max: MAX_FUNCTION_LINES, skipBlankLines: true, skipComments: true }],
  'no-nested-ternary': 'error',
  '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
  '@typescript-eslint/naming-convention': [
    'error',
    { selector: 'default', format: ['camelCase'], leadingUnderscore: 'forbid' },
    { selector: 'variable', modifiers: ['const'], format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
    { selector: 'typeLike', format: ['PascalCase'] },
    { selector: 'enumMember', format: ['PascalCase'] },
    { selector: 'import', format: ['camelCase', 'PascalCase'] },
    { selector: 'parameter', modifiers: ['unused'], format: null, leadingUnderscore: 'allow' },
    { selector: ['objectLiteralProperty', 'objectLiteralMethod', 'typeProperty'], format: null },
    {
      selector: 'variable',
      types: ['boolean'],
      format: ['PascalCase'],
      prefix: ['is', 'has', 'can', 'should', 'was', 'will'],
    },
  ],
  '@typescript-eslint/no-magic-numbers': [
    'error',
    { ignore: [-1, 0, 1, 2], ignoreArrayIndexes: true, ignoreDefaultValues: true, ignoreEnums: true },
  ],
};

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/target/**',
      '**/coverage/**',
      'apps/desktop/src-tauri/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  svelte.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.svelte'],
      },
    },
    rules: readabilityRules,
  },
  {
    files: ['**/*.svelte'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    files: ['packages/core/src/**/*.ts', 'packages/platform/src/**/*.ts', 'packages/ui/src/**/*.{ts,svelte}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['@tauri-apps/*', '@mdx/desktop'] }],
    },
  },
  {
    files: ['packages/core/src/**/*.ts', 'packages/platform/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@tauri-apps/*', 'svelte', 'svelte/*', '@mdx/ui', '@mdx/desktop', '@mdx/renderer'] },
      ],
    },
  },
  {
    files: ['**/*.test.ts', 'tests/**/*.ts'],
    rules: { 'max-lines-per-function': 'off', '@typescript-eslint/no-magic-numbers': 'off' },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
);
