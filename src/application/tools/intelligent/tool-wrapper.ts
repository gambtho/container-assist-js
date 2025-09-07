/**
 * Legacy tool wrapper interface
 * Kept for type compatibility only - use tool-enhancers.ts for new code
 */

import type { Result } from '../../../types/core/index.js';
import type { Logger } from 'pino';

export interface EnhancedTool {
  name: string;
  description: string;
  schema?: any;
  execute: (params: any, logger: Logger) => Promise<Result<any>>;
  executeEnhanced?: (params: any, context: any) => Promise<Result<any>>;
}

// Type guard for enhanced tools
export const isEnhancedTool = (tool: any): tool is EnhancedTool & { executeEnhanced: Function } => {
  return tool && typeof tool.executeEnhanced === 'function';
};
