import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                // the original nature gallery, kept at /gallery
                gallery: resolve(__dirname, 'gallery/index.html'),
            },
        },
    },
});
