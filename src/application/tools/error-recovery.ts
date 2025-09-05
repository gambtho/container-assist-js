/**
 * Error Recovery Service
 * Provides retry and error recovery functionality for tools
 */

import pRetry from 'p-retry';
import { normalizeError } from '../../errors/index';

// Re-export and alias types - backward compatible
export interface RetryOptions {
  retries?: number;
  factor?: number;
  minTimeout?: number;
  maxTimeout?: number;
  randomize?: boolean;
  // Backward compatibility
  maxAttempts?: number;
  delayMs?: number;
}

/**
 * Retry with Result type handling
 */
// Default retry configuration
const DEFAULT_RETRY_CONFIG = {
  retries: 3,
  minTimeout: 1000,
  factor: 2,
} as const;

export async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const pRetryOptions = {
    retries: options?.retries ?? options?.maxAttempts ?? DEFAULT_RETRY_CONFIG.retries,
    minTimeout: options?.minTimeout ?? options?.delayMs ?? DEFAULT_RETRY_CONFIG.minTimeout,
    factor: options?.factor ?? DEFAULT_RETRY_CONFIG.factor,
    ...(options?.maxTimeout && { maxTimeout: options.maxTimeout }),
    ...(options?.randomize !== undefined && { randomize: options.randomize }),
  };

  return pRetry(fn, pRetryOptions);
}

/**
 * Execute with retry, throwing errors
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const pRetryOptions: {
    retries: number;
    minTimeout: number;
    factor: number;
    maxTimeout?: number;
    randomize?: boolean;
  } = {
    retries: options?.retries ?? options?.maxAttempts ?? 3,
    minTimeout: options?.minTimeout ?? options?.delayMs ?? 1000,
    factor: options?.factor ?? 2,
  };

  if (options?.maxTimeout !== undefined) {
    pRetryOptions.maxTimeout = options.maxTimeout;
  }
  if (options?.randomize !== undefined) {
    pRetryOptions.randomize = options.randomize;
  }

  return pRetry(fn, pRetryOptions);
}

/**
 * Execute with error recovery
 */
export async function executeWithRecovery<T>(
  fn: () => Promise<T>,
  recoveryFn?: (error: unknown) => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  try {
    return await executeWithRetry(fn, options);
  } catch (error) {
    if (recoveryFn) {
      return recoveryFn(error);
    }
    throw normalizeError(error, 'Operation failed after retries');
  }
}
