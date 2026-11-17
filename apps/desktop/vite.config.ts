import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const TAURI_DEV_SERVER_PORT = 5173;

export default defineConfig({
  plugins: [svelte()],
  // The MathML converter's XML parser fails with the frozen prototype; a shim over the browser's
  // parser takes its place.
  resolve: {
    alias: {
      '@xmldom/xmldom': fileURLToPath(
        new URL('../../packages/editor/src/formula-paste/xmldomShim.ts', import.meta.url),
      ),
    },
  },
  clearScreen: false,
  server: {
    port: TAURI_DEV_SERVER_PORT,
    strictPort: true,
    // Transforms the app's modules while Rust still compiles, so the first window opens faster.
    warmup: { clientFiles: ['./src/main.ts', './src/startViewerApp.ts'] },
  },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 1024 },
  // The prompt injection check worker imports modules that split into chunks, which only module workers can load.
  worker: { format: 'es' },
});
