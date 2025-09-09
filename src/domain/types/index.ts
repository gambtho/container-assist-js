/**
 * Domain Types - Unified exports
 *
 * Central export point for all domain types including the new unified ToolContext
 */

// Unified ToolContext (NEW - replaces all previous context types)
export type {
  ToolContext,
  ToolContextFactory,
  ToolContextOptions,
  ServiceContainer,
  SamplingRequest,
  SamplingResponse,
  PromptWithMessages,
  ProgressReporter,
  SamplingService,
  PromptService,
  // Backward compatibility (deprecated)
  ExtendedToolContext,
  LegacyToolContext,
  MCPToolContext,
} from './tool-context';

// Re-export existing domain types that are still valid
export type { MCPContext, EnhancedMCPContext } from '../types';
