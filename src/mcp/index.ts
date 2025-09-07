/**
 * MCP Module Exports
 * Central export point for all MCP-related functionality
 */

// Core MCP Server
export { ContainerizationMCPServer } from './server.js';
export type { MCPServer, MCPServerOptions, MCPRequest, MCPResponse } from './types.js';

// Enhanced MCP Components
export { extendServerCapabilities } from './server-extensions.js';
export type { ProgressReporter, ToolContext } from './server-extensions.js';

// Session Management
export {
  getOrCreateSession,
  getSessionState,
  updateSessionState,
  storeStepResult,
  addCompletedStep,
  clearSession,
} from './session/manager.js';

// Resources
export { McpResourceManager } from './resources/manager.js';
export {
  AIResourceManager,
  createAIResourceManager,
} from './resources/ai-resource-manager.js';
export type { AIResource, AIContext } from './resources/ai-resource-manager.js';

// Prompt Templates
export {
  IntelligentPromptManager,
  createIntelligentPromptManager,
  PROMPT_TEMPLATES,
} from './prompts/intelligent-templates.js';
export type { PromptTemplate, TemplateArgument } from './prompts/intelligent-templates.js';

// Tool Registry
export { getMCPRegistry } from './registry.js';

// Tools
export * from './tools.js';

// Errors
export { CancelledError } from './errors.js';
