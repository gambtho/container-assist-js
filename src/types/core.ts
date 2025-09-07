/**
 * Core types for the containerization assist system
 */

/**
 * Result type - simple discriminated union for error handling
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
 * Type guard to check if result is a failure
 */
export const isFail = <T>(result: Result<T>): result is { ok: false; error: string } => !result.ok;

/**
 * Infrastructure-level errors
 */

/**
 * Service-level errors
 */

// ===== INTERFACE TYPES =====

export interface ProgressUpdate {
  sessionId: string;
  step: string;
  status: 'starting' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface ProgressEmitter {
  emit(update: ProgressUpdate): void;
}
