/**
 * AI Sampling - Function-based approach replacing MCPSampler interface
 * Converts complex interface hierarchies to simple function types
 */

import type { Logger } from 'pino';

/**
 * Import AIRequest from requests.ts instead of defining here
 */
import type { AIRequest } from './requests.js';

/**
 * Sample result using discriminated unions instead of separate interfaces
 */
export type SampleResult =
  | {
      success: true;
      text: string;
      tokenCount?: number;
      model?: string;
      stopReason?: string;
    }
  | {
      success: false;
      error: string;
      code?: string;
      details?: Record<string, any>;
    };

/**
 * Sampler function type - much simpler than MCPSampler interface
 * Replaces the complex interface with multiple methods
 */
export type SampleFunction = (request: AIRequest) => Promise<SampleResult>;

/**
 * Sampler configuration for factory function
 */
export type SamplerConfig = {
  type: 'mcp';
  defaultModel?: string;
  server: any; // MCP server instance required
};

/**
 * Create a sampler function based on configuration
 * Replaces MCPSamplerFactory class with simple function
 */
/**
 * Create a sampler function - simplified to only support MCP
 */
export function createSampler(config: SamplerConfig, logger: Logger): SampleFunction {
  if (config.type !== 'mcp') {
    throw new Error(`Only 'mcp' sampler type is supported, got: ${String(config.type)}`);
  }

  return createMCPSampler(config.server, logger);
}

/**
 * Real MCP sampler function using server capabilities
 * Converts complex MCP integration to simple function
 */
function createMCPSampler(server: any, logger: Logger): SampleFunction {
  return async (request: AIRequest): Promise<SampleResult> => {
    try {
      logger.debug({ promptLength: request.prompt.length }, 'MCP sampling via client');

      // Use the MCP server's message creation capability
      const response = await server.server.createMessage({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: request.prompt,
            },
          },
        ],
        maxTokens: request.maxTokens || 4000,
        modelPreferences: {
          hints: request.model ? [{ name: request.model }] : undefined,
        },
      });

      return {
        success: true,
        text: response.content[0]?.text || '',
        model: response.model,
        tokenCount: response.usage?.output_tokens,
        stopReason: response.stopReason,
      };
    } catch (error) {
      logger.error({ error }, 'MCP client sampling failed');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'MCP_ERROR',
      };
    }
  };
}

/**
 * Utility functions for working with sample results
 * Type guards for discriminated union
 */
export function isSuccessResult(
  result: SampleResult,
): result is Extract<SampleResult, { success: true }> {
  return result.success;
}

export function isErrorResult(
  result: SampleResult,
): result is Extract<SampleResult, { success: false }> {
  return !result.success;
}

/**
 * Extract text from result with fallback
 */
export function getResultText(result: SampleResult, fallback: string = ''): string {
  return isSuccessResult(result) ? result.text : fallback;
}

/**
 * Extract error message from result
 */
export function getErrorMessage(result: SampleResult): string | null {
  return isErrorResult(result) ? result.error : null;
}

/**
 * Sampler availability checker function
 * Replaces the isAvailable() method from interface
 */
export function createAvailabilityChecker(config: SamplerConfig): () => boolean {
  return () => config.server != null;
}

/**
 * Model preference functions
 * Replaces getDefaultModel() and getSupportedModels() methods
 */
export function getDefaultModel(config: SamplerConfig): string {
  return config.defaultModel || 'claude-3-sonnet';
}

export function getSupportedModels(_config: SamplerConfig): string[] {
  return ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'];
}

// Re-export AIRequest for consumers who need it from this module
export type { AIRequest };
