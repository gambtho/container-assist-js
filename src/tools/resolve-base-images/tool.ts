/**
 * Resolve Base Images Tool - Flat Architecture
 *
 * Resolves optimal Docker base images for applications
 * Follows architectural requirement: only imports from src/lib/
 */

import { createSessionManager, type SessionManager } from '../../lib/session';
import { createTimer, type Logger } from '../../lib/logger';
import { createDockerRegistryClient } from '../../lib/docker';
import {
  Success,
  Failure,
  type Result,
  updateWorkflowState,
  type WorkflowState,
} from '../../domain/types';
import { getSuggestedBaseImages, getRecommendedBaseImage } from '../../lib/base-images';

interface ResolveBaseImagesContext {
  sessionManager?: SessionManager;
}

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
 * Resolve optimal base images for the application
 */
async function resolveBaseImages(
  config: ResolveBaseImagesConfig,
  logger: Logger,
  context?: ResolveBaseImagesContext,
): Promise<Result<BaseImageRecommendation>> {
  const timer = createTimer(logger, 'resolve-base-images');

  try {
    const { sessionId, targetEnvironment = 'production', securityLevel = 'medium' } = config;

    logger.info({ sessionId, targetEnvironment, securityLevel }, 'Resolving base images');

    // Use sessionManager from context or create new one
    const sessionManager = context?.sessionManager || createSessionManager(logger);

    // Get or create session
    let session = await sessionManager.get(sessionId);
    if (!session) {
      // Create new session with the specified sessionId
      session = await sessionManager.create(sessionId);
    }

    // Get analysis result from session
    const workflowState = session as
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
    const suggestedImages = getSuggestedBaseImages(language);

    // Select primary image based on environment and security level
    let primaryImage = suggestedImages[0] ?? getRecommendedBaseImage(language); // Default fallback
    if (targetEnvironment === 'production' && securityLevel === 'high') {
      // Prefer alpine or slim images for production with high security
      primaryImage =
        suggestedImages.find((img) => img.includes('alpine') || img.includes('slim')) ??
        primaryImage;
    }

    const [imageName, imageTag] = primaryImage.split(':');

    // Get real image metadata from Docker registry
    const registryClient = createDockerRegistryClient(logger);
    const imageMetadata = await registryClient.getImageMetadata(
      imageName ?? 'node',
      imageTag ?? 'latest',
    );

    const recommendation: BaseImageRecommendation = {
      sessionId,
      primaryImage: {
        name: imageMetadata.name,
        tag: imageMetadata.tag,
        ...(imageMetadata.digest && { digest: imageMetadata.digest }),
        ...(imageMetadata.size && { size: imageMetadata.size }),
        ...(imageMetadata.lastUpdated && { lastUpdated: imageMetadata.lastUpdated }),
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
    const currentState = session as WorkflowState | undefined;
    const updatedWorkflowState = updateWorkflowState(currentState ?? {}, {
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
 * Resolve base images tool instance
 */
export const resolveBaseImagesTool = {
  name: 'resolve-base-images',
  execute: (config: ResolveBaseImagesConfig, logger: Logger, context?: ResolveBaseImagesContext) =>
    resolveBaseImages(config, logger, context),
};
