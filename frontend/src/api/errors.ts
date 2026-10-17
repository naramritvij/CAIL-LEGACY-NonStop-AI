export type ApiErrorCode =
  | 'network'
  | 'timeout'
  | 'not_found'
  | 'validation'
  | 'unavailable'
  | 'contract_mismatch'
  | 'server'
  | 'unknown'

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status?: number
  readonly retryable: boolean

  constructor(code: ApiErrorCode, message: string, options: { status?: number; retryable?: boolean } = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = options.status
    this.retryable = options.retryable ?? (code === 'network' || code === 'timeout' || code === 'unavailable')
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ApiError('timeout', 'The request took too long and was cancelled.')
  }
  if (error instanceof TypeError) {
    return new ApiError('network', 'CAIL could not reach the API service.')
  }
  return new ApiError('unknown', error instanceof Error ? error.message : 'An unexpected error occurred.')
}

export function errorFromStatus(status: number, detail?: string): ApiError {
  if (status === 404) return new ApiError('not_found', detail ?? 'The requested record was not found.', { status })
  if (status === 422 || status === 400) return new ApiError('validation', detail ?? 'The request was not valid.', { status })
  if (status === 503) return new ApiError('unavailable', detail ?? 'The service is temporarily unavailable.', { status })
  return new ApiError('server', detail ?? `The server responded with status ${status}.`, {
    status,
    retryable: status >= 500,
  })
}
