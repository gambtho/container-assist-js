/**
 * AI Service - MCP-Native Context Provider
 *
 * Instead of generating AI responses directly, this service formats context
 * for the MCP host AI client to use when generating responses.
 * This follows the MCP pattern where the host AI provides intelligence.
 */

import type { Logger } from 'pino';
import { Success, Failure, type Result } from '../types/core/index.js';

/**
 * AI request configuration for context generation
 */
export interface AIRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  timeout?: number;
  context?: Record<string, unknown>;
}

/**
 * MCP-native AI response containing structured context instead of generated text
 */
export interface AIResponse {
  /** Structured context for the MCP host AI to use */
  context: {
    /** The original prompt for context */
    prompt: string;
    /** Structured context data */
    data: Record<string, unknown>;
    /** Suggested approach or guidelines */
    guidance?: string;
    /** Template or pattern to follow */
    template?: string;
  };
  /** Metadata about the context preparation */
  metadata: {
    contextSize: number;
    dataFields: string[];
    guidance: boolean;
    template: boolean;
  };
}

/**
 * Create an AI service that provides structured context for MCP host AI
 */
interface AIService {
  generate: (request: AIRequest) => Promise<Result<AIResponse>>;
  ping: () => Promise<Result<boolean>>;
}

export const createAIService = (logger: Logger): AIService => {
  return {
    /**
     * Generate structured context for MCP host AI to use
     */
    async generate(request: AIRequest): Promise<Result<AIResponse>> {
      try {
        logger.debug(
          {
            promptLength: request.prompt.length,
            contextFields: Object.keys(request.context || {}),
          },
          'Preparing context for MCP host AI',
        );

        // Determine context type and create appropriate guidance
        const contextData = request.context || {};
        let guidance = '';
        let template = '';

        // Dockerfile generation context
        if (request.prompt.toLowerCase().includes('dockerfile')) {
          guidance =
            'Generate an optimized Dockerfile following security best practices, using multi-stage builds when appropriate, and creating non-root users';
          template = `FROM {baseImage}
WORKDIR /app
RUN addgroup -g 1001 -S appuser && adduser -S appuser -u 1001 -G appuser
{buildCommands}
{healthCheck}
USER appuser
{startCommand}`;
        }

        // Kubernetes manifest generation context
        else if (
          request.prompt.toLowerCase().includes('kubernetes') ||
          request.prompt.toLowerCase().includes('k8s')
        ) {
          guidance =
            'Generate Kubernetes manifests following best practices with proper resource limits, security contexts, and deployment strategies';
          template = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {appName}
spec:
  replicas: {replicas}
  selector:
    matchLabels:
      app: {appName}
  template:
    metadata:
      labels:
        app: {appName}
    spec:
      containers:
      - name: {containerName}
        image: {imageName}
        resources:
          limits:
            memory: {memoryLimit}
            cpu: {cpuLimit}`;
        }

        // Code analysis context
        else if (
          request.prompt.toLowerCase().includes('analyze') ||
          request.prompt.toLowerCase().includes('repository')
        ) {
          guidance =
            'Analyze the repository structure, identify the primary language and framework, detect dependencies, and suggest appropriate containerization strategies';
        }

        // Create structured response for MCP host AI
        const response: AIResponse = {
          context: {
            prompt: request.prompt,
            data: contextData,
            ...(guidance && { guidance }),
            ...(template && { template }),
          },
          metadata: {
            contextSize: JSON.stringify(contextData).length,
            dataFields: Object.keys(contextData),
            guidance: !!guidance,
            template: !!template,
          },
        };

        logger.info(
          {
            contextSize: response.metadata.contextSize,
            dataFields: response.metadata.dataFields.length,
            hasGuidance: response.metadata.guidance,
            hasTemplate: response.metadata.template,
          },
          'Context prepared for MCP host AI',
        );

        return Success(response);
      } catch (error) {
        const errorMessage = `Context preparation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger.error({ error: errorMessage, request }, 'Context preparation failed');

        return Failure(errorMessage);
      }
    },

    /**
     * Check context service availability
     */
    async ping(): Promise<Result<boolean>> {
      try {
        logger.debug('Context service available');
        return Success(true);
      } catch (error) {
        const errorMessage = `Context service check failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        return Failure(errorMessage);
      }
    },
  };
};
