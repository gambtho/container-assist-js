/**
 * Shared types for tools to prevent circular dependencies
 */

import type { Logger } from 'pino';
import type { ProgressToken } from '@modelcontextprotocol/sdk/types.js';

/**
 * Context object passed to tool execution
 */
export interface ToolContext {
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
  /** Progress token for progress reporting */
  progressToken?: ProgressToken;
  /** Session manager instance */
  sessionManager?: import('../lib/session').SessionManager;
  /** Prompt registry for accessing prompts */
  promptRegistry?: import('../prompts/prompt-registry').PromptRegistry;
  /** Resource manager for accessing resources */
  resourceManager?: import('../resources/manager').ResourceContext;
  /** Server instance for sending progress */
  server?: import('@modelcontextprotocol/sdk/server/mcp.js').McpServer;
  /** Logger instance */
  logger?: Logger;
}

export interface AnalyzeRepoResult {
  ok: boolean;
  sessionId: string;
  language: string;
  languageVersion?: string;
  framework?: string;
  frameworkVersion?: string;
  buildSystem?: {
    type: string;
    buildFile: string;
    buildCommand: string;
    testCommand?: string;
  };
  dependencies: Array<{
    name: string;
    version?: string;
    type: string;
  }>;
  ports: number[];
  hasDockerfile: boolean;
  hasDockerCompose: boolean;
  hasKubernetes: boolean;
  recommendations?: {
    baseImage?: string;
    buildStrategy?: string;
    securityNotes?: string[];
  };
  metadata?: {
    repoPath: string;
    depth: number;
    includeTests: boolean;
    timestamp: string;
    aiInsights?: string;
  };
}

export type AnalysisPerspective = 'comprehensive' | 'security-focused' | 'performance-focused';

export interface PerspectiveConfig {
  perspective: AnalysisPerspective;
  emphasis: string[];
  additionalChecks: string[];
}
