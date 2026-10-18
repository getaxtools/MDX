import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const TAURI_DEV_SERVER_PORT = 5173;

export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: { port: TAURI_DEV_SERVER_PORT, strictPort: true },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 1024 },
});
