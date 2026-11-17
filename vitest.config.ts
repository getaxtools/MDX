import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The MathML converter runs with a shim over the browser's parser in place of `@xmldom/xmldom`, as
// in the app; inlining the converter lets the alias reach its import.
// Tests run under Node, whose export condition gives MathLive's server build without its editor;
// the browser build is the one the app bundles.
const BROWSER_BUILDS = {
  resolve: {
    alias: {
      '@xmldom/xmldom': fileURLToPath(
        new URL('./packages/editor/src/formula-paste/xmldomShim.ts', import.meta.url),
      ),
      mathlive: fileURLToPath(
        new URL('./packages/ui/node_modules/mathlive/mathlive.min.mjs', import.meta.url),
      ),
    },
  },
};
const CONVERTER_INLINED = { server: { deps: { inline: ['mathml-to-latex'] } } };

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'core', include: ['packages/core/src/**/*.test.ts'], environment: 'node' } },
      { test: { name: 'platform', include: ['packages/platform/src/**/*.test.ts'], environment: 'node' } },
      { test: { name: 'i18n', include: ['packages/i18n/src/**/*.test.ts'], environment: 'node' } },
      { test: { name: 'e2e-support', include: ['tests/e2e/support/**/*.test.ts'], environment: 'node' } },
      {
        test: {
          name: 'renderer',
          include: ['packages/renderer/src/**/*.test.ts', 'tests/security/**/*.test.ts'],
          environment: 'jsdom',
        },
      },
      {
        ...BROWSER_BUILDS,
        test: {
          name: 'editor',
          include: ['packages/editor/src/**/*.test.ts'],
          environment: 'jsdom',
          ...CONVERTER_INLINED,
        },
      },
      {
        ...BROWSER_BUILDS,
        test: {
          ...CONVERTER_INLINED,
          name: 'freeze-compat',
          include: ['tests/freeze-compat/**/*.test.ts'],
          environment: 'jsdom',
          // Runs before each test file's imports; every file runs in a worker of its own.
          setupFiles: ['tests/freeze-compat/freezePrototype.ts'],
        },
      },
      {
        ...BROWSER_BUILDS,
        plugins: [svelte(), svelteTesting()],
        test: {
          ...CONVERTER_INLINED,
          name: 'ui',
          include: ['packages/ui/src/**/*.test.ts', 'apps/desktop/src/**/*.test.ts'],
          environment: 'jsdom',
          setupFiles: ['tests/ui-setup/testingLibraryWaits.ts'],
          // Whole-viewer tests load the editor and lazy components; under coverage on a busy
          // machine one can take longer than the default five seconds.
          testTimeout: 20_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{ts,svelte}', 'apps/desktop/src/ports/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
      thresholds: {
        lines: 85,
        branches: 80,
        'packages/renderer/src/sanitize/**': { branches: 100 },
      },
    },
  },
});
