/**
 * Result Monad Pattern
 * A functional approach to error handling without exceptions
 */

/**
 * Success result type
 */
export interface Ok<T> {
  readonly kind: 'ok';
  readonly value: T;
}

/**
 * Failure result type
 */
export interface Fail {
  readonly kind: 'fail';
  readonly error: string;
  readonly code?: string;
  readonly details?: unknown;
}

/**
 * Result type - either Ok or Fail
 */
export type Result<T> = Ok<T> | Fail;

/**
 * Create a success result
 */
export function ok<T>(value: T): Ok<T> {
  return { kind: 'ok', value };
}

/**
 * Create a failure result
 */
export function fail(error: string, code?: string, details?: unknown): Fail {
  return {
    kind: 'fail',
    error,
    ...(code !== undefined && { code }),
    ...(details !== undefined && { details })
  };
}

/**
 * Type guard to check if result is Ok
 */
export function isOk<T>(result: Result<T>): result is Ok<T> {
  return result.kind === 'ok';
}

/**
 * Type guard to check if result is Fail
 */
export function isFail<T>(result: Result<T>): result is Fail {
  return result.kind === 'fail';
}

/**
 * Map over a successful result
 */
export function map<T, U>(result: Result<T>, fn: (value: T) => U): Result<U> {
  if (isOk(result)) {
    return ok(fn(result.value));
  }
  return result;
}

/**
 * Flat map (chain) over a successful result
 */
export function chain<T, U>(result: Result<T>, fn: (value: T) => Result<U>): Result<U> {
  if (isOk(result)) {
    return fn(result.value);
  }
  return result;
}

/**
 * Unwrap the value or throw an error
 */
export function unwrap<T>(result: Result<T>): T {
  if (isOk(result)) {
    return result.value;
  }
  throw new Error(result.error);
}

/**
 * Unwrap the value or return a default
 */
export function unwrapOr<T>(result: Result<T>, defaultValue: T): T {
  if (isOk(result)) {
    return result.value;
  }
  return defaultValue;
}

/**
 * Execute a side effect on success
 */
export function tap<T>(result: Result<T>, fn: (value: T) => void): Result<T> {
  if (isOk(result)) {
    fn(result.value);
  }
  return result;
}

/**
 * Execute a side effect on failure
 */
export function tapError<T>(
  result: Result<T>,
  fn: (error: string, code?: string) => void
): Result<T> {
  if (isFail(result)) {
    fn(result.error, result.code);
  }
  return result;
}

/**
 * Convert a Promise to a Result
 */
export async function fromPromise<T>(promise: Promise<T>): Promise<Result<T>> {
  try {
    const value = await promise;
    return ok(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(message);
  }
}

/**
 * Combine multiple results into a single result
 */
export function combine<T>(results: Result<T>[]): Result<T[]> {
  const values: T[] = [];

  for (const result of results) {
    if (isFail(result)) {
      return result;
    }
    values.push(result.value);
  }

  return ok(values);
}

/**
 * Helper type aliases for common patterns
 */
export type Success<T> = Ok<T>;
export type Failure = Fail;

// Re-export for backward compatibility
export const Success = ok;
export const Failure = fail;
