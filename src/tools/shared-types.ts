/**
 * Shared types for tools
 *
 * This file contains shared type definitions used across multiple tools
 */

// This file previously contained ExtendedToolContext
// All types have been consolidated into ToolContext
// Re-export ToolContext for compatibility during migration
export type { ToolContext } from '../mcp/context/types';
