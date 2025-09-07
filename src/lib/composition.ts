/**
 * Functional composition utilities for TypeScript
 *
 * Provides pipe, compose, and specialized composition functions
 * to replace Java-style class hierarchies with functional patterns.
 */

import type { Result } from '../types/core/index.js';

/**
 * Pipe functions left-to-right
 * @example
 * const enhance = pipe(
 *   addLogging,
 *   addMetrics,
 *   addRetry
 * );
 * const enhancedTool = enhance(baseTool);
 */
export function pipe<T>(...fns: Array<(arg: T) => T>): (arg: T) => T {
  return (arg: T) => fns.reduce((acc, fn) => fn(acc), arg);
}

/**
 * Compose functions right-to-left
 * @example
 * const enhance = compose(
 *   addRetry,
 *   addMetrics,
 *   addLogging
 * );
 * const enhancedTool = enhance(baseTool);
 */
export function compose<T>(...fns: Array<(arg: T) => T>): (arg: T) => T {
  return (arg: T) => fns.reduceRight((acc, fn) => fn(acc), arg);
}

/**
 * Async pipe functions left-to-right
 * @example
 * const process = pipeAsync(
 *   validateInput,
 *   fetchData,
 *   transform,
 *   saveResult
 * );
 * const result = await process(input);
 */
export function pipeAsync<T>(...fns: Array<(arg: T) => Promise<T>>): (arg: T) => Promise<T> {
  return async (arg: T) => {
    let result = arg;
    for (const fn of fns) {
      result = await fn(result);
    }
    return result;
  };
}

/**
 * Async compose functions right-to-left
 */
export function composeAsync<T>(...fns: Array<(arg: T) => Promise<T>>): (arg: T) => Promise<T> {
  return async (arg: T) => {
    let result = arg;
    for (const fn of fns.reverse()) {
      result = await fn(result);
    }
    return result;
  };
}

/**
 * Identity function - returns input unchanged
 * Useful as a no-op in conditional composition
 */
export function identity<T>(x: T): T {
  return x;
}

/**
 * Conditional composition - applies function if predicate is true
 * @example
 * const enhance = pipe(
 *   addLogging,
 *   when(config.enableMetrics, addMetrics),
 *   when(config.enableRetry, addRetry)
 * );
 */
export function when<T>(
  predicate: boolean | ((arg: T) => boolean),
  fn: (arg: T) => T,
): (arg: T) => T {
  return (arg: T) => {
    const shouldApply = typeof predicate === 'function' ? predicate(arg) : predicate;
    return shouldApply ? fn(arg) : arg;
  };
}

/**
 * Async conditional composition
 */
export function whenAsync<T>(
  predicate: boolean | ((arg: T) => boolean) | ((arg: T) => Promise<boolean>),
  fn: (arg: T) => Promise<T>,
): (arg: T) => Promise<T> {
  return async (arg: T) => {
    const shouldApply =
      typeof predicate === 'function' ? await Promise.resolve(predicate(arg)) : predicate;
    return shouldApply ? await fn(arg) : arg;
  };
}

/**
 * Tap function - executes side effect without changing the value
 * @example
 * const process = pipe(
 *   validate,
 *   tap(logInput),
 *   transform,
 *   tap(logOutput),
 *   save
 * );
 */
export function tap<T>(fn: (arg: T) => void): (arg: T) => T {
  return (arg: T) => {
    fn(arg);
    return arg;
  };
}

/**
 * Async tap function
 */
export function tapAsync<T>(fn: (arg: T) => Promise<void>): (arg: T) => Promise<T> {
  return async (arg: T) => {
    await fn(arg);
    return arg;
  };
}

/**
 * Map over Result type
 */
export function mapResult<T, U>(fn: (value: T) => U): (result: Result<T>) => Result<U> {
  return (result: Result<T>) => {
    if (result.ok) {
      return { ok: true, value: fn(result.value) };
    }
    return result as Result<U>;
  };
}

/**
 * FlatMap over Result type
 */
export function flatMapResult<T, U>(fn: (value: T) => Result<U>): (result: Result<T>) => Result<U> {
  return (result: Result<T>) => {
    if (result.ok) {
      return fn(result.value);
    }
    return result as Result<U>;
  };
}

/**
 * Retry wrapper for async functions
 * @example
 * const fetchWithRetry = withRetry(3, 1000)(fetchData);
 */
export function withRetry(
  maxAttempts: number = 3,
  delayMs: number = 1000,
  backoff: boolean = true,
) {
  return <T extends (...args: any[]) => Promise<any>>(fn: T): T => {
    return (async (...args: Parameters<T>) => {
      let lastError: Error | undefined;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await fn(...args);
        } catch (error) {
          lastError = error as Error;

          if (attempt < maxAttempts) {
            const delay = backoff ? delayMs * attempt : delayMs;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      throw lastError;
    }) as T;
  };
}

/**
 * Memoize function results
 * @example
 * const expensiveOperation = memoize(calculateExpensive);
 */
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  keyFn?: (...args: Parameters<T>) => string,
): T {
  const cache = new Map<string, ReturnType<T>>();

  return ((...args: Parameters<T>) => {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key);
    }

    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
}

/**
 * Debounce function calls
 */
export function debounce<T extends (...args: any[]) => any>(fn: T, delayMs: number): T {
  let timeoutId: NodeJS.Timeout | undefined;

  return ((...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    return new Promise((resolve) => {
      timeoutId = setTimeout(() => {
        resolve(fn(...args));
      }, delayMs);
    });
  }) as T;
}

/**
 * Throttle function calls
 */
export function throttle<T extends (...args: any[]) => any>(fn: T, limitMs: number): T {
  let lastCall = 0;
  let lastResult: ReturnType<T>;

  return ((...args: Parameters<T>) => {
    const now = Date.now();

    if (now - lastCall >= limitMs) {
      lastCall = now;
      lastResult = fn(...args);
    }

    return lastResult;
  }) as T;
}

/**
 * Curry a function
 * @example
 * const add = (a: number, b: number, c: number) => a + b + c;
 * const curriedAdd = curry(add);
 * curriedAdd(1)(2)(3); // 6
 */
export function curry<T extends (...args: any[]) => any>(fn: T): any {
  return function curried(...args: any[]): any {
    if (args.length >= fn.length) {
      return fn(...args);
    }
    return (...nextArgs: any[]) => curried(...args, ...nextArgs);
  };
}

/**
 * Partial application
 * @example
 * const multiply = (a: number, b: number) => a * b;
 * const double = partial(multiply, 2);
 * double(5); // 10
 */
export function partial<T extends (...args: any[]) => any>(
  fn: T,
  ...fixedArgs: any[]
): (...args: any[]) => ReturnType<T> {
  return (...remainingArgs: any[]) => fn(...fixedArgs, ...remainingArgs);
}

/**
 * Tool-specific composition types
 */
export interface Tool {
  name: string;
  execute: (params: any, logger: any) => Promise<Result<any>>;
}

export type ToolEnhancer = <T extends Tool>(tool: T) => T;

/**
 * Compose multiple tool enhancers
 * @example
 * const enhance = composeToolEnhancers(
 *   withLogging(logger),
 *   withMetrics(metricsCollector),
 *   withRetry({ attempts: 3 })
 * );
 * const enhancedTool = enhance(baseTool);
 */
export function composeToolEnhancers(...enhancers: ToolEnhancer[]): ToolEnhancer {
  return <T extends Tool>(tool: T) =>
    enhancers.reduce((enhanced, enhancer) => enhancer(enhanced), tool);
}

/**
 * Parallel execution with error handling
 * @example
 * const results = await parallel(
 *   fetchUserData,
 *   fetchOrderHistory,
 *   fetchRecommendations
 * )(userId);
 */
export function parallel<T, R>(...fns: Array<(arg: T) => Promise<R>>): (arg: T) => Promise<R[]> {
  return async (arg: T) => {
    return Promise.all(fns.map((fn) => fn(arg)));
  };
}

/**
 * Race execution - returns first successful result
 */
export function race<T, R>(...fns: Array<(arg: T) => Promise<R>>): (arg: T) => Promise<R> {
  return async (arg: T) => {
    return Promise.race(fns.map((fn) => fn(arg)));
  };
}

/**
 * Sequential execution with accumulator
 * @example
 * const process = sequence(
 *   (data) => ({ ...data, step1: true }),
 *   (data) => ({ ...data, step2: true }),
 *   (data) => ({ ...data, step3: true })
 * );
 */
export function sequence<T>(...fns: Array<(arg: T) => T>): (arg: T) => T {
  return pipe(...fns);
}

/**
 * Async sequential execution
 */
export function sequenceAsync<T>(...fns: Array<(arg: T) => Promise<T>>): (arg: T) => Promise<T> {
  return pipeAsync(...fns);
}
