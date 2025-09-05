/**
 * Simplified Result Pattern
 * Basic discriminated union for error handling without complex monadic utilities
 */

/**
 * Result type - simple discriminated union
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Create a success result
 */
export const Success = <T>(value: T): Result<T> => ({ ok: true, value });

/**
 * Create a failure result
 */
export const Failure = <T>(error: string): Result<T> => ({ ok: false, error });

/**
 * Type guard to check if result is successful
 */
export const isOk = <T>(result: Result<T>): result is { ok: true; value: T } => result.ok;

/**
 * Type guard to check if result is a failure
 */
export const isFail = <T>(result: Result<T>): result is { ok: false; error: string } => !result.ok;
