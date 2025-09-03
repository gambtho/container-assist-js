/**
 * AI-Powered Dockerfile Fixing Tool
 * Intelligently analyzes and fixes Dockerfile build errors with comprehensive solutions
 */

import { z } from 'zod';
import { DockerfileFix, DockerfileFixSchema } from '../../../contracts/types/index.js';
import { withRetry } from '../error-recovery.js';
import type { ToolDescriptor, ToolContext } from '../tool-types.js';

// Input schema with support for both snake_case and camelCase
const FixDockerfileInput = z
  .object({
    session_id: z.string().optional(),
    sessionId: z.string().optional(),
    error_message: z.string(),
    errorMessage: z.string().optional(),
    dockerfile_content: z.string().optional(),
    dockerfileContent: z.string().optional(),
    build_context: z.string().optional().default('standard build context'),
    buildContext: z.string().optional()
  })
  .transform((data) => ({
    sessionId:
      data.session_id ?? (data.sessionId != null && data.sessionId !== '' ? data.sessionId : ''),
    errorMessage:
      data.error_message ??
      (data.errorMessage != null && data.errorMessage !== '' ? data.errorMessage : ''),
    dockerfileContent: data.dockerfile_content ?? data.dockerfileContent,
    buildContext:
      data.build_context ??
      (data.buildContext != null && data.buildContext !== ''
        ? data.buildContext
        : 'standard build context')
  }));
type FixDockerfileInputType = z.infer<typeof FixDockerfileInput>;

// Output schema for the fixed Dockerfile
const FixDockerfileOutput = z.object({
  fixed_dockerfile: z.string(),
  root_cause_analysis: z.string(),
  changes_made: z.array(
    z.object({
      line_changed: z.string(),
      old_content: z.string(),
      new_content: z.string(),
      reasoning: z.string()
    })
  ),
  security_improvements: z.array(z.string()),
  performance_optimizations: z.array(z.string()),
  alternative_approaches: z.array(
    z.object({
      approach: z.string(),
      pros: z.array(z.string()),
      cons: z.array(z.string()),
      when_to_use: z.string()
    })
  ),
  testing_recommendations: z.array(z.string()),
  prevention_tips: z.array(z.string())
});
type FixDockerfileOutputType = z.infer<typeof FixDockerfileOutput>;

/**
 * AI-Powered Dockerfile Fixing Handler
 */
export const fixDockerfileHandler: ToolDescriptor<FixDockerfileInputType, FixDockerfileOutputType> =
  {
    name: 'fix-dockerfile',
    description:
      'AI-powered Dockerfile error analysis and intelligent fixing with comprehensive solutions',
    category: 'workflow',
    inputSchema: FixDockerfileInput,
    outputSchema: FixDockerfileOutput,
    chainHint: {
      nextTool: 'build-image',
      reason: 'After fixing the Dockerfile, rebuild the image to verify the fix works'
    },

    handler: async (
      input: FixDockerfileInputType,
      context: ToolContext
    ): Promise<FixDockerfileOutputType> => {
      if (context.sessionService == null) {
        throw new Error('Session service not available');
      }

      if (!context.structuredSampler) {
        throw new Error('AI structured sampler not available');
      }

      if (input.errorMessage.trim() === '') {
        throw new Error('Error message is required for Dockerfile fixing');
      }

      return await withRetry(
        async () => {
          // Get current dockerfile and analysis from session
          let dockerfileContent = input.dockerfileContent;
          let repositoryAnalysis: unknown;

          if (dockerfileContent == null && input.sessionId != null && input.sessionId !== '') {
            const session = await context.sessionService.get(input.sessionId);
            if (session == null) {
              throw new Error('Session not found. Please start a workflow first.');
            }

            dockerfileContent =
              dockerfileContent ?? session.workflow_state?.dockerfile_result?.content;
            repositoryAnalysis = session.workflow_state?.analysis_result;

            if (dockerfileContent == null || dockerfileContent === '') {
              throw new Error(
                'No Dockerfile found. Generate one first using generate-dockerfile tool.'
              );
            }
          }

          context.logger.info(
            {
              sessionId: input.sessionId,
              errorLength: input.errorMessage.length,
              dockerfileLines: dockerfileContent?.split('\n').length ?? 0
            },
            'Starting AI-powered Dockerfile error analysis'
          );

          // Use AI for intelligent error analysis and fixing
          const contextWithSampler = context as any;
          if (contextWithSampler?.structuredSampler == null) {
            throw new Error('Structured sampler not available');
          }
          const fix = await contextWithSampler.structuredSampler.sampleJSON(
            {
              templateId: 'dockerfile-fix',
              variables: {
                dockerfile_content: dockerfileContent ?? '',
                error_message: input.errorMessage,
                build_context: input.buildContext,
                language: (repositoryAnalysis as any)?.language ?? 'unknown',
                framework: (repositoryAnalysis as any)?.framework ?? 'unknown',
                dependencies: JSON.stringify((repositoryAnalysis as any)?.dependencies ?? []),
                build_system: (repositoryAnalysis as any)?.build_system?.type ?? 'unknown',
                entry_point: (repositoryAnalysis as any)?.entryPoint ?? 'unknown'
              }
            },
            DockerfileFixSchema
          );

          if (!fix?.success) {
            throw new Error(
              `AI Dockerfile fixing failed: ${fix?.error?.message ?? 'Unknown error'}`
            );
          }

          // Validate the AI's fix
          const validationResult = validateDockerfileFix(fix.data);
          if (validationResult.isValid !== true) {
            context.logger.warn(
              {
                issues: validationResult.issues
              },
              'AI fix has issues, but proceeding with warnings'
            );
          }

          // Validate content if validator is available
          if (context.contentValidator?.validateContent != null) {
            const validation = await context.contentValidator.validateContent(
              fix.data.fixed_dockerfile,
              {
                contentType: 'dockerfile',
                checkSecurity: true,
                checkBestPractices: true
              }
            );
            if (validation.valid !== true) {
              context.logger.warn(
                {
                  issues: validation.errors
                },
                'AI fix has security issues, but proceeding with warnings'
              );
            }
          }

          // Store fixed dockerfile in session
          if (input.sessionId != null && input.sessionId !== '' && context.sessionService != null) {
            try {
              await context.sessionService.updateAtomic(input.sessionId, (session: any) => ({
                ...session,
                workflowState: {
                  ...(session.workflowState || {}),
                  dockerfile_result: {
                    ...(session.workflowState?.dockerfile_result || {}),
                    content: fix.data.fixed_dockerfile
                  },
                  dockerfile_fix_history: [
                    ...(session.workflowState?.dockerfile_fix_history ?? []),
                    {
                      error: input.errorMessage,
                      fix: fix.data,
                      timestamp: new Date().toISOString()
                    }
                  ]
                }
              }));

              context.logger.info(
                {
                  sessionId: input.sessionId,
                  fixesApplied: fix.data.changes_made.length
                },
                'Dockerfile fix stored in session'
              );
            } catch (error) {
              context.logger.warn(
                {
                  sessionId: input.sessionId,
                  error
                },
                'Failed to store Dockerfile fix in session'
              );
            }
          }

          // Emit progress if available
          if (context.progressEmitter != null) {
            context.progressEmitter.emit({
              sessionId: input.sessionId,
              step: 'fix_dockerfile',
              status: 'completed' as const,
              message: `Fixed Dockerfile with ${fix.data.changes_made.length} changes`,
              progress: 1.0,
              timestamp: new Date().toISOString(),
              metadata: {
                changesCount: fix.data.changes_made.length,
                securityImprovements: fix.data.security_improvements.length,
                performanceOptimizations: fix.data.performance_optimizations.length
              }
            });
          }

          context.logger.info(
            {
              sessionId: input.sessionId,
              changesCount: fix.data.changes_made.length,
              hasSecurityImprovements: fix.data.security_improvements.length > 0,
              hasPerformanceOptimizations: fix.data.performance_optimizations.length > 0
            },
            'AI-powered Dockerfile fixing completed successfully'
          );

          return {
            fixed_dockerfile: fix.data.fixed_dockerfile,
            root_cause_analysis: fix.data.root_cause_analysis,
            changes_made: fix.data.changes_made,
            security_improvements: fix.data.security_improvements,
            performance_optimizations: fix.data.performance_optimizations,
            alternative_approaches: fix.data.alternative_approaches,
            testing_recommendations: fix.data.testing_recommendations,
            prevention_tips: fix.data.prevention_tips
          };
        },
        {
          maxAttempts: 2,
          delayMs: 1000
        }
      );
    }
  };

/**
 * Validate the AI's Dockerfile fix for basic quality checks
 */
function validateDockerfileFix(fix: DockerfileFix): ValidationResult {
  const issues: string[] = [];

  // Basic format validation
  if (fix.fixed_dockerfile?.trim() == null || fix.fixed_dockerfile.trim() === '') {
    issues.push('Fixed Dockerfile is empty');
  }

  if (fix.root_cause_analysis?.trim() == null || fix.root_cause_analysis.trim() === '') {
    issues.push('Missing root cause analysis');
  }

  if (fix.changes_made == null || fix.changes_made.length === 0) {
    issues.push('No changes were made to fix the Dockerfile');
  }

  // Check for security anti-patterns in the fixed dockerfile
  if (fix.fixed_dockerfile?.includes(':latest') === true) {
    issues.push('Fixed Dockerfile still contains :latest tag, which is discouraged for production');
  }

  // Validate that changes have proper reasoning
  for (const change of fix.changes_made ?? []) {
    if (change.reasoning?.trim() == null || change.reasoning.trim() === '') {
      issues.push(`Change "${change.new_content}" lacks reasoning`);
    }
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

interface ValidationResult {
  isValid: boolean;
  issues: string[];
}

// Default export for registry
export default fixDockerfileHandler;
