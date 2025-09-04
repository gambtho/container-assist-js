/**
 * MCP Sampler Interface and Implementation
 * Provides the AI sampling interface for the Enhanced AI Service
 */

import type { Logger } from 'pino';
import type { AIRequest } from '../ai-request-builder.js';

/**
 * Response from the MCP sampler
 */
export interface MCPSampleResponse {
  text: string;
  tokenCount?: number | undefined;
  model?: string | undefined;
  stopReason?: string | undefined;
}

/**
 * Error response from the MCP sampler
 */
export interface MCPSampleError {
  error: string;
  code?: string | undefined;
  details?: Record<string, any> | undefined;
}

/**
 * MCP Sampler interface for AI text generation
 */
export interface MCPSampler {
  /**
   * Sample text from the AI model
   * @param request - The AI request with prompt and parameters
   * @returns Either a successful response or an error
   */
  sample(request: AIRequest): Promise<MCPSampleResponse | MCPSampleError>;

  /**
   * Check if the sampler is available
   */
  isAvailable(): boolean;

  /**
   * Get the default model for this sampler
   */
  getDefaultModel(): string;

  /**
   * Get supported models
   */
  getSupportedModels(): string[];
}

/**
 * Mock MCP Sampler for testing and development
 */
export class MockMCPSampler implements MCPSampler {
  private mockResponses: Map<string, MCPSampleResponse> = new Map();
  private defaultResponse: MCPSampleResponse = {
    text: 'Mock response',
    tokenCount: 10,
    model: 'mock-model',
  };
  private available: boolean = true;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'mock-mcp-sampler' });
  }

  /**
   * Add a mock response for a specific prompt pattern
   */
  addMockResponse(promptPattern: string, response: MCPSampleResponse): void {
    this.mockResponses.set(promptPattern, response);
  }

  /**
   * Set availability status
   */
  setAvailable(available: boolean): void {
    this.available = available;
  }

  async sample(request: AIRequest): Promise<MCPSampleResponse | MCPSampleError> {
    if (!this.available) {
      return {
        error: 'Mock sampler is not available',
        code: 'SAMPLER_UNAVAILABLE',
      };
    }

    this.logger.debug(
      {
        promptLength: request.prompt.length,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
      },
      'Mock sampling',
    );

    // Check for matching mock response
    for (const [pattern, response] of this.mockResponses) {
      if (request.prompt.includes(pattern)) {
        return {
          ...response,
          model: request.model ?? response.model,
        };
      }
    }

    // Return default response
    return {
      ...this.defaultResponse,
      model: request.model ?? this.defaultResponse.model,
    };
  }

  isAvailable(): boolean {
    return this.available;
  }

  getDefaultModel(): string {
    return 'mock-model';
  }

  getSupportedModels(): string[] {
    return ['mock-model', 'mock-model-fast', 'mock-model-large'];
  }

  /**
   * Clear all mock responses
   */
  reset(): void {
    this.mockResponses.clear();
    this.available = true;
  }
}

/**
 * Adapter for legacy MCP samplers
 * Converts between old and new interfaces
 */
// Define legacy sampler interface
interface LegacySampler {
  sample(request: unknown): Promise<unknown>;
  isAvailable?(): boolean;
  getDefaultModel?(): string;
  getSupportedModels?(): string[];
}

export class LegacyMCPSamplerAdapter implements MCPSampler {
  private legacySampler: LegacySampler;
  private logger: Logger;

  constructor(legacySampler: LegacySampler, logger: Logger) {
    this.legacySampler = legacySampler;
    this.logger = logger.child({ component: 'legacy-mcp-adapter' });
  }

  async sample(request: AIRequest): Promise<MCPSampleResponse | MCPSampleError> {
    try {
      // Convert to legacy format if needed
      const legacyRequest = {
        templateId: request.context?._templateId ?? 'unknown',
        variables: {
          ...request.context,
          _prompt: request.prompt,
        },
        format: 'text' as const,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        model: request.model,
      };

      // Call legacy sampler
      const result = (await this.legacySampler.sample(legacyRequest)) as any;

      // Convert response
      if (result.success && result.content) {
        return {
          text:
            typeof result.content === 'string' ? result.content : JSON.stringify(result.content),
          tokenCount: result.tokenCount,
          model: result.model ?? request.model,
        };
      } else if (result.error) {
        return {
          error: result.error.message ?? 'Unknown error',
          code: result.error.code,
          details: result.error,
        };
      } else {
        return {
          error: 'Invalid response from legacy sampler',
        };
      }
    } catch (error) {
      this.logger.error({ error }, 'Legacy sampler error');
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'LEGACY_SAMPLER_ERROR',
        details: { originalError: error },
      };
    }
  }

  isAvailable(): boolean {
    return typeof this.legacySampler?.isAvailable === 'function'
      ? this.legacySampler.isAvailable()
      : true;
  }

  getDefaultModel(): string {
    return typeof this.legacySampler?.getDefaultModel === 'function'
      ? this.legacySampler.getDefaultModel()
      : 'claude-3-opus';
  }

  getSupportedModels(): string[] {
    return typeof this.legacySampler?.getSupportedModels === 'function'
      ? this.legacySampler.getSupportedModels()
      : ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'];
  }
}

/**
 * Factory for creating MCP samplers
 */
export class MCPSamplerFactory {
  /**
   * Create an MCP sampler based on configuration
   */
  static create(
    config: { legacySampler?: LegacySampler; useMock?: boolean },
    logger: Logger,
  ): MCPSampler {
    // If a legacy sampler is provided, wrap it
    if (config.legacySampler != null) {
      return new LegacyMCPSamplerAdapter(config.legacySampler, logger);
    }

    // For testing/development, return mock sampler
    if (config.useMock ?? process.env.NODE_ENV === 'test') {
      return new MockMCPSampler(logger);
    }

    // In production, this would create the actual MCP sampler
    // For now, return a mock sampler with a warning
    logger.warn('No MCP sampler configured, using mock sampler');
    return new MockMCPSampler(logger);
  }
}

// Re-export types for convenience
export type { AIRequest } from '../ai-request-builder.js';
