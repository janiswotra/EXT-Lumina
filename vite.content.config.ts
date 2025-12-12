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
                content: path.resolve(__dirname, 'content.tsx'),
            },
            output: {
                format: 'iife', // Immediately Invoked Function Expression (self-contained)
                entryFileNames: 'content.js',
                // Bundle everything into one file
                manualChunks: undefined,
                inlineDynamicImports: false,
                extend: true,
                globals: {
                    chrome: 'chrome' // Ensure chrome global is recognized if needed (though usu handled by types)
                }
            }
        }
    }
});
