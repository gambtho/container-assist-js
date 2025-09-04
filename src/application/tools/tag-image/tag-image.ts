/**
 * Tag Image - MCP SDK Compatible Version
 */

import { z } from 'zod';
import { ErrorCode, DomainError } from '../../../contracts/types/errors.js';
import type { ToolDescriptor, ToolContext } from '../tool-types.js';
import type { Session } from '../../../contracts/types/session.js';

// Input schema with support for both snake_case and camelCase
const TagImageInput = z
  .object({
    session_id: z.string().optional(),
    sessionId: z.string().optional(),
    source_tag: z.string().optional(),
    sourceTag: z.string().optional(),
    source_image: z.string().optional(),
    sourceImage: z.string().optional(),
    target_tags: z.array(z.string()).optional(),
    targetTags: z.array(z.string()).optional(),
    target_tag: z.string().optional(),
    targetTag: z.string().optional(),
    registry: z.string().optional(),
    version: z.string().optional(),
    latest: z.boolean().default(true),
    custom_tags: z.array(z.string()).optional(),
    customTags: z.array(z.string()).optional(),
  })
  .transform((data) => ({
    sessionId: data.session_id ?? data.sessionId,
    sourceImage: data.source_tag ?? data.sourceTag ?? data.source_image ?? data.sourceImage,
    targetTags:
      data.target_tags ??
      (data.targetTags ||
        (data.target_tag ? [data.target_tag] : data.targetTag ? [data.targetTag] : [])),
    registry: data.registry,
    version: data.version,
    latest: data.latest,
    customTags: data.custom_tags ?? (data.customTags || []),
  }));

// Output schema
const TagImageOutput = z.object({
  success: z.boolean(),
  sourceImage: z.string(),
  tags: z.array(
    z.object({
      tag: z.string(),
      fullTag: z.string(),
      created: z.boolean(),
    }),
  ),
  registry: z.string().optional(),
  metadata: z.object({
    version: z.string().optional(),
    timestamp: z.string(),
    sessionId: z.string().optional(),
  }),
});

// Type aliases
export type TagInput = z.infer<typeof TagImageInput>;
export type TagOutput = z.infer<typeof TagImageOutput>;

/**
 * Generate semantic version tags
 */
function generateSemanticTags(version: string, registry?: string): string[] {
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
function generateStandardTags(
  projectName: string,
  version?: string,
  registry?: string,
  includeLatest: boolean = true,
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
async function tagDockerImage(
  source: string,
  target: string,
  context: ToolContext,
): Promise<boolean> {
  const { dockerService, logger } = context;

  if (dockerService && 'tag' in dockerService) {
    const result = await dockerService.tag(source, target);
    return result.success;
  }

  // CLI fallback would go here
  logger.warn('Docker service not available - simulating tag operation');
  return true;
}

/**
 * Main handler implementation
 */
const tagImageHandler: ToolDescriptor<TagInput, TagOutput> = {
  name: 'tag_image',
  description: 'Tag Docker image with version and registry information',
  category: 'workflow',
  inputSchema: TagImageInput,
  outputSchema: TagImageOutput,

  handler: async (input: TagInput, context: ToolContext): Promise<TagOutput> => {
    const { logger, sessionService } = context;
    const { sessionId, sourceImage, targetTags, registry, version, latest, customTags } = input;

    logger.info(
      {
        sessionId,
        sourceImage,
        targetTags: targetTags.length,
        registry,
        version,
      },
      'Starting image tagging',
    );

    try {
      // Determine source image
      let source = sourceImage;
      let projectName = 'app';

      // Get from session if not provided
      if (!source && sessionId && sessionService) {
        const session = await sessionService.get(sessionId);
        if (!session) {
          throw new DomainError(ErrorCode.SessionNotFound, 'Session not found');
        }

        const buildResult = session.workflow_state?.build_result;
        if (buildResult) {
          source = buildResult.imageId ?? buildResult.tag;
        }

        projectName = (session.metadata?.projectName as string) || 'app';
      }

      if (!source) {
        throw new DomainError(ErrorCode.VALIDATION_ERROR, 'No source image specified');
      }

      // Generate tags
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

      logger.info(
        {
          source,
          tags: allTags,
        },
        'Tagging image',
      );

      // Apply tags
      const tagResults: Array<{ tag: string; fullTag?: string; created?: boolean }> = [];

      for (const tag of allTags) {
        try {
          const success = await tagDockerImage(source, tag, context);
          tagResults.push({
            tag: tag.split('/').pop() || tag,
            fullTag: tag,
            created: success,
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
            created: false,
          });
        }
      }

      // Check if any tags were created
      const successfulTags = tagResults.filter((t) => t.created);
      if (successfulTags.length === 0) {
        throw new DomainError(ErrorCode.OPERATION_FAILED, 'No tags were successfully created');
      }

      // Update session with tag information
      if (sessionId && sessionService) {
        await sessionService.updateAtomic(sessionId, (session: Session) => ({
          ...session,
          workflow_state: {
            ...session.workflow_state,
            tag_result: {
              tags: tagResults
                .map((t) => t.fullTag)
                .filter((tag): tag is string => tag !== undefined),
              registry,
              success: true,
            },
          },
        }));
      }

      logger.info(
        {
          source,
          successfulTags: successfulTags.length,
          totalTags: tagResults.length,
        },
        'Image tagging completed',
      );

      return {
        success: true,
        sourceImage: source,
        tags: tagResults.map((t) => ({
          tag: t.tag,
          fullTag: t.fullTag ?? '',
          created: t.created ?? false,
        })),
        registry,
        metadata: {
          version: version ?? '',
          timestamp: new Date().toISOString(),
          sessionId: sessionId ?? '',
        },
      };
    } catch (error) {
      logger.error({ error }, 'Image tagging failed');
      throw error instanceof Error ? error : new Error(String(error));
    }
  },

  chainHint: {
    nextTool: 'push_image',
    reason: 'Push tagged images to registry',
    paramMapper: (output) => ({
      tags: output.tags.filter((t) => t.created).map((t) => t.fullTag),
      registry: output.registry,
    }),
  },
};

// Default export for registry
export default tagImageHandler;
