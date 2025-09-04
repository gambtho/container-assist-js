/**
 * Generate Dockerfile Ext - MCP SDK Compatible Version
 */

import { z } from 'zod';
import { executeWithRetry } from '../error-recovery.js';
import type { ToolDescriptor, ToolContext } from '../tool-types.js';

// Define Zod schema for repository analysis result
const RepositoryAnalysisSchema = z.object({
  language: z.string(),
  languageVersion: z.string().optional(),
  framework: z.string().optional(),
  frameworkVersion: z.string().optional(),
  buildSystem: z
    .object({
      type: z.string(),
      buildFile: z.string(),
      buildCommand: z.string().optional(),
      testCommand: z.string().optional(),
    })
    .optional(),
  dependencies: z.array(z.string()),
  devDependencies: z.array(z.string()).optional(),
  entryPoint: z.string().optional(),
  suggestedPorts: z.array(z.number()),
  dockerConfig: z
    .object({
      baseImage: z.string(),
      multistage: z.boolean(),
      nonRootUser: z.boolean(),
    })
    .optional(),
});

type RepositoryAnalysis = z.infer<typeof RepositoryAnalysisSchema>;

const EnhancedDockerfileInput = z.object({
  session_id: z.string(),
  repo_path: z.string().optional(),
  base_image: z.string().optional(),
  port: z.number().optional(),
  security_hardening: z.boolean().default(true),
  include_healthcheck: z.boolean().default(true),
  multistage: z.boolean().default(true),
});

/**
 * Enhanced Dockerfile generation using AI reliability features
 */
async function generateEnhancedDockerfile(
  analysis: RepositoryAnalysis,
  input: z.infer<typeof EnhancedDockerfileInput>,
  context: ToolContext,
): Promise<string> {
  const { structuredSampler, contentValidator, logger } = context;

  if (!structuredSampler) {
    throw new Error('Structured sampler not available - using basic template fallback');
  }

  return executeWithRetry(
    async () => {
      // Use AI request builder for cleaner construction
      // AIRequestBuilder not available - use direct structure
      const aiRequest = {
        purpose: 'dockerfile-generation',
        variables: {
          language: analysis.language,
          languageVersion: analysis.languageVersion ?? '',
          framework: analysis.framework ?? '',
          frameworkVersion: analysis.frameworkVersion ?? '',
          buildSystemType: analysis.buildSystem?.type ?? 'npm',
          entryPoint: analysis.entryPoint ?? 'index',
          port: String(input.port ?? (analysis.suggestedPorts[0] || 8080)),
          dependencies: analysis.dependencies.join(' '),
          devDependencies: (analysis.devDependencies ?? []).join(' '),
        },
        dockerContext: {
          baseImage: input.base_image ?? (analysis.dockerConfig?.baseImage || 'node:18-alpine'),
          multistage: input.multistage,
          securityHardening: input.security_hardening,
          includeHealthcheck: input.include_healthcheck,
        },
        sessionId: input.session_id,
      };

      const dockerfileResult = await structuredSampler.sampleStructured(JSON.stringify(aiRequest), {
        format: 'text',
      });

      if (!dockerfileResult.success) {
        throw new Error(dockerfileResult.error ?? 'Dockerfile generation failed');
      }

      // Validate security of generated Dockerfile if validator is available
      let validation: any = null;
      if (contentValidator && dockerfileResult.data) {
        validation = contentValidator.validateContent(dockerfileResult.data, {
          contentType: 'dockerfile',
          checkSecurity: true,
          checkBestPractices: true,
        });

        if (!validation.valid) {
          logger.warn(
            {
              issues: validation.errors,
              summary: validation.summary,
            },
            'Security validation failed for generated Dockerfile',
          );

          throw new Error(`Security validation failed: ${validation.summary}`);
        }

        // Log security warnings if any
        if (validation.issues && validation.issues.length > 0) {
          const highSeverityIssues = validation.issues.filter((i: any) => i.severity === 'high');
          const mediumSeverityIssues = validation.issues.filter(
            (i: any) => i.severity === 'medium',
          );

          if (highSeverityIssues.length === 0) {
            // Only log warnings if no high-severity issues
            logger.warn(
              {
                issues: mediumSeverityIssues,
                summary: validation.summary,
              },
              'Security warnings in generated Dockerfile',
            );
          }
        }
      }

      logger.info(
        {
          language: analysis.language,
          framework: analysis.framework,
          securityIssues: validation.issues?.length ?? 0,
          validationPassed: validation.isValid,
        },
        'Enhanced Dockerfile generated successfully',
      );

      if (!dockerfileResult.data) {
        throw new Error('Generated Dockerfile content is empty');
      }

      return dockerfileResult.data;
    },
    { maxAttempts: 3, delayMs: 1000 },
  );
}

/**
 * Enhanced repository analysis using structured sampling
 */
async function analyzeRepositoryStructured(
  repoPath: string,
  context: ToolContext,
): Promise<RepositoryAnalysis> {
  const { structuredSampler, logger } = context;

  if (!structuredSampler) {
    throw new Error('Structured sampler not available');
  }

  return executeWithRetry(
    async () => {
      // Get repository information (simplified for example)
      const fileList = getFileList(repoPath);
      const configFiles = readConfigFiles(repoPath);
      const directoryTree = getDirectoryStructure(repoPath);

      // Use AI request builder for repository analysis
      // AIRequestBuilder not available - use direct structure
      const aiRequest = {
        purpose: 'repository-analysis',
        format: 'json',
        variables: {
          fileList: fileList.slice(0, 500).join('\n'),
          configFiles: JSON.stringify(configFiles),
          directoryTree,
        },
      };

      const analysisResult = await structuredSampler.sampleJSON(JSON.stringify(aiRequest), {
        schema: RepositoryAnalysisSchema,
      });

      if (!analysisResult.success) {
        throw new Error(analysisResult.error ?? 'Repository analysis failed');
      }

      logger.info(
        {
          language: analysisResult.data?.language,
          framework: analysisResult.data?.framework,
          repoPath,
        },
        'Repository analysis completed with structured sampling',
      );

      return analysisResult.data;
    },
    { maxAttempts: 2, delayMs: 500 },
  );
}

// Helper functions (simplified implementations)
function getFileList(_repoPath: string): string[] {
  // Implementation would scan files and return paths
  return ['package.json', 'src/index.js', 'src/app.js'];
}

function readConfigFiles(_repoPath: string): Record<string, string> {
  // Implementation would read common config files
  return {
    'package.json': '{"name": "example", "dependencies": {"express": "^4.18.0"}}',
  };
}

function getDirectoryStructure(_repoPath: string): string {
  // Implementation would return tree structure
  return `
package.json
src/
  - index.js  
  - app.js
README.md
`.trim();
}

/**
 * Example enhanced tool handler
 */
export const enhancedGenerateDockerfileHandler: ToolDescriptor = {
  name: 'enhanced-generate-dockerfile',
  description: 'Generate Dockerfile with AI reliability features and security validation',
  category: 'workflow' as const,

  inputSchema: EnhancedDockerfileInput,

  outputSchema: z.object({
    success: z.boolean(),
    dockerfile: z.string(),
    securitySummary: z.string(),
    metadata: z.object({
      language: z.string(),
      framework: z.string().optional(),
      validationPassed: z.boolean(),
      securityIssues: z.number(),
    }),
  }),

  handler: async (input: unknown, context: unknown) => {
    const ctx = context as ToolContext;
    const { sessionService, logger } = ctx;

    try {
      const validatedInput = EnhancedDockerfileInput.parse(input);
      const repoPath = validatedInput.repo_path ?? process.cwd();

      // Step 1: Analyze repository with structured sampling
      const analysisResult = await analyzeRepositoryStructured(repoPath, ctx);

      // Step 2: Generate Dockerfile with validation
      const dockerfileResult = await generateEnhancedDockerfile(
        analysisResult,
        validatedInput,
        ctx,
      );

      // Step 3: Final validation check
      const finalValidation = ctx.contentValidator
        ? ctx.contentValidator.validateContent(dockerfileResult, {
          contentType: 'dockerfile',
          checkSecurity: true,
          checkBestPractices: true,
        })
        : null;

      // Update session state
      await sessionService.updateAtomic(validatedInput.session_id, (session: any) => ({
        ...session,
        workflow_state: {
          ...(session.workflow_state || {}),
          dockerfileContent: dockerfileResult,
          analysisResult,
          validationResult: finalValidation,
        },
      }));

      return {
        success: true,
        dockerfile: dockerfileResult,
        securitySummary: ctx.contentValidator
          ? ctx.contentValidator.validateContent(dockerfileResult, {
            contentType: 'dockerfile',
            checkSecurity: true,
          })
          : null,
        metadata: {
          language: analysisResult.language,
          framework: analysisResult.framework,
          validationPassed: finalValidation?.valid ?? false,
          securityIssues: finalValidation?.errors?.length ?? 0,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Error occurred'); // Fixed logger call
      throw new Error(`Enhanced Dockerfile generation failed: ${(error as Error).message}`);
    }
  },
};

// Default export for registry
export default enhancedGenerateDockerfileHandler;
