/**
 * MCP Module Exports
 * Central export point for all MCP-related functionality
 */

// Core MCP Server
export { ContainerizationMCPServer } from './server.js';
export type { MCPServer, MCPServerOptions, MCPRequest, MCPResponse } from './types.js';

// Enhanced MCP Components
export { enhanceServer } from './enhanced-server.js';
export type { ProgressReporter, ToolContext } from './enhanced-server.js';

// Session Management
export { SessionManager, createSessionManager } from './session/manager.js';

// Resources
export { McpResourceManager } from './resources/manager.js';
export {
  EnhancedResourceManager,
  createEnhancedResourceManager,
} from './resources/enhanced-manager.js';
export type { EnhancedResource, AIContext } from './resources/enhanced-manager.js';

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
