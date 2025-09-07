/**
 * MCP (Model Context Protocol) type definitions
 * Defines the interfaces for tool registration and MCP server implementation
 */

import type { Logger } from 'pino';
import type { Result } from '../types/core';

/**
 * MCP Tool definition
 */
export interface MCPTool {
  name: string;
  description: string;
  execute: (params: object, logger: Logger) => Promise<Result<unknown>>;
  schema: {
    type: string;
    properties?: Record<string, object>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

/**
 * Tool creation function signature
 */

/**
 * MCP Workflow definition
 */
export interface MCPWorkflow {
  name: string;
  description: string;
  execute: (params: object, logger?: Logger) => Promise<unknown>;
  schema: {
    type: string;
    properties?: Record<string, object>;
    required?: string[];
  };
}

/**
 * MCP Server options
 */
export interface MCPServerOptions {
  name?: string;
  version?: string;
  capabilities?: {
    tools?: {
      listChanged?: boolean;
    };
    resources?: {
      listChanged?: boolean;
    };
  };
}

/**
 * MCP Request types
 */
export interface MCPRequest {
  method: string;
  params?: object;
  id?: string | number;
}

/**
 * MCP Response types
 */
export interface MCPResponse {
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  id?: string | number | undefined;
}

/**
 * List tools request/response
 */

/**
 * Call tool request/response
 */

/**
 * MCP Server interface
 */
export interface MCPServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  handleRequest(request: MCPRequest): Promise<MCPResponse>;
}
