import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import pkg from './package.json';

const sdk = resolve(__dirname, '../proton-sdk/client/js/src');

// Vendored SDK packages have no built dist/exports → alias bare specifiers to TS source.
// Node globals come from the proton polyfills module (imported first). CORS to Proton is open.
export default defineConfig(({ mode }) => {
  // The basemap key is baked in at build time; without it every production map ships broken
  // (api.protomaps.com answers 403) while dev machines with a .env never notice. Fail loudly.
  const env = loadEnv(mode, __dirname, 'VITE_');
  if (mode === 'production' && !env.VITE_PROTOMAPS_KEY) {
    throw new Error('VITE_PROTOMAPS_KEY is missing — set it in .env (local) or as a CI secret; the map cannot work without it.');
  }

  return {
  plugins: [vue(), tailwindcss()],
  // __APP_VERSION__: package.json is the single version source (tauri.conf.json reads it too).
  define: { global: 'globalThis', __APP_VERSION__: JSON.stringify(pkg.version) },
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
  };
});
