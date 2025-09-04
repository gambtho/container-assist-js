/**
 * Central utilities module
 * Re-exports session utilities and provides essential shared functions
 */

// Re-export session utilities (actively used)
export { SessionUtils } from '../application/session/shared';

/**
 * Sleep for specified milliseconds
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

// Note: Other utility functions have been moved to their respective domains:
// - Async utilities: src/application/utils/async-utils.ts
// - State utilities: src/application/utils/state-utils.ts
// - Validation utilities: src/application/utils/validation-utils.ts
// This follows the principle of keeping utilities close to their usage contexts.
