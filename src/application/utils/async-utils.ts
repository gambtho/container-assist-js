/**
 * Shared Async Utilities
 * Centralized async operations to reduce duplication across tools
 */

import type { Logger } from 'pino';

/**
 * Options for timeout operations
 */
export interface TimeoutOptions {
  timeout: number;
  errorMessage?: string;
  onTimeout?: () => void | Promise<void>;
  logger?: Logger;
}

/**
 * Execute a promise with timeout
 * Consolidates multiple withTimeout implementations
 */
export async function withTimeout<T>(
  promise: Promise<T> | (() => Promise<T>),
  options: TimeoutOptions | number,
): Promise<T> {
  const opts: TimeoutOptions = typeof options === 'number' ? { timeout: options } : options;

  const { timeout, errorMessage, onTimeout, logger } = opts;
  const message = errorMessage ?? `Operation timed out after ${timeout}ms`;

  let timeoutId: NodeJS.Timeout | undefined;

  try {
    const promiseToRun = typeof promise === 'function' ? promise() : promise;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        void (async () => {
          if (onTimeout) {
            try {
              await onTimeout();
            } catch (err) {
              if (logger) {
                logger.error({ error: err }, 'Error in timeout callback');
              } else {
                console.error('Error in timeout callback:', err);
              }
            }
          }
          reject(new Error(message));
        })();
      }, timeout);
    });

    const result = await Promise.race([promiseToRun, timeoutPromise]);

    // Clear timeout if operation completed
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    return result;
  } catch (error) {
    // Clear timeout on error
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    throw error;
  }
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Options for retry operations
 */
export interface RetryOptions {
  maxAttempts: number;
  backoff?: 'linear' | 'exponential' | 'none';
  initialDelay?: number;
  maxDelay?: number;
  onRetry?: (attempt: number, error: Error) => void | Promise<void>;
  retryIf?: (error: Error) => boolean;
  logger?: Logger;
}

/**
 * Execute an operation with retry logic
 * Consolidates retry patterns across tools
 */
export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  const {
    maxAttempts,
    backoff = 'exponential',
    initialDelay = 1000,
    maxDelay = 30000,
    onRetry,
    retryIf,
    logger,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (retryIf && !retryIf(lastError)) {
        throw lastError;
      }

      // Don't retry if this was the last attempt
      if (attempt >= maxAttempts) {
        break;
      }

      // Calculate delay
      let delay = initialDelay;
      if (backoff === 'exponential') {
        delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);
      } else if (backoff === 'linear') {
        delay = Math.min(initialDelay * attempt, maxDelay);
      }

      // Log retry attempt
      if (logger) {
        logger.warn(
          {
            attempt,
            maxAttempts,
            delay,
            error: lastError.message,
          },
          `Retrying operation (attempt ${attempt}/${maxAttempts})`,
        );
      }

      // Call retry callback
      if (onRetry) {
        try {
          await onRetry(attempt, lastError);
        } catch (err) {
          if (logger) {
            logger.error({ error: err }, 'Error in retry callback');
          }
        }
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError ?? new Error('Operation failed after retries');
}

/**
 * Run operations in parallel with concurrency limit
 */
export async function parallelLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item === undefined) continue;
    const promise = fn(item, i).then((result) => {
      results[i] = result;
    });

    executing.push(promise);

    if (executing.length >= limit) {
      await Promise.race(executing);
      // Remove completed promises and handle floating promise warning
      const stillExecuting: Promise<void>[] = [];
      for (const p of executing) {
        if (p !== promise && !isPromiseResolved(p)) {
          stillExecuting.push(p);
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      executing.splice(0, executing.length, ...stillExecuting);
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * Check if a promise is resolved (helper for parallelLimit)
 */
function isPromiseResolved(promise: Promise<any>): boolean {
  const marker = Symbol('marker');
  return Promise.race([promise, Promise.resolve(marker)]).then(
    (value) => value === marker,
  ) as unknown as boolean;
}

/**
 * Debounce function execution
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | undefined;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

/**
 * Throttle function execution
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number,
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;

      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Create a deferred promise
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve: (value: T) => void;
  let reject: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve: resolve!,
    reject: reject!,
  };
}

/**
 * Race promises with timeout and cleanup
 */
export async function raceWithCleanup<T>(
  promises: Array<{
    promise: Promise<T>;
    cleanup?: () => void | Promise<void>;
  }>,
): Promise<T> {
  const cleanupFns = promises.map((p) => p.cleanup).filter(Boolean) as Array<
    () => void | Promise<void>
  >;

  try {
    const result = await Promise.race(promises.map((p) => p.promise));

    // Cleanup other promises
    for (const cleanup of cleanupFns) {
      try {
        await cleanup();
      } catch {
        // Ignore cleanup errors
      }
    }

    return result;
  } catch (error) {
    // Cleanup all on error
    for (const cleanup of cleanupFns) {
      try {
        await cleanup();
      } catch {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}
