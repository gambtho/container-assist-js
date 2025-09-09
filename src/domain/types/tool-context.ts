/**
 * Unified Tool Context Interface
 *
 * This interface consolidates all previously fragmented context types into a single,
 * clean interface. It provides all services needed by MCP tools while maintaining
 * minimal required fields and maximum flexibility.
 *
 * Design Principles:
 * - Only logger is required (most essential service)
 * - All other services are optional for maximum flexibility
 * - Flat structure with no inheritance/extension
 * - Clear semantic grouping via comments
 * - Backward compatibility with existing patterns
 */

import type { Logger } from 'pino';
// AbortSignal is available globally in Node.js 16+

// AI/Sampling related types
export interface SamplingRequest {
  messages: Array<{
    role: 'user' | 'assistant';
    content: Array<{ type: 'text'; text: string }>;
  }>;
  includeContext?: 'thisServer' | 'allServers' | 'none';
  modelPreferences?: {
    hints?: Array<{ name: string }>;
    costPriority?: number;
    speedPriority?: number;
    intelligencePriority?: number;
  };
  stopSequences?: string[];
  maxTokens?: number;
}

export interface SamplingResponse {
  role: 'assistant';
  content: Array<{ type: 'text'; text: string }>;
  metadata?: {
    model?: string;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
    finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls';
  };
}

export interface PromptWithMessages {
  description: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: Array<{ type: 'text'; text: string }>;
  }>;
}

// Progress reporting
export type ProgressReporter = (
  message: string,
  progress?: number,
  total?: number,
) => Promise<void>;

// AI/Sampling service interface
export interface SamplingService {
  createMessage(request: SamplingRequest): Promise<SamplingResponse>;
}

// Prompt service interface
export interface PromptService {
  getPrompt(name: string, args?: Record<string, unknown>): Promise<PromptWithMessages>;
}

/**
 * Unified ToolContext Interface
 *
 * This is the single source of truth for tool execution context.
 * It replaces all previous context interfaces and provides a clean,
 * unified API for tools to access services.
 */
export interface ToolContext {
  // ===== CORE REQUIRED SERVICES =====
  /** Required logger instance for structured logging */
  logger: Logger;

  // ===== AI/LLM SERVICES (Optional) =====
  /** AI sampling capabilities for generating responses */
  sampling?: SamplingService;

  /** Prompt registry for accessing templated prompts */
  prompts?: PromptService;

  // ===== SESSION/STATE MANAGEMENT (Optional) =====
  /** Session manager for maintaining state across tool calls */
  sessionManager?: import('../../lib/session').SessionManager;

  // ===== INFRASTRUCTURE ADAPTERS (Optional) =====
  /** Docker client for container operations */
  docker?: import('../../lib/docker').DockerClient;

  /** Kubernetes client for cluster operations */
  kubernetes?: any; // TODO: Define proper K8s client type

  // ===== RESOURCE MANAGEMENT (Optional) =====
  /** Resource manager for accessing files and templates */
  resourceManager?: any; // TODO: Define proper ResourceManager type

  // ===== CONTROL/LIFECYCLE (Optional) =====
  /** Abort signal for cancellation support */
  abortSignal?: AbortSignal;

  /** Progress reporting function for long-running operations */
  progressReporter?: ProgressReporter;

  // ===== MCP PROTOCOL (Optional) =====
  /** MCP Server instance for protocol operations */
  server?: import('@modelcontextprotocol/sdk/server/mcp.js').McpServer;

  /** Progress token for MCP progress reporting */
  progressToken?: import('@modelcontextprotocol/sdk/types.js').ProgressToken;

  // ===== CONFIGURATION (Optional) =====
  /** Tool-specific configuration */
  config?: {
    /** Enable debug logging */
    debug?: boolean;
    /** Default timeout for operations (ms) */
    timeout?: number;
    /** Default max tokens for AI requests */
    maxTokens?: number;
    /** Working directory for file operations */
    workingDirectory?: string;
    /** Additional tool-specific config */
    [key: string]: unknown;
  };
}

/**
 * Factory function type for creating ToolContext instances
 */
export type ToolContextFactory = (
  services: ServiceContainer,
  options?: ToolContextOptions,
) => ToolContext;

/**
 * Service container interface for dependency injection
 */
export interface ServiceContainer {
  logger: Logger;
  sampling?: SamplingService;
  prompts?: PromptService;
  sessionManager?: import('../../lib/session').SessionManager;
  docker?: import('../../lib/docker').DockerClient;
  kubernetes?: any; // TODO: Define proper K8s client type
  resourceManager?: any; // TODO: Define proper ResourceManager type
  server?: import('@modelcontextprotocol/sdk/server/mcp.js').McpServer;
}

/**
 * Options for ToolContext creation
 */
export interface ToolContextOptions {
  abortSignal?: AbortSignal;
  progressReporter?: ProgressReporter;
  progressToken?: import('@modelcontextprotocol/sdk/types.js').ProgressToken;
  config?: ToolContext['config'];
}

// ===== BACKWARD COMPATIBILITY TYPES =====
// These will be marked as deprecated and removed in future versions

/**
 * @deprecated Use ToolContext directly
 */
export type ExtendedToolContext = ToolContext;

/**
 * @deprecated Use ToolContext directly
 */
export type LegacyToolContext = ToolContext;

/**
 * @deprecated Use ToolContext directly
 */
export type MCPToolContext = ToolContext;
