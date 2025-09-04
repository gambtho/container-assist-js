/**
 * Shared Error Recovery Utilities
 * Centralized error recovery patterns for consistent error handling
 */

import type { Logger } from 'pino';
import { withRetry, withTimeout } from './async-utils.js';
import { toError } from './validation-utils.js';

/**
 * Error recovery strategy options
 */
export interface RecoveryOptions {
  fallback?: () => Promise<unknown>;
  gracefulDegradation?: boolean;
  cacheResult?: boolean;
  logger?: Logger;
}

/**
 * Circuit breaker options
 */
export interface CircuitBreakerOptions {
  threshold: number;
  timeout: number;
  resetTimeout: number;
  logger?: Logger;
}

/**
 * Circuit breaker state
 */
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private lastFailureTime: number | undefined;
  private successCount = 0;

  constructor(private options: CircuitBreakerOptions) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const { threshold, timeout, resetTimeout, logger } = this.options;

    // Check circuit state
    if (this.state === CircuitState.OPEN) {
      const timeSinceLastFailure = Date.now() - (this.lastFailureTime ?? 0);

      if (timeSinceLastFailure >= resetTimeout) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;

        if (logger) {
          logger.info('Circuit breaker entering half-open state');
        }
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await withTimeout(operation(), {
        timeout,
        errorMessage: 'Circuit breaker timeout',
      });

      // Handle success
      if (this.state === CircuitState.HALF_OPEN) {
        this.successCount++;

        if (this.successCount >= threshold) {
          this.state = CircuitState.CLOSED;
          this.failures = 0;

          if (logger) {
            logger.info('Circuit breaker closed');
          }
        }
      } else {
        this.failures = 0;
      }

      return result;
    } catch (error) {
      // Handle failure
      this.failures++;
      this.lastFailureTime = Date.now();

      if (this.failures >= threshold) {
        this.state = CircuitState.OPEN;

        if (logger) {
          logger.error(
            { failures: this.failures, error: toError(error).message },
            'Circuit breaker opened',
          );
        }
      }

      throw error;
    }
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.lastFailureTime = undefined;
    this.successCount = 0;
  }

  getState(): CircuitState {
    return this.state;
  }
}

/**
 * Execute with fallback
 */
export async function withFallback<T>(
  operation: () => Promise<T>,
  fallback: () => T | Promise<T>,
  logger?: Logger,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (logger) {
      logger.warn({ error: toError(error).message }, 'Operation failed, using fallback');
    }

    return await fallback();
  }
}

/**
 * Execute with graceful degradation
 */
export async function withGracefulDegradation<T, F>(
  operation: () => Promise<T>,
  degradedOperation: () => Promise<F>,
  logger?: Logger,
): Promise<T | F> {
  try {
    return await operation();
  } catch (error) {
    if (logger) {
      logger.warn(
        { error: toError(error).message },
        'Primary operation failed, degrading gracefully',
      );
    }

    try {
      return await degradedOperation();
    } catch (degradedError) {
      if (logger) {
        logger.error({ error: toError(degradedError).message }, 'Degraded operation also failed');
      }
      throw degradedError;
    }
  }
}

/**
 * Bulkhead pattern - limit concurrent operations
 */
export class Bulkhead {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(
    private limit: number,
    private queueLimit = Infinity,
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.running >= this.limit) {
      if (this.queue.length >= this.queueLimit) {
        throw new Error('Bulkhead queue limit exceeded');
      }

      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }

    this.running++;

    try {
      return await operation();
    } finally {
      this.running--;

      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }

  getRunning(): number {
    return this.running;
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}

/**
 * Cache with TTL for recovery scenarios
 */
export class RecoveryCache<T> {
  private cache = new Map<string, { value: T; expires: number }>();

  constructor(
    private ttl: number = 60000, // Default 1 minute
    private maxSize: number = 100,
  ) {}

  set(key: string, value: T): void {
    // Evict oldest if at max size
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      value,
      expires: Date.now() + this.ttl,
    });
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Execute with caching for recovery
 */
export async function withCache<T>(
  key: string,
  operation: () => Promise<T>,
  cache: RecoveryCache<T>,
  logger?: Logger,
): Promise<T> {
  // Check cache first
  const cached = cache.get(key);
  if (cached !== undefined) {
    if (logger) {
      logger.debug({ key }, 'Using cached result');
    }
    return cached;
  }

  try {
    const result = await operation();
    cache.set(key, result);
    return result;
  } catch (error) {
    // Try cache on error as fallback
    const fallbackCached = cache.get(key);
    if (fallbackCached !== undefined) {
      if (logger) {
        logger.warn({ key, error: toError(error).message }, 'Operation failed, using stale cache');
      }
      return fallbackCached;
    }

    throw error;
  }
}

/**
 * Composite recovery strategy
 */
export async function withRecovery<T>(
  operation: () => Promise<T>,
  options: {
    retry?: {
      maxAttempts: number;
      backoff?: 'linear' | 'exponential';
    };
    timeout?: number;
    fallback?: () => T | Promise<T>;
    cache?: {
      key: string;
      cache: RecoveryCache<T>;
    };
    circuitBreaker?: CircuitBreaker;
    logger?: Logger;
  },
): Promise<T> {
  let wrappedOperation = operation;

  // Apply timeout
  if (options.timeout) {
    const originalOp = wrappedOperation;
    wrappedOperation = () => withTimeout(originalOp(), options.timeout!);
  }

  // Apply retry
  if (options.retry) {
    const originalOp = wrappedOperation;
    const retryOptions: any = { ...options.retry };
    if (options.logger) {
      retryOptions.logger = options.logger;
    }
    wrappedOperation = () => withRetry(originalOp, retryOptions);
  }

  // Apply circuit breaker
  if (options.circuitBreaker) {
    const originalOp = wrappedOperation;
    wrappedOperation = () => options.circuitBreaker!.execute(originalOp);
  }

  // Apply caching
  if (options.cache) {
    const originalOp = wrappedOperation;
    wrappedOperation = () =>
      withCache(options.cache!.key, originalOp, options.cache!.cache, options.logger);
  }

  // Apply fallback
  if (options.fallback) {
    return withFallback(wrappedOperation, options.fallback, options.logger);
  }

  return wrappedOperation();
}
