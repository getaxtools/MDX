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
    // A fresh worker per spec file crashed now and then on Windows (exit 0xC0000409); every spec starts
    // its own app and profile, so sharing one worker loses no isolation.
    isolate: false,
    testTimeout: SPEC_TIMEOUT_MS,
    hookTimeout: APP_START_TIMEOUT_MS,
  },
});
