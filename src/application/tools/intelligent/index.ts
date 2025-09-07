/**
 * Enhanced Tools Module Exports
 * Central export point for all enhanced tool functionality
 */

// Tool types and guards
export { isEnhancedTool } from './intelligent-tool-wrapper.js';
export type { EnhancedTool } from './intelligent-tool-wrapper.js';

// Tool Enhancers (new functional approach)
export {
  withAIValidation,
  withAIAnalysis,
  withMetrics,
  withRetry,
  withLogging,
  withSessionTracking,
  withProgressReporting,
  withCancellation,
  composeEnhancers,
  createEnhancedTool,
} from './tool-enhancers.js';
export type { Tool } from './tool-enhancers.js';

// Intelligent Tool Factory (new functional approach)
export {
  createToolRegistry,
  getTool,
  getAllTools,
  withAIEnhancement,
  createAnalyzeRepoWithAI,
  createDockerfileGeneratorWithAI,
  createScannerWithAI,
  createWorkflowExecutorWithAI,
  createBaseTools,
  createAIEnhancedTools,
  createEnhancedToolRegistry,
} from './intelligent-factory.js';
export type { ToolRegistry } from './intelligent-factory.js';

// Enhanced Tools Factory (existing)
export {
  createEnhancedTools,
  getOrCreateEnhancedTools,
  getEnhancedToolsInstance,
  resetEnhancedToolsInstance,
  createEnhancedWorkflowConfig,
} from './factory.js';
export type { EnhancedTools, EnhancedToolsConfig } from './factory.js';

// Other enhanced components (if they exist)
export * from './prompt-templates.js';
export * from './ai-parameter-validator.js';
