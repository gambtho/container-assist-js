/**
 * Intelligent Tools Module Exports
 * Central export point for all intelligent tool functionality
 */

// Tool types and guards
export { isIntelligentTool } from './tool-wrapper.js';
export type { IntelligentTool } from './tool-wrapper.js';

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
  createIntelligentTool,
} from './tool-capabilities.js';
export type { Tool } from './tool-capabilities.js';

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
  createAIPoweredTools,
  createIntelligentToolRegistry,
} from './ai-tool-factory.js';
export type { ToolRegistry } from './ai-tool-factory.js';

// Intelligent Tools Factory (existing)
export {
  createIntelligentTools,
  getOrCreateIntelligentTools,
  getIntelligentToolsInstance,
  resetIntelligentToolsInstance,
  createContainerizationWorkflowConfig,
} from './tool-factory.js';
export type { IntelligentTools, IntelligentToolsConfig } from './tool-factory.js';

// Other intelligent components (if they exist)
export * from './ai-prompts.js';
export * from './ai-parameter-validator.js';
