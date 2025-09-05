import { z } from 'zod';
import type { Logger } from 'pino';
import type { EventEmitter } from 'events';
import type { WorkflowOrchestrator } from '../workflow/orchestrator';
import type { WorkflowManager } from '../workflow/manager';
import type { DependenciesConfig } from '../interfaces';
import type { ProgressCallback } from '../workflow/types';
import type {
  SampleFunction,
  StructuredSampler,
  ContentValidator,
} from '../../infrastructure/ai/index';
import type {
  SessionService,
  AIService,
  DockerService,
  KubernetesService,
} from '../services/interfaces';

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

  // Event handling - use EventEmitter directly
  eventPublisher: EventEmitter;
  progressEmitter: EventEmitter;
  onProgress?: ProgressCallback;

  // AI components
  sampleFunction?: SampleFunction;
  structuredSampler?: StructuredSampler;
  contentValidator?: ContentValidator;

  // Configuration and control
  config: DependenciesConfig;
  signal?: AbortSignal;
  sessionId?: string;

  // Performance monitoring
  logPerformanceMetrics?: (operation: string, duration: number, metadata?: unknown) => void;

  // Services - still being used in many tools
  sessionService?: SessionService;
  aiService?: AIService;
  dockerService?: DockerService;
  kubernetesService?: KubernetesService;
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
export interface ToolDescriptor<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  category:
    | 'workflow'
    | 'orchestration'
    | 'utility'
    | 'analysis'
    | 'generation'
    | 'docker'
    | 'kubernetes'
    | 'optimization';
  inputSchema:
    | z.ZodType<TInput>
    | z.ZodEffects<z.ZodTypeAny, TInput, unknown>
    | z.ZodObject<z.ZodRawShape>;
  outputSchema:
    | z.ZodType<TOutput>
    | z.ZodEffects<z.ZodTypeAny, TOutput, unknown>
    | z.ZodObject<z.ZodRawShape>;
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
