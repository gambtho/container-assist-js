/**
 * MCP Host AI Interface
 *
 * Provides integration with the MCP host AI (Claude Code, Copilot, etc.)
 * for AI-enhanced tool capabilities and intelligent prompt processing.
 *
 * Now includes full SDK client integration for proper MCP completion handling.
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '../core/types';
import { MCPClient } from '../mcp/client/mcp-client';

/**
 * Interface for communicating with MCP Host AI
 */
export interface MCPHostAI {
  /**
   * Submit a prompt to the MCP host AI and get a response
   * @param prompt The prompt to send to the AI
   * @param context Optional context data to include
   * @returns AI response or error
   */
  submitPrompt(prompt: string, context?: Record<string, unknown>): Promise<Result<string>>;

  /**
   * Check if MCP host AI is available
   * @returns true if AI is available, false otherwise
   */
  isAvailable(): boolean;

  /**
   * Get the name/type of the MCP host AI
   */
  getHostType(): string;
}

/**
 * Configuration for MCP Host AI requests
 */
export interface MCPHostAIRequest {
  prompt: string;
  context?: Record<string, unknown>;
  maxLength?: number;
  temperature?: number;
  sampling?: {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
  };
}

/**
 * AI response format that can be processed by the host
 */
export interface MCPAIResponse {
  type: 'ai-completion-request';
  prompt: string;
  context: Record<string, unknown>;
  sampling?: MCPHostAIRequest['sampling'];
  metadata: {
    toolName?: string;
    operation?: string;
    timestamp: string;
    requestId: string;
  };
}

/**
 * Create an MCP Host AI instance with SDK client integration
 *
 * Now provides both SDK client-based AI completions and fallback
 * structured responses for environments without SDK support.
 */
export const createMCPHostAI = (logger: Logger): MCPHostAI => {
  const sdkClient = new MCPClient(logger, {
    capabilities: {
      completion: true,
      prompts: true,
      resources: false,
      sampling: true,
    },
  });

  let requestCounter = 0;

  // Generate unique request ID
  const generateRequestId = (): string => {
    requestCounter++;
    return `mcp-ai-${Date.now()}-${requestCounter}`;
  };

  /**
   * Generate placeholder response when SDK is unavailable
   */
  const generatePlaceholderResponse = (
    _prompt: string,
    context?: Record<string, unknown>,
  ): string => {
    const promptType = String(context?.type || 'general');

    const placeholders = {
      dockerfile:
        '# Dockerfile generation requires MCP host AI\n# Please ensure your MCP client supports AI completions',
      kubernetes:
        '# Kubernetes manifest generation requires MCP host AI\n# Please ensure your MCP client supports AI completions',
      analysis: JSON.stringify(
        {
          status: 'pending',
          message: 'Repository analysis requires MCP host AI support',
          hint: 'Please ensure your MCP client supports AI completions',
        },
        null,
        2,
      ),
      enhancement: JSON.stringify(
        {
          status: 'pending',
          message: 'Result enhancement requires MCP host AI support',
          originalData: context?.data || {},
        },
        null,
        2,
      ),
      general:
        'This operation requires MCP host AI support. Please ensure your MCP client supports AI completions.',
    } as const;

    // Type-safe access with proper fallback
    return placeholders[promptType as keyof typeof placeholders] ?? placeholders.general;
  };

  return {
    async submitPrompt(prompt: string, context?: Record<string, unknown>): Promise<Result<string>> {
      try {
        logger.debug(
          {
            promptLength: prompt.length,
            contextKeys: context ? Object.keys(context) : [],
            sdkAvailable: sdkClient.isConnected(),
          },
          'Processing MCP AI completion request',
        );

        const requestId = generateRequestId();

        // Try SDK client first if available
        if (sdkClient.isConnected() || process.env.USE_SDK_CLIENT === 'true') {
          logger.info({ requestId }, 'Using SDK client for completion');

          const sdkResult = await sdkClient.complete(prompt, {
            ...context,
            requestId,
            promptName: (context?.type as string) || 'default',
          });

          if (sdkResult.ok) {
            logger.debug({ requestId }, 'SDK completion successful');
            return sdkResult;
          }

          logger.warn(
            { requestId, error: sdkResult.error },
            'SDK completion failed, falling back to structured response',
          );
        }

        // Fallback to structured response for host processing
        const metadata: MCPAIResponse['metadata'] = {
          timestamp: new Date().toISOString(),
          requestId,
        };

        if (context?.toolName && typeof context.toolName === 'string') {
          metadata.toolName = context.toolName;
        }

        if (context?.operation && typeof context.operation === 'string') {
          metadata.operation = context.operation;
        }

        const aiRequest: MCPAIResponse = {
          type: 'ai-completion-request',
          prompt,
          context: context || {},
          sampling: {
            temperature: 0.7,
            topP: 0.9,
            maxTokens: 2000,
          },
          metadata,
        };

        logger.info(
          {
            requestId,
            type: 'mcp-ai-completion-structured',
            promptLength: prompt.length,
            contextSize: Object.keys(context || {}).length,
          },
          'Generated structured MCP AI request',
        );

        // If tool expects AI response, provide working placeholder
        if (context?.expectsAIResponse) {
          return Success(generatePlaceholderResponse(prompt, context));
        }

        // Return structured request for host processing
        return Success(JSON.stringify(aiRequest, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(
          { error: message, prompt: prompt.substring(0, 100) },
          'MCP AI request processing failed',
        );
        return Failure(`MCP AI request failed: ${message}`);
      }
    },

    isAvailable(): boolean {
      // Check SDK client first
      if (sdkClient.isConnected()) {
        return true;
      }

      // Check for explicit SDK client usage
      if (process.env.USE_SDK_CLIENT === 'true') {
        return true;
      }

      // Check for MCP host indicators
      const hasMCPHost = Boolean(
        process.env.MCP_HOST_TYPE ||
          process.env.CLAUDE_CODE ||
          process.env.GITHUB_COPILOT ||
          process.env.MCP_SERVER_NAME,
      );

      return hasMCPHost;
    },

    getHostType(): string {
      // Check if using SDK client
      if (sdkClient.isConnected() || process.env.USE_SDK_CLIENT === 'true') {
        return 'sdk-client';
      }

      // Detect specific MCP host type from environment
      if (process.env.MCP_HOST_TYPE) {
        return process.env.MCP_HOST_TYPE;
      }
      if (process.env.CLAUDE_CODE) {
        return 'claude-code';
      }
      if (process.env.GITHUB_COPILOT) {
        return 'github-copilot';
      }
      return 'unknown' as string;
    },
  } as MCPHostAI;
};

/**
 * Utility function to format prompts for different types of AI assistance
 */
export const createPromptTemplate = (
  type: 'dockerfile' | 'kubernetes' | 'analysis' | 'enhancement',
  context: Record<string, unknown>,
): string => {
  const baseContext = JSON.stringify(context, null, 2);

  switch (type) {
    case 'dockerfile':
      return `Generate an optimized Dockerfile based on the following context:

Context:
${baseContext}

Please provide a Dockerfile that follows security best practices, uses appropriate base images, and is optimized for the detected technology stack.`;

    case 'kubernetes':
      return `Generate Kubernetes deployment manifests based on the following context:

Context:
${baseContext}

Please provide production-ready Kubernetes manifests with appropriate resource limits, security contexts, and best practices.`;

    case 'analysis':
      return `Analyze the repository and provide insights based on the following context:

Context:
${baseContext}

Please provide analysis including technology stack, dependencies, security considerations, and deployment recommendations.`;

    case 'enhancement':
      return `Enhance the following results with additional insights:

Context:
${baseContext}

Please provide additional recommendations, best practices, and actionable insights.`;

    default:
      return `Process the following request:

Context:
${baseContext}

Please provide helpful recommendations and insights.`;
  }
};

/**
 * Check if a response indicates that MCP host AI processing is needed
 */
export const isAIAssistanceResponse = (response: string): boolean => {
  try {
    const parsed = JSON.parse(response);
    return parsed.type === 'ai-completion-request';
  } catch {
    // Legacy format check
    return response.startsWith('[AI-ASSISTANCE-NEEDED]');
  }
};

/**
 * Parse an AI completion request from a response
 */
export const parseAICompletionRequest = (response: string): MCPAIResponse | null => {
  try {
    const parsed = JSON.parse(response);
    if (parsed.type === 'ai-completion-request') {
      return parsed as MCPAIResponse;
    }
  } catch {
    // Not a valid AI completion request
  }
  return null;
};
