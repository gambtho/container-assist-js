/**
 * Core Types Entry Point
 *
 * Only re-exports the commonly used core types.
 * Import directly from ../core.js for other types.
 */

// Only export the commonly used types
export { type Result, Success, Failure, isOk, isFail, ErrorCode } from '../core.js';
