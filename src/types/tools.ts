/**
 * Simple Tool Types - De-Enterprise Refactoring
 *
 * Replaces complex Zod schemas and interfaces with simple TypeScript types
 */

import type { Logger } from 'pino';

// Simple parameter types
export type SessionIdParams = {
  sessionId: string;
};

export type TagImageParams = {
  sessionId: string;
  tag: string;
};

export type PushImageParams = {
  sessionId: string;
  registry?: string;
};

export type ScanImageParams = {
  sessionId: string;
};

// Simple tool context
export type ToolContext = {
  logger: Logger;
  sessionId: string;
  signal?: AbortSignal;
};

// Simple tool types
export type Tool = {
  name: string;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
};

// Essential MCP types only
export type MCPToolCallRequest = {
  name: string;
  arguments?: Record<string, unknown>;
};

export type MCPToolCallResponse = {
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
};

export type ToolResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};
