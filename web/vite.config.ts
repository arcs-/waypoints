import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

const sdk = resolve(__dirname, '../proton-sdk/client/js/src');

// Vendored SDK packages have no built dist/exports → alias bare specifiers to TS source.
// Node globals come from src/proton/polyfills.ts (imported first). CORS to Proton is open.
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  define: { global: 'globalThis' },
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, 'src') },
      { find: '@protontech/drive-sdk/protonDrivePhotosClient', replacement: `${sdk}/protonDrivePhotosClient.ts` },
      { find: '@protontech/drive-sdk/diagnostic', replacement: `${sdk}/diagnostic/index.ts` },
      { find: '@protontech/drive-sdk', replacement: `${sdk}/index.ts` },
    ],
    dedupe: ['@protontech/crypto'],
  },
  server: { port: 5174 },
});
