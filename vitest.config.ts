import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'core', include: ['packages/core/src/**/*.test.ts'], environment: 'node' } },
      { test: { name: 'platform', include: ['packages/platform/src/**/*.test.ts'], environment: 'node' } },
      { test: { name: 'i18n', include: ['packages/i18n/src/**/*.test.ts'], environment: 'node' } },
      {
        test: {
          name: 'renderer',
          include: ['packages/renderer/src/**/*.test.ts', 'tests/security/**/*.test.ts'],
          environment: 'jsdom',
        },
      },
      {
        plugins: [svelte(), svelteTesting()],
        test: {
          name: 'ui',
          include: ['packages/ui/src/**/*.test.ts', 'apps/desktop/src/**/*.test.ts'],
          environment: 'jsdom',
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
