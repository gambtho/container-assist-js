/**
 * Type-safe test helper functions for common testing patterns
 */

import { Success, Failure, type Result, isOk, isFail } from '../../../../domain/types/result';
import type { WorkflowState, Session } from '../../../../domain/types/session';
import type { Dirent } from 'node:fs';
import { jest } from '@jest/globals';

/**
 * Type guard to check if a value is a WorkflowState
 */
export function isWorkflowState(value: unknown): value is WorkflowState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'completed_steps' in value &&
    'errors' in value &&
    'metadata' in value
  );
}

/**
 * Assert that a value is a WorkflowState (throws if not)
 */
export function assertWorkflowState(value: unknown): asserts value is WorkflowState {
  if (!isWorkflowState(value)) {
    throw new Error('Value is not a WorkflowState');
  }
}

/**
 * Type guard for Session objects
 */
export function isSession(value: unknown): value is Session {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'status' in value &&
    'version' in value &&
    'created_at' in value &&
    'updated_at' in value
  );
}

/**
 * Assert that a Result is successful and return the value
 */
export function expectSuccess<T>(result: Result<T>): T {
  if (!isOk(result)) {
    throw new Error(`Expected success but got failure: ${result.error}`);
  }
  return result.value;
}

/**
 * Assert that a Result is a failure and return the error
 */
export function expectFailure<T>(result: Result<T>): string {
  if (!isFail(result)) {
    throw new Error('Expected failure but got success');
  }
  return result.error;
}

/**
 * Safe error message extraction from unknown error types
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'Unknown error occurred';
}

/**
 * Helper to create a Result from a potentially throwing function
 */
export async function tryAsync<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const value = await fn();
    return Success(value);
  } catch (error) {
    return Failure(getErrorMessage(error));
  }
}

/**
 * Helper to create a Result from a synchronous potentially throwing function
 */
export function trySync<T>(fn: () => T): Result<T> {
  try {
    const value = fn();
    return Success(value);
  } catch (error) {
    return Failure(getErrorMessage(error));
  }
}

/**
 * Type guard to check if a value is a Record<string, unknown>
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Helper to safely access nested properties with type checking
 */
export function safeGet<T>(obj: unknown, path: string[], defaultValue: T): T {
  if (!isRecord(obj)) return defaultValue;

  let current: unknown = obj;
  for (const key of path) {
    if (!isRecord(current) || !(key in current)) {
      return defaultValue;
    }
    current = current[key];
  }

  return current as T;
}

/**
 * Create a typed mock response with proper structure
 */
export function createMockResponse<T>(
  data: T,
  metadata?: Record<string, unknown>,
): {
  data: T;
  success: boolean;
  metadata: Record<string, unknown>;
  timestamp: string;
} {
  return {
    data,
    success: true,
    metadata: metadata ?? {},
    timestamp: new Date().toISOString(),
  };
}

/**
 * Helper to wait for a condition with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options?: {
    timeout?: number;
    interval?: number;
    message?: string;
  },
): Promise<void> {
  const timeout = options?.timeout ?? 5000;
  const interval = options?.interval ?? 100;
  const message = options?.message ?? 'Condition not met';

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await condition();
    if (result) return;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout waiting for condition: ${message}`);
}

/**
 * Type-safe property matcher for partial object matching
 */
export function matchesPartial<T extends Record<string, unknown>>(
  actual: T,
  expected: Partial<T>,
): boolean {
  for (const key in expected) {
    if (actual[key] !== expected[key]) {
      return false;
    }
  }
  return true;
}

/**
 * Create a delay promise for testing async behavior
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helper to create deterministic test data based on input
 */
export function deterministicTestData<T>(seed: string, generator: (hash: number) => T): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return generator(Math.abs(hash));
}

/**
 * Type guard for arrays with minimum length
 */
export function isNonEmptyArray<T>(value: T[]): value is [T, ...T[]] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Assert array has minimum length
 */
export function assertNonEmpty<T>(
  array: T[],
  message = 'Array is empty',
): asserts array is [T, ...T[]] {
  if (!isNonEmptyArray(array)) {
    throw new Error(message);
  }
}

/**
 * Type-safe cast for Dirent arrays (common in file system mocks)
 */
export function asDirentArray(
  items: Array<{ name: string; isDirectory: () => boolean }>,
): Dirent[] {
  return items as unknown as Dirent[];
}

/**
 * Type-safe property deletion
 */
export function deleteProperty<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  key: K,
): Omit<T, K> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

/**
 * Type-safe mock event emitter emit assertion
 */
export function expectEmit(mockEmitter: unknown, expectedPayload: unknown): void {
  const emitter = mockEmitter as { emit: jest.MockedFunction<(payload: unknown) => void> };
  expect(emitter.emit).toHaveBeenCalledWith(expectedPayload);
}

/**
 * Safe type assertion with validation
 */
export function assertType<T>(
  value: unknown,
  validator: (v: unknown) => v is T,
  message = 'Type assertion failed',
): T {
  if (!validator(value)) {
    throw new Error(message);
  }
  return value;
}
