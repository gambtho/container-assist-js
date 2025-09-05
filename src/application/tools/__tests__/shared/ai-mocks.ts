/**
 * AI service mocks for MCP tool testing
 */

import { jest } from '@jest/globals';
import { z } from 'zod';
import { Success, Failure, type Result } from '../../../../domain/types/result';
import { createSampleDockerfile, createSampleK8sManifests } from './test-utils';

/**
 * Simple hash function for deterministic test behavior
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

export interface AIGenerationOptions {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
  context?: Record<string, unknown>;
  schema?: z.ZodSchema;
}

export interface AIGenerationResult<T = unknown> {
  content: T;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cached?: boolean;
}

/**
 * Mock AI service with realistic responses for containerization tools
 */
export function createMockAIService(): {
  generateStructured: jest.MockedFunction<
    (options: AIGenerationOptions) => Promise<Result<AIGenerationResult>>
  >;
  generateText: jest.MockedFunction<(options: AIGenerationOptions) => Promise<Result<string>>>;
  validateContent: jest.MockedFunction<
    (content: string, criteria: string[]) => Promise<Result<boolean>>
  >;
  isAvailable: jest.MockedFunction<() => Promise<boolean>>;
  getModelInfo: jest.MockedFunction<() => Promise<Result<unknown>>>;
} {
  return {
    // Generate structured output (most common for tools)
    generateStructured: jest
      .fn<(options: AIGenerationOptions) => Promise<Result<AIGenerationResult>>>()
      .mockImplementation((options) => {
        if (!options.prompt) {
          return Promise.resolve(Failure('Prompt is required'));
        }

        if (options.prompt.includes('fail-generation')) {
          return Promise.resolve(Failure('AI generation failed: model unavailable'));
        }

        // Return different mock responses based on prompt content
        let mockContent: unknown;

        if (options.prompt.includes('dockerfile') || options.prompt.includes('Dockerfile')) {
          mockContent = {
            dockerfile: createSampleDockerfile(),
            explanation: 'Generated optimized Dockerfile for Node.js application',
            optimizations: [
              'Used Alpine Linux for smaller image size',
              'Multi-stage build for production optimization',
              'Non-root user for security',
              'Proper layer caching for dependencies',
            ],
          };
        } else if (options.prompt.includes('kubernetes') || options.prompt.includes('k8s')) {
          const manifests = createSampleK8sManifests();
          mockContent = {
            deployment: manifests.deployment,
            service: manifests.service,
            explanation: 'Generated Kubernetes deployment and service manifests',
            recommendations: [
              'Configure resource limits and requests',
              'Add health check probes',
              'Consider using ConfigMaps for configuration',
            ],
          };
        } else if (
          options.prompt.includes('base image') ||
          options.prompt.includes('image recommendation')
        ) {
          mockContent = {
            recommendedImage: 'node:16-alpine',
            alternatives: ['node:16-slim', 'node:18-alpine'],
            reasoning: 'Alpine variant provides smaller size while maintaining compatibility',
            security: 'Recent version with security patches',
            size: '50MB compressed',
          };
        } else if (options.prompt.includes('error') || options.prompt.includes('fix')) {
          mockContent = {
            diagnosis: 'Missing dependency in package.json',
            solution: 'Add missing express dependency',
            fixedCode: 'npm install express',
            explanation: 'The application requires Express.js framework',
          };
        } else {
          // Generic response
          mockContent = {
            response: `Generated response for: ${options.prompt.substring(0, 50)}`,
            confidence: 0.95,
            suggestions: [
              'Consider reviewing the generated output',
              'Test in development environment',
            ],
          };
        }

        // Validate against schema if provided
        if (options.schema) {
          try {
            options.schema.parse(mockContent);
          } catch (error) {
            return Promise.resolve(
              Failure(`Generated content does not match schema: ${String(error)}`),
            );
          }
        }

        const result: AIGenerationResult = {
          content: mockContent,
          model: options.model ?? 'claude-3-opus',
          usage: {
            promptTokens: Math.floor(options.prompt.length / 4), // Rough estimate
            completionTokens: Math.floor(JSON.stringify(mockContent).length / 4),
            totalTokens: Math.floor(
              (options.prompt.length + JSON.stringify(mockContent).length) / 4,
            ),
          },
          cached: simpleHash(options.prompt) % 10 > 7, // Deterministic 30% chance based on prompt
        };

        return Promise.resolve(Success(result));
      }),

    // Generate text output (simpler interface)
    generateText: jest
      .fn<(options: AIGenerationOptions) => Promise<Result<string>>>()
      .mockImplementation((options) => {
        if (!options.prompt) {
          return Promise.resolve(Failure('Prompt is required'));
        }

        if (options.prompt.includes('fail-generation')) {
          return Promise.resolve(Failure('AI text generation failed'));
        }

        // Generate mock text based on prompt
        let mockText: string;

        if (options.prompt.includes('dockerfile')) {
          mockText = createSampleDockerfile();
        } else if (options.prompt.includes('kubernetes')) {
          const manifests = createSampleK8sManifests();
          mockText = `${manifests.deployment}\n---\n${manifests.service}`;
        } else if (options.prompt.includes('analysis')) {
          mockText = `Analysis Result:
- Language: Node.js
- Framework: Express
- Dependencies: express, cors, helmet
- Recommended base image: node:16-alpine
- Security considerations: Update dependencies, use non-root user
- Performance optimizations: Enable gzip compression, implement caching`;
        } else {
          mockText = `Generated text response for: ${options.prompt.substring(0, 100)}...

This is a mock response that would typically contain relevant information
based on the input prompt. In a real scenario, this would be generated
by an AI language model.`;
        }

        return Promise.resolve(Success(mockText));
      }),

    // Validate content (used for output validation)
    validateContent: jest
      .fn<(content: string, criteria: string[]) => Promise<Result<boolean>>>()
      .mockImplementation((content, criteria) => {
        if (!content) {
          return Promise.resolve(Failure('Content is required for validation'));
        }

        // Simple validation based on criteria
        const validationPassed = criteria.every((criterion) => {
          switch (criterion.toLowerCase()) {
            case 'dockerfile':
              return content.includes('FROM') && content.includes('WORKDIR');
            case 'kubernetes':
              return content.includes('apiVersion') && content.includes('kind');
            case 'yaml':
              return content.includes(':') && !content.includes('{');
            case 'json':
              try {
                JSON.parse(content);
                return true;
              } catch {
                return false;
              }
            default:
              return true; // Unknown criteria pass by default
          }
        });

        return Promise.resolve(Success(validationPassed));
      }),

    // Service availability check
    isAvailable: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),

    // Get model info
    getModelInfo: jest
      .fn<
        () => Promise<
          Result<{
            name: string;
            version: string;
            contextLength: number;
            features: string[];
          }>
        >
      >()
      .mockResolvedValue(
        Success({
          name: 'claude-3-opus',
          version: '20240229',
          contextLength: 200000,
          features: ['text-generation', 'structured-output', 'function-calling'],
        }),
      ),
  };
}

/**
 * Mock structured sampler for advanced AI operations
 */

/**
 * Mock content validator
 */
