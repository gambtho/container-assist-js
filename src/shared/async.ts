/**
 * Async utilities for retry, timeout, and sleep operations
 */

export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoff?: number;
  maxDelayMs?: number;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function retry<T>(
  fn: () => Promise<T>,
  { maxAttempts = 3, delayMs = 1000, backoff = 2, maxDelayMs = 30_000 }: RetryOptions = {}
): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (attempt === maxAttempts) break;
      const wait = Math.min(delayMs * Math.pow(backoff, attempt - 1), maxDelayMs);
      await sleep(wait);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  message = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    fn(),
    sleep(timeoutMs).then(() => {
      throw new Error(message);
    })
  ]) as Promise<T>;
}

/**
 * Execute a function with timeout
 */
export interface TimeoutOptions {
  timeoutMs: number;
  errorMessage?: string;
}

export async function withTimeoutOptions<T>(
  fn: () => Promise<T>,
  options: TimeoutOptions
): Promise<T> {
  const { timeoutMs, errorMessage = 'Operation timed out' } = options;
  return withTimeout(fn, timeoutMs, errorMessage);
}
