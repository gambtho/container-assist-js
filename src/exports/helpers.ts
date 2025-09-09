/**
 * Helper utilities for external MCP tool integration
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import type { MCPTool, MCPServer } from './types.js';
import { tools } from './tools.js';

/**
 * Register a single tool with any MCP server implementation
 */
export function registerTool(server: MCPServer | any, tool: MCPTool, customName?: string): void {
  const name = customName || tool.name;

  // Convert Zod schema to JSON Schema if needed
  const isZodSchema = (schema: any): boolean => {
    return schema && typeof schema === 'object' && typeof schema.parse === 'function';
  };

  const inputSchema = isZodSchema(tool.metadata.inputSchema)
    ? zodToJsonSchema(tool.metadata.inputSchema as any)
    : tool.metadata.inputSchema;

  // Try different registration methods based on server API
  if (typeof server.registerTool === 'function') {
    // High-level API (McpServer style)
    server.registerTool(
      name,
      {
        title: tool.metadata.title,
        description: tool.metadata.description,
        inputSchema,
      },
      tool.handler,
    );
  } else if (typeof server.addTool === 'function') {
    // Low-level API (Server style)
    server.addTool(
      {
        name,
        description: tool.metadata.description,
        inputSchema,
      },
      tool.handler,
    );
  } else if (typeof server.setTool === 'function') {
    // Alternative API
    server.setTool(name, {
      description: tool.metadata.description,
      inputSchema,
      handler: tool.handler,
    });
  } else if (server.tools && typeof server.tools.set === 'function') {
    // Direct Map-based registry
    server.tools.set(name, tool);
  } else {
    throw new Error(
      'Unsupported server type. Server must have registerTool, addTool, setTool method, or tools Map',
    );
  }
}

/**
 * Register all available tools with an MCP server
 */
export function registerAllTools(
  server: MCPServer | any,
  nameMapping?: Record<string, string>,
): void {
  Object.entries(tools).forEach(([key, tool]) => {
    const customName = nameMapping?.[key];
    registerTool(server, tool, customName);
  });
}

/**
 * Convert Zod schema to JSON Schema format
 */
export function convertZodToJsonSchema(zodSchema: any): any {
  return zodToJsonSchema(zodSchema);
}

/**
 * Create a new session identifier
 */
export function createSession(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11);
  return `session-${timestamp}-${random}`;
}

// Re-export adaptTool for advanced users
export { adaptTool } from './adapter.js';

// Re-export getAllTools for convenience
export { getAllTools } from './tools.js';
