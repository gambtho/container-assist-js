/**
 * @deprecated - This file is now redundant
 *
 * Use the Tool interface from lib/composition.ts directly.
 * The EnhancedTool interface was unnecessary abstraction.
 */

// Re-export the simple Tool interface for any remaining dependencies
export type { Tool as EnhancedTool } from '../../../lib/composition.js';

// Export the type guard for backward compatibility during migration
export const isEnhancedTool = (tool: any): tool is any => {
  return tool && typeof tool.execute === 'function';
};
