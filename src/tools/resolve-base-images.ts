/**
 * Resolve Base Images Tool - Flat Architecture
 *
 * Resolves optimal Docker base images for applications
 * Follows architectural requirement: only imports from src/lib/
 */

import { getSessionManager } from '../lib/session';
import { createAIService } from '../lib/ai';
import { createTimer, type Logger } from '../lib/logger';
import { Success, Failure, type Result } from '../types/core/index';
import { updateWorkflowState, type WorkflowState } from '../types/workflow-state';

export interface ResolveBaseImagesConfig {
  sessionId: string;
  targetEnvironment?: 'development' | 'staging' | 'production';
  securityLevel?: 'low' | 'medium' | 'high';
  performancePriority?: 'size' | 'speed' | 'balanced';
  architectures?: string[];
}

export interface BaseImageRecommendation {
  sessionId: string;
  primaryImage: {
    name: string;
    tag: string;
    digest?: string;
    size?: number;
    lastUpdated?: string;
  };
  alternativeImages?: Array<{
    name: string;
    tag: string;
    reason: string;
  }>;
  rationale: string;
  securityConsiderations?: string[];
  performanceNotes?: string[];
}

/**
 * Get suggested images based on language and framework
 */
function getSuggestedImages(language: string, _framework?: string): string[] {
  const suggestions: Record<string, string[]> = {
    javascript: ['node:18-alpine', 'node:18-slim', 'node:18'],
    typescript: ['node:18-alpine', 'node:18-slim', 'node:18'],
    python: ['python:3.11-alpine', 'python:3.11-slim', 'python:3.11'],
    go: ['golang:1.21-alpine', 'golang:1.21', 'scratch'],
    java: ['openjdk:17-alpine', 'openjdk:17-slim', 'eclipse-temurin:17'],
    rust: ['rust:alpine', 'rust:slim', 'rust:latest'],
    ruby: ['ruby:3.2-alpine', 'ruby:3.2-slim', 'ruby:3.2'],
    php: ['php:8.2-fpm-alpine', 'php:8.2-apache', 'php:8.2-cli'],
  };

  const langKey = language.toLowerCase();
  return suggestions[langKey] ?? ['alpine:latest', 'ubuntu:22.04', 'debian:12-slim'];
}

/**
 * Resolve optimal base images for the application
 */
export async function resolveBaseImages(
  config: ResolveBaseImagesConfig,
  logger: Logger,
): Promise<Result<BaseImageRecommendation>> {
  const timer = createTimer(logger, 'resolve-base-images');

  try {
    const { sessionId, targetEnvironment = 'production', securityLevel = 'medium' } = config;

    logger.info({ sessionId, targetEnvironment, securityLevel }, 'Resolving base images');

    // Create lib instances
    const sessionManager = getSessionManager(logger);

    // Fallback mock function for testing scenarios
    const mockAIFunction = async (
      _request: unknown,
    ): Promise<{ success: true; text: string; tokenCount: number; model: string }> => ({
      success: true as const,
      text: 'Mock AI response',
      tokenCount: 10,
      model: 'mock',
    });
    // AI service is created but not used in mock implementation
    // Will be used when actual AI functionality is integrated
    void createAIService(mockAIFunction, logger);

    // Get session
    const session = await sessionManager.get(sessionId);
    if (!session) {
      return Failure('Session not found');
    }

    // Get analysis result from session
    const workflowState = session.workflow_state as
      | {
          analysis_result?: { language?: string; framework?: string };
        }
      | null
      | undefined;
    const analysisResult = workflowState?.analysis_result;
    if (!analysisResult) {
      return Failure('Repository must be analyzed first - run analyze_repo');
    }

    const language = analysisResult?.language ?? 'unknown';
    const suggestedImages = getSuggestedImages(language, analysisResult?.framework);

    // Select primary image based on environment and security level
    let primaryImage = suggestedImages[0] ?? 'node:18-alpine'; // Default fallback
    if (targetEnvironment === 'production' && securityLevel === 'high') {
      // Prefer alpine or slim images for production with high security
      primaryImage =
        suggestedImages.find((img) => img.includes('alpine') || img.includes('slim')) ??
        primaryImage;
    }

    const [imageName, imageTag] = primaryImage.split(':');

    const recommendation: BaseImageRecommendation = {
      sessionId,
      primaryImage: {
        name: imageName ?? 'node',
        tag: imageTag ?? 'latest',
        size: 50 * 1024 * 1024, // Mock size: 50MB
        lastUpdated: new Date().toISOString(),
      },
      alternativeImages: suggestedImages.slice(1, 3).map((img) => {
        const [name, tag] = img.split(':');
        return {
          name: name ?? 'node',
          tag: tag ?? 'latest',
          reason: img.includes('alpine') ? 'Smaller size, better security' : 'More compatibility',
        };
      }),
      rationale: `Selected ${primaryImage} for ${language}${analysisResult?.framework ? `/${analysisResult.framework}` : ''} application based on ${targetEnvironment} environment with ${securityLevel} security requirements`,
      securityConsiderations: [
        securityLevel === 'high'
          ? 'Using minimal Alpine-based image for reduced attack surface'
          : 'Standard base image with regular security updates',
        'Recommend scanning with Trivy or Snyk before deployment',
      ],
      performanceNotes: [
        primaryImage.includes('alpine')
          ? 'Alpine images are smaller but may have compatibility issues with some packages'
          : 'Standard images have better compatibility but larger size',
      ],
    };

    // Update session with recommendation
    const currentState = session.workflow_state as WorkflowState | undefined;
    const updatedWorkflowState = updateWorkflowState(currentState, {
      completed_steps: [...(currentState?.completed_steps ?? []), 'resolve-base-images'],
      metadata: {
        ...(currentState?.metadata ?? {}),
        base_image_recommendation: recommendation,
      },
    });

    await sessionManager.update(sessionId, {
      workflow_state: updatedWorkflowState,
    });

    timer.end({ primaryImage });
    logger.info({ primaryImage }, 'Base image resolution completed');

    return Success(recommendation);
  } catch (error) {
    timer.error(error);
    logger.error({ error }, 'Base image resolution failed');

    return Failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Factory function for creating resolve-base-images tool instances
 */
export function createResolveBaseImagesTool(logger: Logger): {
  name: string;
  execute: (config: ResolveBaseImagesConfig) => Promise<Result<BaseImageRecommendation>>;
} {
  return {
    name: 'resolve-base-images',
    execute: (config: ResolveBaseImagesConfig) => resolveBaseImages(config, logger),
  };
}
