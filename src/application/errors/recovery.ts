/**
 * Error Recovery Mechanisms
 * Implements retry logic, circuit breaker pattern, and graceful degradation
 */

import type { Logger } from 'pino';
import { convertToMcpError, isRetryableError } from './mcp-error-mapper';

/**
 * Safe retry condition that converts unknown errors to McpError first
 */
function safeRetryCondition(error: unknown): boolean {
  try {
    const mcpError = convertToMcpError(error);
    return isRetryableError(mcpError);
  } catch {
    return false;
  }
}

/**
 * Retry configuration options
 */
export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  jitter?: boolean;
  retryCondition?: (error: unknown) => boolean;
}

/**
 * Circuit breaker state
 */
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerOptions {
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number;
  monitoringWindow?: number;
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private lastSuccessTime = 0;

  constructor(
    private options: CircuitBreakerOptions = {},
    private logger?: Logger
  ) {
    this.options = {
      failureThreshold: 5,
      successThreshold: 3,
      timeout: 60000, // 1 minute
      monitoringWindow: 300000, // 5 minutes
      ...options
    };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime < (this.options.timeout ?? 60000)) {
        throw new Error('Circuit breaker is open');
      } else {
        this.state = 'half-open';
        this.logger?.info('Circuit breaker transitioning to half-open');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.successes++;
    this.lastSuccessTime = Date.now();

    if (this.state === 'half-open') {
      if (this.successes >= (this.options.successThreshold ?? 3)) {
        this.state = 'closed';
        this.failures = 0;
        this.successes = 0;
        this.logger?.info('Circuit breaker closed after successful recovery');
      }
    } else if (this.state === 'closed') {
      // Reset failure count after successful operations
      if (Date.now() - this.lastFailureTime > (this.options.monitoringWindow ?? 300000)) {
        this.failures = 0;
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'closed' || this.state === 'half-open') {
      if (this.failures >= (this.options.failureThreshold ?? 5)) {
        this.state = 'open';
        this.successes = 0;
        this.logger?.warn(
          {
            failures: this.failures,
            threshold: this.options.failureThreshold
          },
          'Circuit breaker opened due to failures'
        );
      }
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getMetrics(): {
    state: CircuitBreakerState;
    failures: number;
    successes: number;
    lastFailureTime: number;
    lastSuccessTime: number;
  } {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime
    };
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = 0;
    this.lastSuccessTime = 0;
    this.logger?.info('Circuit breaker manually reset');
  }
}

/**
 * Exponential backoff retry with jitter
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
  logger?: Logger
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    jitter = true,
    retryCondition = safeRetryCondition
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = await operation();
      if (attempt > 1) {
        logger?.info({ attempt, maxRetries }, 'Operation succeeded after retry');
      }
      return result;
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries + 1) {
        logger?.error(
          {
            attempt,
            maxRetries,
            finalError: error instanceof Error ? error.message : String(error)
          },
          'Operation failed after all retry attempts'
        );
        throw convertToMcpError(error);
      }

      if (!retryCondition(error)) {
        logger?.warn(
          {
            attempt,
            error: error instanceof Error ? error.message : String(error)
          },
          'Error not retryable, failing immediately'
        );
        throw convertToMcpError(error);
      }

      // Calculate delay with exponential backoff
      let delay = Math.min(initialDelay * Math.pow(backoffMultiplier, attempt - 1), maxDelay);

      // Add jitter to prevent thundering herd
      if (jitter) {
        delay = delay * (0.5 + Math.random() * 0.5);
      }

      logger?.warn(
        {
          attempt,
          maxRetries,
          delayMs: Math.round(delay),
          error: error instanceof Error ? error.message : String(error)
        },
        'Operation failed, retrying after delay'
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw convertToMcpError(lastError);
}

/**
 * Timeout wrapper with graceful degradation
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  fallback?: () => Promise<T> | T,
  logger?: Logger
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await operation();
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      logger?.warn({ timeoutMs }, 'Operation timed out');

      if (fallback) {
        logger?.info('Using fallback after timeout');
        return await fallback();
      }
    }

    throw convertToMcpError(error);
  }
}

/**
 * Bulkhead pattern - limit concurrent operations
 */
export class Bulkhead {
  private active = 0;
  private queue: Array<{
    operation: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }> = [];

  constructor(
    private maxConcurrent: number,
    private maxQueue: number = 100,
    private logger?: Logger
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task = {
        operation: async () => (await operation()) as unknown,
        resolve: (value: unknown) => resolve(value as T),
        reject: (error: unknown) => reject(error)
      };

      if (this.active < this.maxConcurrent) {
        void this.executeTask(task);
      } else if (this.queue.length < this.maxQueue) {
        this.queue.push(task);
        this.logger?.debug(
          {
            active: this.active,
            queued: this.queue.length,
            maxConcurrent: this.maxConcurrent
          },
          'Operation queued due to bulkhead limits'
        );
      } else {
        reject(convertToMcpError(new Error('Bulkhead queue is full')));
      }
    });
  }

  private async executeTask(task: {
    operation: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }): Promise<void> {
    this.active++;

    try {
      const result = await task.operation();
      task.resolve(result);
    } catch (error) {
      task.reject(convertToMcpError(error));
    } finally {
      this.active--;
      this.processQueue();
    }
  }

  private processQueue(): void {
    if (this.queue.length > 0 && this.active < this.maxConcurrent) {
      const task = this.queue.shift();
      if (task != null) {
        void this.executeTask(task);
      }
    }
  }

  getMetrics(): {
    active: number;
    queued: number;
    maxConcurrent: number;
    maxQueue: number;
  } {
    return {
      active: this.active,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      maxQueue: this.maxQueue
    };
  }
}

/**
 * Graceful degradation manager
 */
export class GracefulDegradation {
  private serviceLevels = new Map<
    string,
    {
      level: number;
      fallback: (() => Promise<unknown>) | null;
      lastCheck: number;
      failures: number;
    }
  >();

  constructor(private logger?: Logger) {}

  /**
   * Register a service with degradation levels
   */
  registerService(
    serviceName: string,
    levels: { level: number; fallback?: () => Promise<unknown> }[]
  ): void {
    // Start at highest level (0)
    this.serviceLevels.set(serviceName, {
      level: 0,
      fallback: levels.find((l) => l.level === 0)?.fallback ?? null,
      lastCheck: Date.now(),
      failures: 0
    });
  }

  /**
   * Execute operation with graceful degradation
   */
  async execute<T>(serviceName: string, operation: () => Promise<T>): Promise<T> {
    const service = this.serviceLevels.get(serviceName);
    if (!service) {
      throw new Error(`Service ${serviceName} not registered for graceful degradation`);
    }

    try {
      const result = await operation();

      // Reset failure count on success
      service.failures = 0;
      service.lastCheck = Date.now();

      return result;
    } catch (error) {
      service.failures++;
      service.lastCheck = Date.now();

      this.logger?.warn(
        {
          service: serviceName,
          failures: service.failures,
          level: service.level
        },
        'Service operation failed'
      );

      // Try fallback if available
      if (service.fallback) {
        this.logger?.info(
          {
            service: serviceName,
            level: service.level
          },
          'Using fallback due to service failure'
        );

        try {
          return (await service.fallback()) as T;
        } catch (fallbackError) {
          this.logger?.error(
            {
              service: serviceName,
              fallbackError:
                fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
            },
            'Fallback also failed'
          );
        }
      }

      throw convertToMcpError(error);
    }
  }

  /**
   * Check and update service degradation level
   */
  checkServiceHealth(serviceName: string): void {
    const service = this.serviceLevels.get(serviceName);
    if (!service) return;

    // Degrade service level based on failure count
    const now = Date.now();
    const timeSinceLastCheck = now - service.lastCheck;

    // If too many failures in recent time, degrade
    if (service.failures >= 5 && timeSinceLastCheck < 300000) {
      // 5 minutes
      if (service.level < 2) {
        service.level++;
        this.logger?.warn(
          {
            service: serviceName,
            newLevel: service.level,
            failures: service.failures
          },
          'Service degraded to lower level'
        );
      }
    } else if (service.failures === 0 && timeSinceLastCheck > 600000) {
      // 10 minutes
      // Recover service level if no failures for extended period
      if (service.level > 0) {
        service.level--;
        this.logger?.info(
          {
            service: serviceName,
            newLevel: service.level
          },
          'Service recovered to higher level'
        );
      }
    }
  }

  getServiceMetrics(): Record<string, unknown> {
    const metrics: Record<string, unknown> = {};

    this.serviceLevels.forEach((service, name) => {
      metrics[name] = {
        level: service.level,
        failures: service.failures,
        lastCheck: service.lastCheck,
        hasFallback: !!service.fallback
      };
    });

    return metrics;
  }
}

/**
 * Comprehensive error recovery decorator
 */
export function withErrorRecovery<T>(
  operation: () => Promise<T>,
  options: {
    retry?: RetryOptions;
    timeout?: number;
    fallback?: () => Promise<T> | T;
    circuitBreaker?: CircuitBreaker;
    bulkhead?: Bulkhead;
    gracefulDegradation?: {
      manager: GracefulDegradation;
      serviceName: string;
    };
  } = {},
  logger?: Logger
) {
  return async (): Promise<T> => {
    let wrappedOperation = operation;

    // Apply bulkhead if provided
    if (options.bulkhead) {
      const bulkhead = options.bulkhead;
      const originalOp = wrappedOperation;
      wrappedOperation = () => bulkhead.execute(originalOp);
    }

    // Apply circuit breaker if provided
    if (options.circuitBreaker) {
      const circuitBreaker = options.circuitBreaker;
      const originalOp = wrappedOperation;
      wrappedOperation = () => circuitBreaker.execute(originalOp);
    }

    // Apply timeout if specified
    if (options.timeout != null && options.timeout > 0) {
      const originalOp = wrappedOperation;
      wrappedOperation = () =>
        withTimeout(originalOp, options.timeout ?? 0, options.fallback, logger);
    }

    // Apply graceful degradation if provided
    if (options.gracefulDegradation) {
      const originalOp = wrappedOperation;
      const { manager, serviceName } = options.gracefulDegradation;
      wrappedOperation = async () => await manager.execute(serviceName, originalOp);
    }

    // Apply retry logic if specified
    if (options.retry) {
      return withRetry(wrappedOperation, options.retry, logger);
    }

    return wrappedOperation();
  };
}

/**
 * Create a resilient operation with all recovery mechanisms
 */
export function createResilientOperation<T>(
  operation: () => Promise<T>,
  options: {
    retry?: RetryOptions;
    timeout?: number;
    circuitBreaker?: CircuitBreakerOptions;
    bulkhead?: { maxConcurrent: number; maxQueue?: number };
    fallback?: () => Promise<T> | T;
    serviceName?: string;
  } = {},
  logger?: Logger
): () => Promise<T> {
  const circuitBreaker = options.circuitBreaker
    ? new CircuitBreaker(options.circuitBreaker, logger)
    : undefined;

  const bulkhead = options.bulkhead
    ? new Bulkhead(options.bulkhead.maxConcurrent, options.bulkhead.maxQueue, logger)
    : undefined;

  const gracefulDegradation =
    options.serviceName != null && options.serviceName !== ''
      ? new GracefulDegradation(logger)
      : undefined;

  if (gracefulDegradation && options.serviceName != null && options.serviceName !== '') {
    const fallbackFn = options.fallback;
    gracefulDegradation.registerService(options.serviceName, [
      { level: 0 },
      ...(fallbackFn ? [{ level: 1, fallback: async () => Promise.resolve(fallbackFn()) }] : [])
    ]);
  }

  const recoveryOptions: Parameters<typeof withErrorRecovery>[1] = {};

  if (options.retry) recoveryOptions.retry = options.retry;
  if (options.timeout != null && options.timeout > 0) recoveryOptions.timeout = options.timeout;
  if (options.fallback) recoveryOptions.fallback = options.fallback;
  if (circuitBreaker) recoveryOptions.circuitBreaker = circuitBreaker;
  if (bulkhead) recoveryOptions.bulkhead = bulkhead;
  if (gracefulDegradation && options.serviceName != null && options.serviceName !== '') {
    recoveryOptions.gracefulDegradation = {
      manager: gracefulDegradation,
      serviceName: options.serviceName
    };
  }

  return withErrorRecovery(operation, recoveryOptions, logger) as () => Promise<T>;
}
