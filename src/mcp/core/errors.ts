/**
 * MCP Error Classes
 * Simple error classes for MCP operations
 */

/**
 * Error thrown when an operation is cancelled
 */
export class CancelledError extends Error {
  constructor(message = 'Operation cancelled') {
    super(message);
    this.name = 'CancelledError';
  }
}
