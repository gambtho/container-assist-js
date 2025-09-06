/**
 * MCP (Model Context Protocol) type definitions
 * Defines the interfaces for tool registration and MCP server implementation
 */

import type { Logger } from 'pino';
import type { Result } from '../types/core/index.js';

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
export type ToolCreator = (logger: Logger) => MCPTool;

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
 * Tool Registry interface
 */
export interface ToolRegistry {
  registerTool(tool: MCPTool): void;
  getTool(name: string): MCPTool | undefined;
  getAllTools(): MCPTool[];
  getWorkflow(name: string): MCPWorkflow | undefined;
  getAllWorkflows(): string[];
  validateRegistry(): boolean;
}

/**
 * Workflow Registry interface
 */
export interface WorkflowRegistry {
  registerWorkflow(workflow: MCPWorkflow): void;
  getWorkflow(name: string): MCPWorkflow | undefined;
  getAllWorkflows(): string[];
  getAllWorkflowObjects?(): MCPWorkflow[];
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
export interface ListToolsRequest {
  method: 'tools/list';
}

export interface ListToolsResponse {
  tools: Array<{
    name: string;
    description: string;
    inputSchema: object;
  }>;
}

/**
 * Call tool request/response
 */
export interface CallToolRequest {
  method: 'tools/call';
  params: {
    name: string;
    arguments: object;
  };
}

export interface CallToolResponse {
  content: Array<{
    type: 'text' | 'image' | 'error';
    text?: string;
    data?: unknown;
  }>;
  isError?: boolean;
}

/**
 * MCP Server interface
 */
export interface MCPServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  handleRequest(request: MCPRequest): Promise<MCPResponse>;
}
