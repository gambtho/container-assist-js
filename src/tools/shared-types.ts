/**
 * Shared types for tools
 *
 * This file contains shared type definitions used across multiple tools
 */

import type { SessionManager } from '../lib/session';
import type { ToolContext } from '../mcp/context/types';

/**
 * Extended context that includes shared sessionManager
 * This is used to pass the shared sessionManager from MCP server to tools
 * Can be either a ToolContext, or any object with sessionManager, or undefined
 */
export type ExtendedToolContext =
  | ToolContext
  | { sessionManager?: SessionManager; [key: string]: unknown }
  | undefined;
