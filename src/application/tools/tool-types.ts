import { z , type ZodRawShape} from 'zod';
import type { Logger } from 'pino';
import type { DependenciesConfig } from '../interfaces';
import { Services } from '../../services/index';

import AnalyzeRepo from './analyze-repo'

export const allTools: MCPTool = [
  AnalyzeRepo
]

/**
 * MCP SDK compatible tool context
 */
export interface MCPToolContext {
  logger: Logger;

  config: DependenciesConfig;
  signal?: AbortSignal;
  sessionId?: string;
}

/**
 * MCP SDK compatible tool handler
 */
export interface MCPToolHandler<TInput, TOutput> {
  (params: TInput, services: Services, context: MCPToolContext): Promise<TOutput>;
}

/**
 * Enhanced tool descriptor for MCP SDK compatibility
 */
export interface MCPTool<TInput = any, TOutput = any> {
  name: string;
  description: string;
  inputSchema: z.ZodObject<ZodRawShape>;
  outputSchema: z.ZodType<TOutput>;
  handler: MCPToolHandler<TInput, TOutput>;
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
