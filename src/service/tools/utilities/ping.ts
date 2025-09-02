/**
 * Ping Handler - TypeScript Implementation
 * Tests MCP server connectivity and health
 */

import { z } from 'zod'
import { Result, ok } from '../../../domain/types/result.js'
import type { ToolHandler, ToolContext } from '../tool-types.js'

// Input schema
const PingInput = z.object({
  message: z.string().default('ping')
})

// Output schema
const PingOutput = z.object({
  success: z.boolean(),
  message: z.string(),
  timestamp: z.string(),
  server: z.object({
    name: z.string(),
    version: z.string(),
    uptime: z.number(),
    pid: z.number(),
  }),
  capabilities: z.object({
    tools: z.boolean(),
    sampling: z.boolean(),
    progress: z.boolean(),
  })
})

// Type aliases
export type PingInputType = z.infer<typeof PingInput>
export type PingOutputType = z.infer<typeof PingOutput>

/**
 * Main handler implementation
 */
export const pingHandler: ToolHandler<PingInputType, PingOutputType> = {
  name: 'ping',
  description: 'Test MCP server connectivity and health',
  category: 'utility',
  inputSchema: PingInput,
  outputSchema: PingOutput,

  execute(input: PingInputType, context: ToolContext): Result<PingOutputType> {
    const { logger } = context
    const { message } = input

    logger.info({message }); // Fixed logger call

    return ok({
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
    })
  }
}

// Default export for registry
export default pingHandler

