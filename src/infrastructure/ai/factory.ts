/**
 * AI Service Factory
 * Creates and configures AI-related services and components
 */

import type { Logger } from 'pino';
import { MCPSampler, MockMCPSampler, MCPSamplerFactory } from './mcp-sampler';
import { StructuredSampler } from './structured-sampler';
import { ContentValidator } from './content-validator';

/**
 * Factory configuration
 */
export interface AIFactoryConfig {
  sampler?: {
    type: 'mock' | 'anthropic' | 'openai' | 'custom';
    config?: unknown;
  };
  validation?: {
    enabled: boolean;
    strict?: boolean;
  };
  logger: Logger;
}

/**
 * AI Services Bundle
 */
export interface AIServiceBundle {
  sampler: MCPSampler;
  structuredSampler: StructuredSampler;
  contentValidator: ContentValidator;
}

/**
 * AI Service Factory
 */
export class AIServiceFactory {
  /**
   * Create a complete AI service bundle
   */
  static createBundle(config: AIFactoryConfig): AIServiceBundle {
    const { logger } = config;

    // Create MCP sampler
    const sampler = this.createSampler(config);

    // Create structured sampler
    const structuredSampler = new StructuredSampler(sampler, logger);

    // Create content validator
    const contentValidator = new ContentValidator(logger);

    return {
      sampler,
      structuredSampler,
      contentValidator
    };
  }

  /**
   * Create MCP sampler based on configuration
   */
  static createSampler(config: AIFactoryConfig): MCPSampler {
    const { sampler: samplerConfig, logger } = config;

    if (!samplerConfig || samplerConfig.type === 'mock') {
      return new MockMCPSampler(logger);
    }

    // Use the existing factory
    return MCPSamplerFactory.create(
      {
        ...(samplerConfig.config as Record<string, unknown>)
      },
      logger
    );
  }

  /**
   * Create structured sampler with custom configuration
   */
  static createStructuredSampler(sampler: MCPSampler, logger: Logger): StructuredSampler {
    return new StructuredSampler(sampler, logger);
  }

  /**
   * Create content validator with custom configuration
   */
  static createContentValidator(logger: Logger): ContentValidator {
    return new ContentValidator(logger);
  }

  /**
   * Create AI service from legacy config
   */
  static createFromLegacyConfig(
    legacyConfig: Record<string, unknown>,
    logger: Logger
  ): AIServiceBundle {
    const config: AIFactoryConfig = {
      sampler: {
        type: ((legacyConfig.provider as string) || 'mock') as
          | 'custom'
          | 'mock'
          | 'anthropic'
          | 'openai',
        config: legacyConfig
      },
      validation: {
        enabled: legacyConfig.enableValidation !== false,
        strict: legacyConfig.strictValidation === true
      },
      logger
    };

    return this.createBundle(config);
  }

  /**
   * Create mock services for testing
   */
  static createMockBundle(logger: Logger): AIServiceBundle {
    const mockSampler = new MockMCPSampler(logger);
    const structuredSampler = new StructuredSampler(mockSampler, logger);
    const contentValidator = new ContentValidator(logger);

    return {
      sampler: mockSampler,
      structuredSampler,
      contentValidator
    };
  }
}
