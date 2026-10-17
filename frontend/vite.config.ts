import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': '/src' },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      // Do not enable wildcard host acceptance; default Vite localhost allowances suffice.
      // Only used when VITE_LEGACY_DATA_MODE=http: forwards /api/v1 to the local FastAPI service.
      proxy: {
        '/api': {
          target: env.LEGACY_API_PROXY_TARGET || 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
  }
})
