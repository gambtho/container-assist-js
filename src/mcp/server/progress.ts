/**
 * Progress notification helper for MCP tools
 * DEPRECATED: Use @mcp/utils/progress-helper instead
 * This file is kept for backward compatibility only
 */

import type { ProgressToken } from '@modelcontextprotocol/sdk/types.js';

/**
 * Progress notification interface for MCP server
 */
export interface ProgressNotifier {
  sendProgress(
    token: ProgressToken,
    progress: {
      progress: number;
      message?: string;
      total?: number;
    },
  ): Promise<void>;
}

/**
 * Standard progress stages for common tool operations
 * @deprecated Use STANDARD_STAGES from @mcp/utils/progress-helper instead
 */
export const ProgressStages = {
  INITIALIZING: { progress: 0, message: 'Initializing...' },
  VALIDATING: { progress: 10, message: 'Validating parameters...' },
  PREPARING: { progress: 20, message: 'Preparing resources...' },
  EXECUTING: { progress: 50, message: 'Executing operation...' },
  PROCESSING: { progress: 80, message: 'Processing results...' },
  FINALIZING: { progress: 90, message: 'Finalizing...' },
  COMPLETE: { progress: 100, message: 'Complete' },
} as const;
