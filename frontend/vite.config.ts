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
      // Explicit development-preview host; keep wildcard host acceptance disabled.
      allowedHosts: ['terminal.local'],
      // Only used when VITE_LEGACY_DATA_MODE=http: forwards /api/v1 to the local FastAPI service.
      proxy: {
        '/api': {
          target: env.LEGACY_API_PROXY_TARGET || 'http://localhost:8000',
          // Preserve the browser Host for the workspace's same-origin mutation checks.
          changeOrigin: false,
        },
      },
    },
  }
})
