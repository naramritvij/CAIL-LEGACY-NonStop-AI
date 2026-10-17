import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Windows-host Vite dev server: frontend runs outside Docker while FastAPI
// runs on localhost:8000. Keep vite.config.ts unchanged for Docker Compose.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
});
