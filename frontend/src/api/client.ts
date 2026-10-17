import { createHttpAdapter } from './adapters/http'
import { createMockAdapter } from './adapters/mock'
import type { DataMode, LegacyApi } from './types'

export const DATA_MODE: DataMode = import.meta.env.VITE_LEGACY_DATA_MODE === 'http' ? 'http' : 'mock'
export const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1'

export const api: LegacyApi = DATA_MODE === 'http' ? createHttpAdapter(API_BASE) : createMockAdapter()
