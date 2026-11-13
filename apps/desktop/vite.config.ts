import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const TAURI_DEV_SERVER_PORT = 5173;

export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: {
    port: TAURI_DEV_SERVER_PORT,
    strictPort: true,
    // Transforms the app's modules while Rust still compiles, so the first window opens faster.
    warmup: { clientFiles: ['./src/main.ts', './src/startViewerApp.ts'] },
  },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 1024 },
});
