/**
 * MCP Host AI Interface
 *
 * Provides integration with the MCP host AI (Claude Code, Copilot, etc.)
 * for AI-enhanced tool capabilities and intelligent prompt processing.
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '../types/core';

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
}

/**
 * MCP Host AI response
 */
export interface MCPHostAIResponse {
  content: string;
  metadata?: {
    tokensUsed?: number;
    model?: string;
    processingTime?: number;
  };
}

/**
 * Create an MCP Host AI instance
 *
 * Note: In MCP architecture, the host (Claude Code, Copilot, etc.) provides the AI.
 * This implementation provides a clean interface for tools to request AI assistance
 * without needing to know the specifics of the host implementation.
 */
export const createMCPHostAI = (logger: Logger): MCPHostAI => {
  return {
    async submitPrompt(prompt: string, context?: Record<string, unknown>): Promise<Result<string>> {
      try {
        logger.debug(
          {
            promptLength: prompt.length,
            contextKeys: context ? Object.keys(context) : [],
          },
          'Submitting prompt to MCP host AI',
        );

        // In MCP architecture, we signal the host that we need AI assistance
        // The actual AI processing happens at the host level
        // For now, we'll return a structured response that indicates AI assistance is needed

        const aiRequest = {
          type: 'ai-assistance-request',
          prompt,
          context: context || {},
          timestamp: new Date().toISOString(),
        };

        // Log the AI request for the MCP host to process
        logger.info(
          {
            aiRequest,
            action: 'mcp-ai-request',
          },
          'AI assistance requested from MCP host',
        );

        // For now, return a placeholder that indicates AI processing is needed
        // The MCP host will intercept these requests and provide AI responses
        const response = `[AI-ASSISTANCE-NEEDED] ${JSON.stringify(aiRequest)}`;

        return Success(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(
          { error: message, prompt: prompt.substring(0, 100) },
          'MCP host AI request failed',
        );
        return Failure(`MCP host AI request failed: ${message}`);
      }
    },

    isAvailable(): boolean {
      // In MCP architecture, AI is always available through the host
      // The host manages AI availability and fallbacks
      return true;
    },

    getHostType(): string {
      // The specific host type can be detected from environment or configuration
      // Common MCP hosts: Claude Code, GitHub Copilot, etc.
      return process.env.MCP_HOST_TYPE || 'claude-code';
    },
  };
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
  return response.startsWith('[AI-ASSISTANCE-NEEDED]');
};

/**
 * Extract AI request data from an AI assistance response
 */
export const extractAIRequest = (response: string): MCPHostAIRequest | null => {
  if (!isAIAssistanceResponse(response)) {
    return null;
  }

  try {
    const jsonStr = response.replace('[AI-ASSISTANCE-NEEDED] ', '');
    const data = JSON.parse(jsonStr);
    return {
      prompt: data.prompt,
      context: data.context,
    };
  } catch {
    return null;
  }
};
