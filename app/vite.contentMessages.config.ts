import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    plugins: [react()],
    define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
    },
    build: {
        outDir: 'dist',
        emptyOutDir: false, // Don't wipe the dist folder (main build does that)
        rollupOptions: {
            input: {
                contentMessages: path.resolve(__dirname, 'contentMessages.tsx'),
            },
            output: {
                format: 'iife',
                entryFileNames: 'contentMessages.js',
                manualChunks: undefined,
                inlineDynamicImports: false,
                extend: true,
                globals: {
                    chrome: 'chrome'
                }
            }
        }
    }
});
