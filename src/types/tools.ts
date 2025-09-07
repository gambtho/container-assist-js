/**
 * Simple Tool Types - De-Enterprise Refactoring
 *
 * Replaces complex Zod schemas and interfaces with simple TypeScript types
 */

import type { Logger } from 'pino';
import type { Result } from './core.js';
import type { MCPContext } from '../mcp/types.js';

// Base tool interface
export interface Tool {
  name: string;
  description?: string;
  schema?: Record<string, unknown>;
  execute: (
    params: Record<string, unknown>,
    logger: Logger,
    context?: MCPContext,
  ) => Promise<Result<any>>;
}

// Tool-specific parameter types
export interface TagImageParams {
  imageName: string;
  sourceTag: string;
  targetTag: string;
  registry?: string;
}
