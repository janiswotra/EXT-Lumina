import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Host build: the injectable UI as a standalone page.
// - base './'  → relative asset paths, so it resolves under
//   <domain>/api/v1/extension/<channel>/ when injected by static/injector.js
// - non-hashed filenames → re-deploys overwrite the same files (upsert), no
//   stale build-up on the server (this is the build-time equivalent of the
//   reference project's removehash.js)
// - output goes to dist-host/ and is uploaded by scripts/deploy.mjs
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist-host',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'index.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
});
