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
