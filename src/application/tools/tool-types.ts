import { z } from 'zod';
import type { Logger } from 'pino';
// import type { Server, Tool } from '@modelcontextprotocol/sdk/types';
// Server not exported from SDK, Tool unused
import type { WorkflowOrchestrator } from '../workflow/orchestrator.js';
import type { WorkflowManager } from '../workflow/manager.js';
import type { ProgressEmitter, EventPublisher, DependenciesConfig } from '../interfaces.js';
import type { ProgressCallback } from '../workflow/types.js';
import type { MCPSampler } from '../../infrastructure/ai/ai-types.js';
import type { StructuredSampler } from '../../infrastructure/ai/structured-sampler.js';
import type { ContentValidator } from '../../infrastructure/ai/content-validator.js';

/**
 * MCP SDK compatible tool context
 */
export interface ToolContext {
  // MCP-specific
  server: unknown; // Server type not exported from SDK
  progressToken?: string;

  // Core services
  logger: Logger;

  // Workflow management
  workflowOrchestrator: WorkflowOrchestrator;
  workflowManager: WorkflowManager;

  // Event handling
  eventPublisher: EventPublisher;
  progressEmitter: ProgressEmitter;
  onProgress?: ProgressCallback;

  // AI components
  mcpSampler?: MCPSampler;
  structuredSampler?: StructuredSampler;
  contentValidator?: ContentValidator;

  // Configuration and control
  config: DependenciesConfig;
  signal?: AbortSignal;
  sessionId?: string;

  // Performance monitoring
  logPerformanceMetrics?: (operation: string, duration: number, metadata?: unknown) => void;

  // Services - for backwards compatibility
  sessionService?: any;
  aiService?: any;
  dockerService?: any;
  kubernetesService?: any;
}

/**
 * MCP SDK compatible tool handler
 */
export interface ToolHandler<TInput, TOutput> {
  (params: TInput, context: ToolContext): Promise<TOutput>;
}

/**
 * MCP SDK compatible tool descriptor
 */
export interface ToolDescriptor<TInput = any, TOutput = any> {
  name: string;
  description: string;
  category: 'workflow' | 'orchestration' | 'utility';
  inputSchema: z.ZodType<TInput> | z.ZodEffects<any, TInput, any> | z.ZodObject<any>;
  outputSchema: z.ZodType<TOutput> | z.ZodEffects<any, TOutput, any> | z.ZodObject<any>;
  handler: ToolHandler<TInput, TOutput>;
  chainHint?: {
    nextTool: string;
    reason: string;
    paramMapper?: (output: TOutput) => Record<string, unknown>;
  };
  timeout?: number;
}

/*
 * MCP Tool Call Request
 */
export interface MCPToolCallRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

/**
 * MCP Tool Call Response
 */
export interface MCPToolCallResponse {
  content: Array<{
    type: 'text' | 'resource';
    text?: string;
    resource?: {
      uri: string;
      mimeType?: string;
      text?: string;
    };
  }>;
  isError?: boolean;
}

/**
 * Progress update for tool execution
 */
export interface ToolProgress {
  toolName: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress?: number;
  message?: string;
  error?: Error;
  startedAt?: Date;
  completedAt?: Date;
}
