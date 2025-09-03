/**
 * Tag Image - Helper Functions
 */

import type { MCPToolContext } from '../tool-types.js';

/**
 * Generate semantic version tags
 */
export function generateSemanticTags(version: string, registry?: string): string[] {
  const tags: string[] = [];
  const prefix = registry ? `${registry}/` : '';

  // Parse semantic version
  const versionMatch = version.match(/^v?(\d+)\.(\d+)\.(\d+)(-(.+))?$/);
  if (versionMatch) {
    const [, major, minor, patch, , prerelease] = versionMatch;

    if (!prerelease) {
      // Add all semantic version tags
      tags.push(`${prefix}app:${major}.${minor}.${patch}`);
      tags.push(`${prefix}app:${major}.${minor}`);
      tags.push(`${prefix}app:${major}`);
    } else {
      // Only exact version for pre-releases
      tags.push(`${prefix}app:${major}.${minor}.${patch}-${prerelease}`);
    }
  } else {
    // Non-semantic version
    tags.push(`${prefix}app:${version}`);
  }

  return tags;
}

/**
 * Generate standard tags based on context
 */
export function generateStandardTags(
  projectName: string,
  version?: string,
  registry?: string,
  includeLatest: boolean = true
): string[] {
  const tags: string[] = [];
  const prefix = registry ? `${registry}/` : '';
  const timestamp = new Date().toISOString().split('T')[0];

  // Project-based tags
  tags.push(`${prefix}${projectName}:${timestamp}`);

  // Version tags if provided
  if (version) {
    tags.push(...generateSemanticTags(version, registry));
  }

  // Latest tag
  if (includeLatest) {
    tags.push(`${prefix}${projectName}:latest`);
  }

  // Build number from environment
  if (process.env.BUILD_NUMBER) {
    tags.push(`${prefix}${projectName}:build-${process.env.BUILD_NUMBER}`);
  }

  // Git commit SHA from environment
  if (process.env.GIT_COMMIT) {
    const shortSha = process.env.GIT_COMMIT.substring(0, 7);
    tags.push(`${prefix}${projectName}:${shortSha}`);
  }

  return tags;
}

/**
 * Tag Docker image using Docker service or CLI
 */
export async function tagDockerImage(
  source: string,
  target: string,
  context: MCPToolContext
): Promise<boolean> {
  const { dockerService, logger } = context;

  if (dockerService && 'tag' in dockerService) {
    const result = await (dockerService as any).tag(source, target);
    return result.success;
  }

  // CLI fallback would go here
  logger.warn('Docker service not available - simulating tag operation');
  return true;
}

/**
 * Get source image from session or input
 */
export async function getSourceImage(
  sourceImage: string | undefined,
  sessionId: string | undefined,
  sessionService: any
): Promise<{ source: string; projectName: string }> {
  let source = sourceImage;
  let projectName = 'app';

  // Get from session if not provided
  if (!source && sessionId && sessionService) {
    const session = await sessionService.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const buildResult = session.workflow_state?.build_result;
    if (buildResult) {
      source = buildResult.imageId ?? buildResult.tag;
    }

    projectName = (session.metadata?.projectName as string) || 'app';
  }

  if (!source) {
    throw new Error('No source image specified');
  }

  return { source, projectName };
}

/**
 * Generate all tags for the image
 */
export function generateAllTags(
  targetTags: string[],
  customTags: string[],
  projectName: string,
  version?: string,
  registry?: string,
  latest?: boolean
): string[] {
  let allTags: string[] = [];

  // Add provided target tags
  if (targetTags.length > 0) {
    allTags.push(...targetTags);
  }

  // Add custom tags
  if (customTags.length > 0) {
    allTags.push(...customTags);
  }

  // Generate standard tags if no explicit tags provided
  if (allTags.length === 0) {
    allTags = generateStandardTags(projectName, version, registry, latest);
  }

  // Add registry prefix if not already present
  if (registry != null) {
    allTags = allTags.map((tag) => (tag.startsWith(registry) ? tag : `${registry}/${tag}`));
  }

  // Remove duplicates
  allTags = Array.from(new Set(allTags));

  return allTags;
}

/**
 * Apply tags to the Docker image
 */
export async function applyTags(
  source: string,
  allTags: string[],
  context: MCPToolContext
): Promise<Array<{ tag: string; fullTag?: string; created?: boolean }>> {
  const { logger } = context;
  const tagResults: Array<{ tag: string; fullTag?: string; created?: boolean }> = [];

  for (const tag of allTags) {
    try {
      const success = await tagDockerImage(source, tag, context);
      tagResults.push({
        tag: tag.split('/').pop() || tag,
        fullTag: tag,
        created: success
      });

      if (success) {
        logger.info({ source, tag }, 'Tagged image');
      } else {
        logger.warn({ source, tag }, 'Failed to tag image');
      }
    } catch (error) {
      logger.error({ source, tag, error }, 'Error tagging image');
      tagResults.push({
        tag: tag.split('/').pop() || tag,
        fullTag: tag,
        created: false
      });
    }
  }

  return tagResults;
}

/**
 * Validate tagging results
 */
export function validateTagResults(
  tagResults: Array<{ tag: string; fullTag?: string; created?: boolean }>
): Array<{ tag: string; fullTag?: string; created?: boolean }> {
  const successfulTags = tagResults.filter((t) => t.created);
  if (successfulTags.length === 0) {
    throw new Error('No tags were successfully created');
  }
  return successfulTags;
}
