/**
 * Shared Validation Utilities
 * Centralized validation functions to reduce duplication across tools
 */

import { ValidationError } from '../../errors/index.js';

/**
 * Assert that a value is defined (not null or undefined)
 * Throws a ValidationError if the value is null or undefined
 */
export function assertDefined<T>(value: T | null | undefined, message: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new ValidationError(message);
  }
}

/**
 * Check if a value is defined
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Validate that a response matches expected structure
 */
export function isValidResponse<T>(
  response: unknown,
  validator: (r: unknown) => r is T,
): response is T {
  return response !== null && response !== undefined && validator(response);
}

/**
 * Assert that a string is not empty
 */
export function assertNonEmpty(
  value: string | undefined | null,
  fieldName: string,
): asserts value is string {
  if (!value || value.trim().length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`);
  }
}

/**
 * Assert that an array is not empty
 */
export function assertNonEmptyArray<T>(
  value: T[] | undefined | null,
  fieldName: string,
): asserts value is T[] {
  if (!value || value.length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`);
  }
}

/**
 * Validate that a value is within range
 */
export function assertInRange(value: number, min: number, max: number, fieldName: string): void {
  if (value < min || value > max) {
    throw new ValidationError(`${fieldName} must be between ${min} and ${max}`);
  }
}

/**
 * Safe parsing of JSON with validation
 */
export function parseJsonSafe<T>(
  jsonString: string,
  validator?: (obj: unknown) => obj is T,
): T | null {
  try {
    const parsed = JSON.parse(jsonString);
    if (validator && !validator(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Validate Docker image name format
 */
export function isValidDockerImage(imageName: string): boolean {
  // Basic Docker image name validation
  // Format: [registry/]namespace/repository[:tag]
  const imageRegex =
    /^(?:(?:[a-z0-9]+(?:[._-][a-z0-9]+)*\/)*)?[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[a-z0-9]+(?:[._-][a-z0-9]+)*)?$/i;
  return imageRegex.test(imageName);
}

/**
 * Validate Kubernetes resource name
 */
export function isValidK8sName(name: string): boolean {
  // Kubernetes naming conventions: lowercase alphanumeric or '-', must start and end with alphanumeric
  const k8sNameRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
  return k8sNameRegex.test(name) && name.length <= 253;
}

/**
 * Validate namespace name
 */
export function isValidNamespace(namespace: string): boolean {
  // Kubernetes namespace naming conventions
  const namespaceRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
  return namespaceRegex.test(namespace) && namespace.length <= 63;
}

/**
 * Type guard for checking if value has a specific property
 */
export function hasProperty<K extends string>(obj: unknown, key: K): obj is Record<K, unknown> {
  return typeof obj === 'object' && obj !== null && key in obj;
}

/**
 * Type guard for error objects
 */
export function isError(value: unknown): value is Error {
  return (
    value instanceof Error ||
    (typeof value === 'object' &&
      value !== null &&
      'message' in value &&
      typeof (value as any).message === 'string')
  );
}

/**
 * Convert unknown error to Error object
 */
export function toError(error: unknown): Error {
  if (isError(error)) {
    return error;
  }
  if (typeof error === 'string') {
    return new Error(error);
  }
  return new Error(String(error));
}

/**
 * Validate environment variable exists
 */
export function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new ValidationError(`Required environment variable ${key} is not set`);
  }
  return value;
}

/**
 * Get environment variable with default
 */
export function getEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}
