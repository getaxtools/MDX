import { defineConfig } from 'vitest/config';

const APP_START_TIMEOUT_MS = 60_000;
const SPEC_TIMEOUT_MS = 90_000;

export default defineConfig({
  test: {
    name: 'desktop-ui',
    root: import.meta.dirname,
    include: ['desktop/**/*.spec.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: SPEC_TIMEOUT_MS,
    hookTimeout: APP_START_TIMEOUT_MS,
  },
});
