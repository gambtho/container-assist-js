/**
 * Unified tool type definitions for the containerization assist MCP server
 * Consolidates tool interfaces from scattered locations into a single source of truth
 */

import { z } from 'zod';
import type { Logger } from 'pino';
import type { EventEmitter } from 'events';

// Base input schemas
export const SessionIdInput = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
});

// Tool-specific input schemas
export const TagImageInput = SessionIdInput.extend({
  tag: z.string().min(1, 'Tag is required'),
});

export const PushImageInput = SessionIdInput.extend({
  registry: z.string().optional(),
});

export const ScanImageInput = SessionIdInput;

// Parameter types
export type SessionIdParams = z.infer<typeof SessionIdInput>;
export type TagImageParams = z.infer<typeof TagImageInput>;
export type PushImageParams = z.infer<typeof PushImageInput>;
export type ScanImageParams = z.infer<typeof ScanImageInput>;

/**
 * MCP SDK compatible tool context
 * Provides all necessary dependencies for tool execution
 */
export interface ToolContext {
  // MCP-specific
  server: unknown; // Server type not exported from SDK
  progressToken?: string;

  // Core services
  logger: Logger;

  // Event handling
  eventPublisher: EventEmitter;
  progressEmitter: EventEmitter;

  // Configuration and control
  config: unknown; // Will be typed more specifically later
  signal?: AbortSignal;
  sessionId?: string;

  // Performance monitoring
  logPerformanceMetrics?: (operation: string, duration: number, metadata?: unknown) => void;
}

/**
 * MCP SDK compatible tool handler
 */
export interface ToolHandler<TInput, TOutput> {
  (params: TInput, context: ToolContext): Promise<TOutput>;
}

/**
 * Tool categories for organization and filtering
 */
export type ToolCategory =
  | 'workflow'
  | 'orchestration'
  | 'utility'
  | 'analysis'
  | 'generation'
  | 'docker'
  | 'kubernetes'
  | 'optimization';

/**
 * MCP SDK compatible tool descriptor
 * Defines the interface for all tools in the system
 */
export interface ToolDescriptor<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  category: ToolCategory;
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

/**
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

/**
 * Tool execution result with standard structure
 */
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Tool registration interface for MCP server
 */
export interface ToolRegistry {
  register<TInput, TOutput>(tool: ToolDescriptor<TInput, TOutput>): void;
  get(name: string): ToolDescriptor | undefined;
  list(): ToolDescriptor[];
  categories(): ToolCategory[];
}
