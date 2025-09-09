/**
 * Domain Types - Tool Context
 *
 * Re-exports ToolContext and related types from MCP implementation.
 * This provides a stable import path for tools that expect domain-level types.
 *
 * ## Migration Guide
 *
 * This file was created as part of the Part B anti-pattern refactoring to provide
 * a unified ToolContext interface. All tools should import from this location:
 *
 * ```typescript
 * import type { ToolContext } from '../../domain/types/tool-context';
 * ```
 *
 * ## Key Changes from Previous Context Types
 *
 * 1. **Unified Interface**: Single ToolContext replaces multiple context interfaces
 * 2. **Required Logger**: Logger is now required, not optional
 * 3. **Simplified AI Access**: Direct sampling instead of complex AI service chains
 * 4. **MCP Protocol Compliance**: All AI interactions use proper MCP protocols
 *
 * @see {@link ../../mcp/context/types.ts} for implementation details
 * @since 2.0.0 - Part of the anti-pattern refactoring effort
 */

// Re-export all ToolContext types from MCP implementation
export type {
  /**
   * Main context interface for all tools - replaces previous context inheritance chain
   * @see {@link ../../mcp/context/types.ts#ToolContext} for detailed documentation
   */
  ToolContext,

  /**
   * Factory function for creating ToolContext instances
   */
  ToolContextFactory,

  /**
   * Configuration options for ToolContext creation
   */
  ToolContextConfig,

  /**
   * Request structure for AI sampling operations
   */
  SamplingRequest,

  /**
   * Response structure from AI sampling operations
   */
  SamplingResponse,

  /**
   * Prompt with processed messages ready for use
   */
  PromptWithMessages,

  /**
   * Function signature for progress reporting
   */
  ProgressReporter,

  /**
   * MCP-compatible message structure
   */
  TextMessage,
} from '../../mcp/context/types';
