/**
 * Resolve Base Images - Main Orchestration Logic
 */

import {
  BaseImageRecommendation,
  BaseImageRecommendationSchema,
  BaseImageResolutionInput,
  BaseImageResolutionInputSchema,
} from '../../../contracts/types/index.js';
import { MCPToolDescriptor, MCPToolContext } from '../tool-types.js';
import { executeWithRetry } from '../error-recovery.js';
import {
  getSuggestedImagesForReference,
  validateBaseImageRecommendation,
  buildBaseImageAIRequest
} from './helper';

const resolveBaseImagesHandler: MCPToolDescriptor = {
  name: 'resolve-base-images',
  description: 'AI-powered Docker base image resolution with security and performance optimization',
  category: 'workflow',
  inputSchema: BaseImageResolutionInputSchema,
  outputSchema: BaseImageRecommendationSchema,

  handler: async (
    input: BaseImageResolutionInput,
    context: MCPToolContext
  ): Promise<BaseImageRecommendation> => {
    return executeWithRetry(
      async () => {
        // Get repository analysis from session
        if (!context.sessionService) {
          throw new Error('Session service not available');
        }

        const session = await context.sessionService.get(input.session_id);
        if (!session) {
          throw new Error('Session not found');
        }

        if (!session.workflow_state?.analysis_result) {
          throw new Error('Repository must be analyzed first. Run analyze-repository tool.');
        }

        const analysis = session.workflow_state.analysis_result;

        // Prepare suggested images as reference (not hardcoded decision)
        const suggestedImages = getSuggestedImagesForReference(
          analysis.language,
          analysis.framework
        );

        // Use AI for intelligent decision making
        if (!context.structuredSampler) {
          throw new Error('AI structured sampler not available');
        }

        // Build AI request using helper function
        const aiRequest = buildBaseImageAIRequest(analysis, input, suggestedImages);

        const recommendation = await context.structuredSampler.sampleJSON(
          JSON.stringify(aiRequest),
          { schema: BaseImageRecommendationSchema }
        );

        if (!recommendation.success) {
          throw new Error(`AI base image resolution failed: ${recommendation.error}`);
        }

        // Validate the AI's recommendation'
        const validationResult = await validateBaseImageRecommendation(recommendation.data);
        if (!validationResult.isValid) {
          throw new Error(
            `AI recommendation validation failed: ${validationResult.issues.join(', ')}`
          );
        }

        // Store recommendation in session for dockerfile generation
        try {
          await context.sessionService.updateAtomic(input.session_id, (session: any) => ({
            ...session,
            workflow_state: {
              ...session.workflow_state,
              base_image_recommendation: recommendation.data
            }
          }));
        } catch (error) {
          context.logger.warn(
            {
              sessionId: input.session_id,
              error
            },
            'Failed to store base image recommendation in session'
          );
        }

        return recommendation.data;
      },
      { maxAttempts: 2 }
    );
  }
};


export default resolveBaseImagesHandler;
