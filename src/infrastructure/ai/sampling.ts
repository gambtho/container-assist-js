/**
 * AI Sampling - Direct MCP SDK integration
 */
import type { Logger } from 'pino';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AIRequest } from './requests';

export type SampleResult =
  | { success: true; text: string; tokenCount?: number; model?: string; stopReason?: string }
  | { success: false; error: string; code?: string; details?: Record<string, unknown> };

export type SampleFunction = (request: AIRequest) => Promise<SampleResult>;

/**
 * Create a sampler function using native MCP SDK
 */
export function createNativeMCPSampler(server: McpServer, logger: Logger): SampleFunction {
  return async (request: AIRequest): Promise<SampleResult> => {
    try {
      const mcpServer = server as {
        server: { createMessage: (params: unknown) => Promise<unknown> };
      };
      const rawResponse = await mcpServer.server.createMessage({
        messages: [{ role: 'user', content: { type: 'text', text: request.prompt } }],
        maxTokens: request.maxTokens ?? 4000,
        modelPreferences: { hints: request.model ? [{ name: request.model }] : undefined },
      });

      const response = rawResponse as {
        content: Array<{ text?: string }>;
        model: string;
        usage?: { output_tokens?: number };
        stopReason: string;
      };

      const result: SampleResult = {
        success: true,
        text: response.content[0]?.text ?? '',
        model: response.model,
        stopReason: response.stopReason,
      };

      if (response.usage?.output_tokens !== undefined) {
        result.tokenCount = response.usage.output_tokens;
      }

      return result;
    } catch (error) {
      logger.error({ error }, 'MCP SDK sampling failed');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'MCP_ERROR',
      };
    }
  };
}

// Utility functions
export const isSuccessResult = (
  result: SampleResult,
): result is Extract<SampleResult, { success: true }> => result.success;
export const isErrorResult = (
  result: SampleResult,
): result is Extract<SampleResult, { success: false }> => !result.success;
export const getResultText = (result: SampleResult, fallback = ''): string =>
  isSuccessResult(result) ? result.text : fallback;
export const getErrorMessage = (result: SampleResult): string | null =>
  isErrorResult(result) ? result.error : null;

export type { AIRequest };
