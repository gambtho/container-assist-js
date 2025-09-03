/**
 * Ping Handler - MCP SDK Compatible Version
 * Tests MCP server connectivity and health
 */

import { z } from 'zod';
import type { ToolDescriptor, ToolContext } from '../tool-types.js';

// Input schema
const PingInputSchema = z.object({
  message: z.string().default('ping')
});

// Output schema
const PingOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  timestamp: z.string(),
  server: z.object({
    name: z.string(),
    version: z.string(),
    uptime: z.number(),
    pid: z.number()
  }),
  capabilities: z.object({
    tools: z.boolean(),
    sampling: z.boolean(),
    progress: z.boolean()
  })
});

// Input/Output types
type PingInput = z.infer<typeof PingInputSchema>;
type PingOutput = z.infer<typeof PingOutputSchema>;

/**
 * Ping tool implementation using MCP SDK pattern
 */
const pingTool: ToolDescriptor<PingInput, PingOutput> = {
  name: 'ping',
  description: 'Test MCP server connectivity and health',
  category: 'utility',
  inputSchema: PingInputSchema,
  outputSchema: PingOutputSchema,

  handler: async (input: PingInput, context: ToolContext): Promise<PingOutput> => {
    const { logger } = context;
    const { message } = input;

    logger.info({ message }, 'Processing ping request');

    const response: PingOutput = {
      success: true,
      message: `pong: ${message}`,
      timestamp: new Date().toISOString(),
      server: {
        name: 'container-kit-mcp',
        version: '2.0.0',
        uptime: process.uptime(),
        pid: process.pid
      },
      capabilities: {
        tools: true,
        sampling: true,
        progress: true
      }
    };

    return response;
  }
};

// Export for use in registry
export default pingTool;

// Also export types if needed elsewhere
export type { PingInput, PingOutput };
