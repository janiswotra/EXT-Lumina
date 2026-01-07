import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Vite config for building contentApp.ts
 * This script is injected into app.yena.ai, NOT LinkedIn
 */
export default defineConfig({
    define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
    },
    build: {
        outDir: 'dist',
        emptyOutDir: false,
        rollupOptions: {
            input: {
                contentApp: path.resolve(__dirname, 'contentApp.ts'),
            },
            output: {
                format: 'iife',
                entryFileNames: 'contentApp.js',
                manualChunks: undefined,
                inlineDynamicImports: false,
            }
        }
    }
});
