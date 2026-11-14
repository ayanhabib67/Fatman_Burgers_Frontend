import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'fatman-till-clean-url',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const raw = req.url || '';
          const pathOnly = raw.split('?')[0];
          const qs = raw.includes('?') ? raw.slice(raw.indexOf('?')) : '';
          if (pathOnly === '/till/index.html') {
            res.statusCode = 302;
            res.setHeader('Location', '/till/' + qs);
            res.end();
            return;
          }
          if (pathOnly === '/till' || pathOnly === '/till/') {
            req.url = '/till/index.html' + qs;
          }
          next();
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          const raw = req.url || '';
          const pathOnly = raw.split('?')[0];
          const qs = raw.includes('?') ? raw.slice(raw.indexOf('?')) : '';
          if (pathOnly === '/till/index.html') {
            res.statusCode = 302;
            res.setHeader('Location', '/till/' + qs);
            res.end();
            return;
          }
          if (pathOnly === '/till' || pathOnly === '/till/') {
            req.url = '/till/index.html' + qs;
          }
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 600,
  },
});
