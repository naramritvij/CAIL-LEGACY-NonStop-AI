import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const practiceTarget = env.CAIL_PRACTICE_PROXY_TARGET

  return {
    plugins: [react(), tailwindcss()],
    // Discover the layout worker's dependency before a fresh demo opens the graph.
    optimizeDeps: { include: ['d3-force-3d'] },
    define: {
      'import.meta.env.VITE_CAIL_GRAPH_PRACTICE': JSON.stringify(practiceTarget ? 'true' : 'false'),
    },
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
        ...(practiceTarget ? {
          '/practice/api/v1/workspace': {
            target: practiceTarget,
            changeOrigin: false,
            rewrite: (path: string) => path.slice('/practice'.length),
            cookiePathRewrite: { '/api/v1/workspace': '/practice/api/v1/workspace' },
          },
        } : {}),
      },
    },
  }
})
