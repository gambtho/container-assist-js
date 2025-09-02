/**
 * Result type for handling success and failure states
 * Provides a consistent way to handle errors without exceptions
 */

export interface AppError {
  code: string
  message: string
  context?: string
  cause?: Error
  metadata?: Record<string, unknown>
}

export interface Result<T> {
  success: boolean
  data?: T
  error?: AppError
  timestamp: string
  metadata?: Record<string, unknown>
}

/**
 * Create a successful result
 */
export function ok<T>(data: T, metadata?: Record<string, unknown>): Result<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
    ...(metadata ? { metadata } : {})
  }
}

/**
 * Create a failed result
 */
export function fail<T>(
  error: AppError | Error | string,
  metadata?: Record<string, unknown>
): Result<T> {
  let appError: AppError

  if (typeof error === 'string') {
    appError = { code: 'error', message: error }
  } else if (error instanceof Error) {
    appError = {
      code: 'error',
      message: error.message,
      cause: error
    }
  } else {
    appError = error
  }

  return {
    success: false,
    error: appError,
    timestamp: new Date().toISOString(),
    ...(metadata ? { metadata } : {})
  }
}

/**
 * Type guard to check if result is successful
 */
export function isOk<T>(result: Result<T>): result is Result<T> & { success: true; data: T } {
  return result.success === true && result.data !== undefined
}

/**
 * Type guard to check if result is failed
 */
export function isFail<T>(
  result: Result<T>
): result is Result<T> & { success: false; error: AppError } {
  return result.success === false && result.error !== undefined
}

/**
 * Map a successful result to a new value
 */
export function map<T, U>(
  result: Result<T>,
  fn: (value: T) => U
): Result<U> {
  if (isOk(result)) {
    return ok(fn(result.data), result.metadata)
  }
  return result as unknown as Result<U>
}

/**
 * Chain results together (flatMap)
 */
export function chain<T, U>(
  result: Result<T>,
  fn: (value: T) => Result<U>
): Result<U> {
  if (isOk(result)) {
    const newResult = fn(result.data)
    // Merge metadata if present
    if (result.metadata && newResult.metadata) {
      newResult.metadata = { ...result.metadata, ...newResult.metadata }
    } else if (result.metadata) {
      newResult.metadata = result.metadata
    }
    return newResult
  }
  return result as unknown as Result<U>
}

/**
 * Get the value or throw an error
 */
export function unwrap<T>(result: Result<T>): T {
  if (isOk(result)) {
    return result.data
  }
  throw new Error((result.error?.message != null && result.error.message !== '') ? result.error.message : 'Result is not ok')
}

/**
 * Get the value or return a default
 */
export function unwrapOr<T>(result: Result<T>, defaultValue: T): T {
  if (isOk(result)) {
    return result.data
  }
  return defaultValue
}

/**
 * Combine multiple results into a single result
 */
export function all<T>(results: Result<T>[]): Result<T[]> {
  const failures = results.filter(isFail)

  if (failures.length > 0) {
    const firstFailure = failures[0]
    if (!firstFailure?.error) {
      return fail('Unknown error in result combination')
    }

    return fail({
      code: 'multiple_errors',
      message: `${failures.length} operations failed`,
      metadata: {
        errors: failures.map(f => f.error),
        firstError: firstFailure.error
      }
    })
  }

  const data = results
    .filter(isOk)
    .map(r => r.data)

  return ok(data)
}

/**
 * Try to execute a function and return a Result
 */
export async function tryAsync<T>(
  fn: () => Promise<T>,
  errorCode?: string
): Promise<Result<T>> {
  try {
    const data = await fn()
    return ok(data)
  } catch (error) {
    if (error instanceof Error) {
      return fail({
        code: (errorCode != null && errorCode !== '') ? errorCode : 'async_error',
        message: error.message,
        cause: error
      })
    }
    return fail({
      code: (errorCode != null && errorCode !== '') ? errorCode : 'async_error',
      message: String(error)
    })
  }
}

/**
 * Try to execute a sync function and return a Result
 */
export function trySync<T>(
  fn: () => T,
  errorCode?: string
): Result<T> {
  try {
    const data = fn()
    return ok(data)
  } catch (error) {
    if (error instanceof Error) {
      return fail({
        code: (errorCode != null && errorCode !== '') ? errorCode : 'sync_error',
        message: error.message,
        cause: error
      })
    }
    return fail({
      code: errorCode || 'sync_error',
      message: String(error)
    })
  }
}

