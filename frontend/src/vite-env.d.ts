/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LEGACY_DATA_MODE?: 'mock' | 'http'
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
