/**
 * Intelligent Tools Module Exports
 * Central export point for all intelligent tool functionality
 */

// Tool enhancement functions (new functional approach)
export {
  enhanceWithDefaults,
  enhanceForAI,
  enhanceForProduction,
  composeEnhancers,
} from './tool-capabilities.js';
export type { Tool, IntelligentTool } from './tool-capabilities.js';

// Tool registry (functional approach)
export {
  createToolRegistry,
  getTool,
  getAllTools,
  withAI,
  createEnhancedToolRegistry,
  getRegistryStats,
} from './ai-tool-factory.js';
export type { ToolRegistry } from './ai-tool-factory.js';

// Legacy tool factory (functional composition)
export { withLogging, withMetrics, withRetry, createWorkflowConfig } from './tool-factory.js';

// AI components
export * from './ai-prompts.js';
export * from './ai-parameter-validator.js';

// Deprecated exports (backward compatibility)
export { createIntelligentTool } from './tool-capabilities.js';
export { createAIToolRegistry } from './ai-tool-factory.js';
