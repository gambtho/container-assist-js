/**
 * Resolve Base Images - Main Orchestration Logic
 */

import {
  BaseImageRecommendation,
  BaseImageRecommendationSchema,
  BaseImageResolutionInput,
  BaseImageResolutionInputSchema,
} from '../../../domain/types/index';
import { executeWithRetry } from '../error-recovery';
import type { ToolDescriptor, ToolContext } from '../tool-types';
import { safeGetWorkflowState } from '../../../domain/types/workflow-state';
import {
  getSuggestedImagesForReference,
  validateBaseImageRecommendation,
  buildBaseImageAIRequest,
} from './helper';

/**
 * Main handler implementation
 */
const resolveBaseImagesHandler: ToolDescriptor<BaseImageResolutionInput, BaseImageRecommendation> =
  {
    name: 'resolve-base-images',
    description:
      'AI-powered Docker base image resolution with security and performance optimization',
    category: 'workflow',
    inputSchema: BaseImageResolutionInputSchema,
    outputSchema: BaseImageRecommendationSchema,

    handler: async (
      input: BaseImageResolutionInput,
      context: ToolContext,
    ): Promise<BaseImageRecommendation> => {
      return executeWithRetry(
        async (): Promise<BaseImageRecommendation> => {
          // Get repository analysis from session
          if (!context.sessionService) {
            throw new Error('Session service not available');
          }

          const session = context.sessionService.get(input.session_id);
          if (!session) {
            throw new Error('Session not found');
          }

          const workflowState = safeGetWorkflowState(session.workflow_state);
          if (!workflowState?.metadata?.analysis_result) {
            throw new Error('Repository must be analyzed first. Run analyze-repository tool.');
          }

          const analysis = workflowState.metadata.analysis_result as {
            language?: string;
            framework?: string;
          };

          // Prepare suggested images as reference (not hardcoded decision)
          const suggestedImages = getSuggestedImagesForReference(
            analysis.language ?? 'unknown',
            analysis.framework ?? 'unknown',
          );

          // Use AI for intelligent decision making
          if (!context.structuredSampler) {
            throw new Error('AI structured sampler not available');
          }

          // Build AI request using helper function
          const cleanedInput = {
            session_id: input.session_id,
            ...(input.target_environment !== undefined
              ? { target_environment: input.target_environment }
              : {}),
            ...(input.security_level !== undefined ? { security_level: input.security_level } : {}),
            ...(input.performance_priority !== undefined
              ? { performance_priority: input.performance_priority }
              : {}),
            ...(input.architectures !== undefined ? { architectures: input.architectures } : {}),
            ...(input.compliance_requirements !== undefined
              ? { compliance_requirements: input.compliance_requirements }
              : {}),
          };
          const aiRequest = buildBaseImageAIRequest(analysis, cleanedInput, suggestedImages);

          const recommendation = await context.structuredSampler.sampleJSON(
            JSON.stringify(aiRequest),
            { schema: BaseImageRecommendationSchema },
          );

          if (!recommendation.success) {
            throw new Error(`AI base image resolution failed: ${recommendation.error}`);
          }

          // Validate the AI's recommendation'
          const validationResult = validateBaseImageRecommendation(recommendation.data as any);
          if (!validationResult.isValid) {
            throw new Error(
              `AI recommendation validation failed: ${validationResult.issues.join(', ')}`,
            );
          }

          // Store recommendation in session for dockerfile generation
          try {
            context.sessionService.updateAtomic(input.session_id, (session: any) => ({
              ...session,
              workflow_state: {
                ...session.workflow_state,
                base_image_recommendation: recommendation.data,
              },
            }));
          } catch (error) {
            context.logger.warn(
              {
                sessionId: input.session_id,
                error,
              },
              'Failed to store base image recommendation in session',
            );
          }

          return recommendation.data as any;
        },
        { maxAttempts: 2 },
      );
    },
  };

export default resolveBaseImagesHandler;
