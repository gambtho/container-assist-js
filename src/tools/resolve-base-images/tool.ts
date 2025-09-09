/**
 * Resolve Base Images Tool - Standardized Implementation
 *
 * Resolves optimal Docker base images for applications using standardized
 * helpers for consistency and improved error handling
 *
 * @example
 * ```typescript
 * const result = await resolveBaseImages({
 *   sessionId: 'session-123', // optional
 *   technology: 'nodejs',
 *   requirements: { environment: 'production', security: 'high' }
 * }, context, logger);
 *
 * if (result.primaryImage) {
 *   console.log('Recommended image:', result.primaryImage.name);
 *   console.log('Rationale:', result.rationale);
 * }
 * ```
 */

import { wrapTool } from '@mcp/tools/tool-wrapper';
import { resolveSession, updateSessionData } from '@mcp/tools/session-helpers';
import type { ExtendedToolContext } from '../shared-types';
import { createTimer, type Logger } from '../../lib/logger';
import { createDockerRegistryClient } from '../../lib/docker';
import { Success, Failure, type Result } from '../../domain/types';
import { getSuggestedBaseImages, getRecommendedBaseImage } from '../../lib/base-images';
import type { ResolveBaseImagesParams } from './schema';

export interface BaseImageRecommendation {
  sessionId: string;
  technology?: string;
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
 * Core base image resolution implementation
 */
async function resolveBaseImagesImpl(
  params: ResolveBaseImagesParams,
  context: ExtendedToolContext,
  logger: Logger,
): Promise<Result<BaseImageRecommendation>> {
  const timer = createTimer(logger, 'resolve-base-images');

  try {
    const { technology, requirements = {} } = params;

    // Extract requirements
    const targetEnvironment = (requirements.environment as string) || 'production';
    const securityLevel = (requirements.security as string) || 'medium';

    logger.info({ technology, targetEnvironment, securityLevel }, 'Resolving base images');

    // Resolve session (now always optional)
    const sessionResult = await resolveSession(logger, context, {
      ...(params.sessionId ? { sessionId: params.sessionId } : {}),
      defaultIdHint: 'resolve-base-images',
      createIfNotExists: true,
    });

    if (!sessionResult.ok) {
      return Failure(sessionResult.error);
    }

    const { id: sessionId, state: session } = sessionResult.value;
    logger.info({ sessionId, technology, targetEnvironment }, 'Starting base image resolution');

    // Get analysis result from session or use provided technology
    const sessionState = session as
      | { analysis_result?: { language?: string; framework?: string } }
      | null
      | undefined;
    const analysisResult = sessionState?.analysis_result;

    // Use provided technology or fall back to session analysis
    const language = technology || analysisResult?.language;
    if (!language) {
      return Failure(
        'No technology specified. Provide technology parameter or run analyze-repo tool first.',
      );
    }

    const framework = analysisResult?.framework;
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
      rationale: `Selected ${primaryImage} for ${language}${framework ? `/${framework}` : ''} application based on ${targetEnvironment} environment with ${securityLevel} security requirements`,
      technology: language,
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

    // Update session with recommendation using standardized helper
    const updateResult = await updateSessionData(
      sessionId,
      {
        base_image_recommendation: recommendation,
        completed_steps: [...(session.completed_steps || []), 'resolve-base-images'],
      },
      logger,
      context,
    );

    if (!updateResult.ok) {
      logger.warn(
        { error: updateResult.error },
        'Failed to update session, but resolution succeeded',
      );
    }

    timer.end({ primaryImage, sessionId, technology: language });
    logger.info(
      { sessionId, primaryImage, technology: language },
      'Base image resolution completed',
    );

    return Success(recommendation);
  } catch (error) {
    timer.error(error);
    logger.error({ error }, 'Base image resolution failed');

    return Failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Wrapped resolve base images tool with standardized behavior
 */
export const resolveBaseImagesTool = wrapTool('resolve-base-images', resolveBaseImagesImpl);

/**
 * Legacy export for backward compatibility during migration
 */
export const resolveBaseImages = async (
  params: ResolveBaseImagesParams,
  logger: Logger,
  context?: ExtendedToolContext,
): Promise<Result<BaseImageRecommendation>> => {
  return resolveBaseImagesImpl(params, context || {}, logger);
};
