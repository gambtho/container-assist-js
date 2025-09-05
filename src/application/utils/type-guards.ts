/**
 * Type Guards for Safe Type Casting and Validation
 */

/**
 * Check if value is Zod schema shape (for test mocking)
 */
export function isZodShape(obj: unknown): obj is Record<string, unknown> {
  return obj !== null && typeof obj === 'object';
}
