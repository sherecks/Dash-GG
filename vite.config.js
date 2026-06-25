import { defineConfig } from 'vite';

// Front (Vite) na 5173, API (Bun) na 3000.
// Tudo que começar com /api é encaminhado para o servidor Bun em dev.
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
