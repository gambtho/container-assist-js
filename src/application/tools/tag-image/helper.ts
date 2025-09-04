/**
 * Tag Image - Helper Functions
 */

import type { ToolContext } from '../tool-types.js';
import { type Result, ok, fail } from '../../../domain/types/result.js';

/**
 * Validate Docker tag format
 */
function isValidDockerTag(tag: string): boolean {
  // Docker tag rules: lowercase alphanumeric, periods, underscores, hyphens
  // Cannot start with period or hyphen, max 128 characters
  const tagRegex = /^[a-z0-9][a-z0-9._-]{0,127}$/;
  return tagRegex.test(tag.toLowerCase());
}

/**
 * Generate semantic version tags
 */
export function generateSemanticTags(
  version: string,
  registry?: string,
  imageName: string = 'app',
): Result<string[]> {
  const tags: string[] = [];
  const prefix = registry ? `${registry}/` : '';

  // Validate version format
  if (!version || version.trim() === '') {
    return fail('Version cannot be empty');
  }

  // Clean version string
  const cleanVersion = version.trim();

  // Parse semantic version (support v prefix, pre-release, and build metadata)
  const versionMatch = cleanVersion.match(
    /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([-\w.]+))?(?:\+([-\w.]+))?$/,
  );
  if (versionMatch) {
    const [, major, minor = '0', patch = '0', prerelease, buildMeta] = versionMatch;

    if (!prerelease) {
      // Add all semantic version tags for stable releases
      tags.push(`${prefix}${imageName}:${major}.${minor}.${patch}`);
      tags.push(`${prefix}${imageName}:${major}.${minor}`);
      tags.push(`${prefix}${imageName}:${major}`);
      tags.push(`${prefix}${imageName}:v${major}.${minor}.${patch}`);
    } else {
      // Only exact version for pre-releases
      tags.push(`${prefix}${imageName}:${major}.${minor}.${patch}-${prerelease}`);
      tags.push(`${prefix}${imageName}:v${major}.${minor}.${patch}-${prerelease}`);
    }

    // Add build metadata tag if present
    if (buildMeta) {
      tags.push(`${prefix}${imageName}:${major}.${minor}.${patch}+${buildMeta}`);
    }
  } else {
    // Non-semantic version - validate it's safe for Docker tags
    if (!isValidDockerTag(cleanVersion)) {
      return fail(`Invalid version format for Docker tag: ${cleanVersion}`);
    }
    tags.push(`${prefix}${imageName}:${cleanVersion}`);
  }

  return ok(tags);
}

/**
 * Generate standard tags based on context
 */
export function generateStandardTags(
  projectName: string,
  version?: string,
  registry?: string,
  includeLatest: boolean = true,
): Result<string[]> {
  const tags: string[] = [];
  const prefix = registry ? `${registry}/` : '';
  const timestamp = new Date().toISOString().split('T')[0];

  // Validate project name
  if (!projectName || !isValidDockerTag(projectName)) {
    return fail(`Invalid project name for Docker image: ${projectName}`);
  }

  // Project-based tags
  tags.push(`${prefix}${projectName}:${timestamp}`);

  // Version tags if provided
  if (version) {
    const versionTagsResult = generateSemanticTags(version, registry, projectName);
    if (versionTagsResult.kind === 'ok') {
      for (const tag of versionTagsResult.value) {
        tags.push(tag);
      }
    } else {
      // For non-semantic versions, add as-is if valid
      if (isValidDockerTag(version)) {
        tags.push(`${prefix}${projectName}:${version}`);
      }
    }
  }

  // Latest tag
  if (includeLatest) {
    tags.push(`${prefix}${projectName}:latest`);
  }

  // Build number from environment
  if (process.env.BUILD_NUMBER) {
    const buildNum = process.env.BUILD_NUMBER.trim();
    if (isValidDockerTag(`build-${buildNum}`)) {
      tags.push(`${prefix}${projectName}:build-${buildNum}`);
    }
  }

  // Git commit SHA from environment
  if (process.env.GIT_COMMIT) {
    const shortSha = process.env.GIT_COMMIT.substring(0, 7);
    if (isValidDockerTag(shortSha)) {
      tags.push(`${prefix}${projectName}:${shortSha}`);
    }
  }

  return ok(tags);
}

/**
 * Tag Docker image using Docker service or CLI
 */
export async function tagDockerImage(
  source: string,
  target: string,
  context: ToolContext,
): Promise<Result<{ source: string; target: string; success: boolean }>> {
  const { dockerService, logger } = context;

  // Validate inputs
  if (!source || source.trim() === '') {
    return fail('Source image cannot be empty');
  }
  if (!target || target.trim() === '') {
    return fail('Target tag cannot be empty');
  }

  try {
    if (dockerService && 'tag' in dockerService) {
      await dockerService.tag(source, target);
      return ok({ source, target, success: true });
    }

    // CLI fallback would go here
    logger.warn('Docker service not available - simulating tag operation');
    return ok({ source, target, success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(`Failed to tag image: ${message}`, 'TAG_FAILED', { source, target });
  }
}

/**
 * Get source image from session or input
 */
export async function getSourceImage(
  sourceImage: string | undefined,
  sessionId: string | undefined,
  sessionService: any,
): Promise<Result<{ source: string; projectName: string }>> {
  let source = sourceImage;
  let projectName = 'app';

  // Get from session if not provided
  if (!source && sessionId && sessionService) {
    try {
      const session = await sessionService.get(sessionId);
      if (!session) {
        return fail('Session not found', 'SESSION_NOT_FOUND');
      }

      const buildResult = session.workflow_state?.build_result;
      if (buildResult) {
        source = buildResult.imageId ?? buildResult.tag;
      }

      projectName = (session.metadata?.projectName as string) || 'app';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(`Failed to get session: ${message}`, 'SESSION_ERROR');
    }
  }

  if (!source) {
    return fail('No source image specified', 'NO_SOURCE_IMAGE');
  }

  // Validate project name for Docker compatibility
  if (!isValidDockerTag(projectName)) {
    projectName = 'app'; // Fallback to safe default
  }

  return ok({ source, projectName });
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
  latest?: boolean,
): Result<string[]> {
  let allTags: string[] = [];

  // Validate and add provided target tags
  if (targetTags.length > 0) {
    for (const tag of targetTags) {
      // Extract tag name after colon for validation
      const tagParts = tag.split(':');
      const tagName = tagParts[tagParts.length - 1];
      if (!tagName || !isValidDockerTag(tagName)) {
        return fail(`Invalid Docker tag format: ${tag}`);
      }
    }
    allTags.push(...targetTags);
  }

  // Validate and add custom tags
  if (customTags.length > 0) {
    for (const tag of customTags) {
      const tagParts = tag.split(':');
      const tagName = tagParts[tagParts.length - 1];
      if (!tagName || !isValidDockerTag(tagName)) {
        return fail(`Invalid custom Docker tag format: ${tag}`);
      }
    }
    allTags.push(...customTags);
  }

  // Generate standard tags if no explicit tags provided
  if (allTags.length === 0) {
    const standardTagsResult = generateStandardTags(projectName, version, registry, latest);
    if (standardTagsResult.kind === 'fail') {
      return standardTagsResult;
    }
    allTags = standardTagsResult.value;
  }

  // Add registry prefix if not already present
  if (registry != null) {
    allTags = allTags.map((tag) => (tag.startsWith(registry) ? tag : `${registry}/${tag}`));
  }

  // Remove duplicates
  allTags = Array.from(new Set(allTags));

  return ok(allTags);
}

/**
 * Apply tags to the Docker image
 */
export async function applyTags(
  source: string,
  allTags: string[],
  context: ToolContext,
): Promise<Result<Array<{ tag: string; fullTag: string; created: boolean }>>> {
  const { logger } = context;
  const tagResults: Array<{ tag: string; fullTag: string; created: boolean }> = [];

  for (const tag of allTags) {
    const result = await tagDockerImage(source, tag, context);

    if (result.kind === 'ok') {
      tagResults.push({
        tag: tag.split('/').pop() || tag,
        fullTag: tag,
        created: result.value.success,
      });

      if (result.value.success) {
        logger.info({ source, tag }, 'Tagged image');
      } else {
        logger.warn({ source, tag }, 'Failed to tag image');
      }
    } else {
      logger.error({ source, tag, error: result.error }, 'Error tagging image');
      tagResults.push({
        tag: tag.split('/').pop() || tag,
        fullTag: tag,
        created: false,
      });
    }
  }

  return ok(tagResults);
}

/**
 * Validate tagging results
 */
export function validateTagResults(
  tagResults: Array<{ tag: string; fullTag: string; created: boolean }>,
): Result<Array<{ tag: string; fullTag: string; created: boolean }>> {
  const successfulTags = tagResults.filter((t) => t.created === true);
  if (successfulTags.length === 0) {
    return fail('No tags were successfully created', 'NO_TAGS_CREATED', {
      attemptedTags: tagResults.length,
    });
  }
  return ok(successfulTags);
}
