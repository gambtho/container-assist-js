/**
 * Main MCP Server Entry Point
 *
 * Exports the SDK-native server as the primary server implementation.
 * This replaces the old ContainerizationMCPServer with the improved MCPServer.
 */

export { MCPServer as ContainerizationMCPServer } from './server/mcp-server';
export { MCPServer } from './server/mcp-server';

// Export types for external use
export type { MCPServerOptions } from './core/types';
export type { Tool, Result, Success, Failure } from '../core/types';
