import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    exclude: ['kokoro-js'],
  },
  build: {
    rollupOptions: {
      // Don't bundle kokoro-js or its deps — they load WASM from CDN at runtime
      external: ['kokoro-js'],
      output: {
        paths: {
          'kokoro-js': 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm',
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
});
