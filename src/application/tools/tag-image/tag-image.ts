/**
 * Tag Image - Main Orchestration Logic
 */

import { z } from 'zod';
import { ErrorCode, DomainError } from '../../../contracts/types/errors.js';
import type { MCPToolDescriptor, MCPToolContext } from '../tool-types.js';
import {
  getSourceImage,
  generateAllTags,
  applyTags,
  validateTagResults
} from './helper';

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
    customTags: z.array(z.string()).optional()
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
    customTags: data.custom_tags ?? (data.customTags || [])
  }));

// Output schema
const TagImageOutput = z.object({
  success: z.boolean(),
  sourceImage: z.string(),
  tags: z.array(
    z.object({
      tag: z.string(),
      fullTag: z.string(),
      created: z.boolean()
    })
  ),
  registry: z.string().optional(),
  metadata: z.object({
    version: z.string().optional(),
    timestamp: z.string(),
    sessionId: z.string().optional()
  })
});

// Type aliases
export type TagInput = z.infer<typeof TagImageInput>;
export type TagOutput = z.infer<typeof TagImageOutput>;


/**
 * Main handler implementation
 */
const tagImageHandler: MCPToolDescriptor<TagInput, TagOutput> = {
  name: 'tag_image',
  description: 'Tag Docker image with version and registry information',
  category: 'workflow',
  inputSchema: TagImageInput,
  outputSchema: TagImageOutput,

  handler: async (input: TagInput, context: MCPToolContext): Promise<TagOutput> => {
    const { logger, sessionService } = context;
    const { sessionId, sourceImage, targetTags, registry, version, latest, customTags } = input;

    logger.info(
      {
        sessionId,
        sourceImage,
        targetTags: targetTags.length,
        registry,
        version
      },
      'Starting image tagging'
    );

    try {
      // Get source image using helper function
      const { source, projectName } = await getSourceImage(sourceImage, sessionId, sessionService);

      // Generate all tags using helper function
      const allTags = generateAllTags(
        targetTags,
        customTags,
        projectName,
        version,
        registry,
        latest
      );

      logger.info(
        {
          source,
          tags: allTags
        },
        'Tagging image'
      );

      // Apply tags using helper function
      const tagResults = await applyTags(source, allTags, context);

      // Validate results using helper function
      const successfulTags = validateTagResults(tagResults);

      // Update session with tag information
      if (sessionId && sessionService) {
        await sessionService.updateAtomic(sessionId, (session: any) => ({
          ...session,
          workflow_state: {
            ...session.workflow_state,
            tag_result: {
              tags: tagResults
                .map((t) => t.fullTag)
                .filter((tag): tag is string => tag !== undefined),
              registry,
              success: true
            }
          }
        }));
      }

      logger.info(
        {
          source,
          successfulTags: successfulTags.length,
          totalTags: tagResults.length
        },
        'Image tagging completed'
      );

      return {
        success: true,
        sourceImage: source,
        tags: tagResults.map((t) => ({
          tag: t.tag,
          fullTag: t.fullTag ?? '',
          created: t.created ?? false
        })),
        registry,
        metadata: {
          version: version ?? '',
          timestamp: new Date().toISOString(),
          sessionId: sessionId ?? ''
        }
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
      registry: output.registry
    })
  }
};

// Default export for registry
export default tagImageHandler;
