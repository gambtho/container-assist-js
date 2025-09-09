/**
 * Domain Types - Core exports
 *
 * Central export point for all domain types including ToolContext
 */

// Re-export ToolContext from MCP types (main definition)
export type {
  ToolContext,
  ToolContextFactory,
  ToolContextConfig,
  SamplingRequest,
  SamplingResponse,
  PromptWithMessages,
  ProgressReporter,
} from '../../mcp/context/types';
