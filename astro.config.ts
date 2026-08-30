import { defineConfig } from 'astro/config';

export default defineConfig({
  outDir: 'dist',
  build: {
    inlineStylesheets: 'auto'
  },
  compressHTML: true,
  server: {
    port: 4321
  },
  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks: undefined
        }
      }
    }
  }
});
