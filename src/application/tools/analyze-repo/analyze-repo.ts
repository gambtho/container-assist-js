/**
 * Analyze Repository - Main Orchestration Logic
 */

import path from 'node:path';
import { ErrorCode, DomainError } from '../../../contracts/types/errors.js';
import { AIRequestBuilder } from '../../../infrastructure/ai-request-builder.js';
import type { ToolDescriptor, ToolContext } from '../tool-types.js';
import type { Session } from '../../../contracts/types/session.js';
import {
  AnalyzeRepositoryInput as AnalyzeRepositoryInputSchema,
  AnalysisResultSchema,
  AnalyzeRepositoryParams,
  AnalysisResult,
} from '../schemas.js';
import {
  validateRepositoryPath,
  detectLanguage,
  detectFramework,
  detectBuildSystem,
  analyzeDependencies,
  detectPorts,
  checkDockerFiles,
  getRecommendedBaseImage,
  getSecurityRecommendations,
  gatherFileStructure,
} from './helper';

// Use consolidated schemas
const AnalyzeRepositoryInput = AnalyzeRepositoryInputSchema;
const AnalyzeRepositoryOutput = AnalysisResultSchema;

// Type aliases
export type AnalyzeInput = AnalyzeRepositoryParams;
export type AnalyzeOutput = AnalysisResult;

/**
 * Main handler implementation
 */
const analyzeRepositoryHandler: ToolDescriptor<AnalyzeInput, AnalyzeOutput> = {
  name: 'analyze_repository',
  description: 'Analyze repository structure and detect language, framework, and build system',
  category: 'workflow',
  inputSchema: AnalyzeRepositoryInput,
  outputSchema: AnalyzeRepositoryOutput,

  handler: async (input: AnalyzeInput, context: ToolContext): Promise<AnalyzeOutput> => {
    const { logger, sessionService, progressEmitter } = context;
    const { repoPath, sessionId: inputSessionId, depth, includeTests } = input;

    logger.info(
      {
        repoPath,
        depth,
        includeTests,
      },
      'Starting repository analysis',
    );

    try {
      // Validate repository path
      const validation = await validateRepositoryPath(repoPath);
      if (!validation.valid) {
        throw new DomainError(
          ErrorCode.InvalidInput,
          validation.error != null && validation.error !== ''
            ? validation.error
            : 'Invalid repository path',
        );
      }

      // Create or get session
      let sessionId = inputSessionId;
      if ((sessionId == null || sessionId === '') && sessionService != null) {
        const session = await sessionService.create({
          projectName: path.basename(repoPath),
          metadata: {
            repoPath,
            analysisDepth: depth,
            includeTests,
          },
        });
        sessionId = session.id;
      }

      // Emit progress
      if (progressEmitter != null && sessionId != null && sessionId !== '') {
        await progressEmitter.emit({
          sessionId,
          step: 'analyze_repository',
          status: 'in_progress',
          message: 'Analyzing repository structure',
          progress: 0.1,
        });
      }

      // Perform basic analysis
      const languageInfo = await detectLanguage(repoPath);
      const frameworkInfo = await detectFramework(repoPath, languageInfo.language);
      const buildSystemRaw = await detectBuildSystem(repoPath);
      const dependencies = await analyzeDependencies(repoPath, languageInfo.language);
      const ports = await detectPorts(repoPath, languageInfo.language);
      const dockerInfo = await checkDockerFiles(repoPath);

      // Enhanced AI analysis if available
      interface AIEnhancements {
        aiInsights?: string | any;
        aiTokenUsage?: {
          inputTokens: number;
          outputTokens: number;
          totalTokens: number;
        };
        suggestedOptimizations?: any;
        securityRecommendations?: any;
        recommendedBaseImage?: string;
        recommendedBuildStrategy?: string;
        fromCache?: boolean;
        tokensUsed?: number;
      }
      let aiEnhancements: AIEnhancements = {};
      try {
        if (context.aiService != null) {
          // Gather file structure for AI context
          const fileList = await gatherFileStructure(repoPath, depth === 'deep' ? 3 : 1);

          // Build AI request for repository analysis
          const requestBuilder = new AIRequestBuilder()
            .template('repository-analysis')
            .withModel('claude-3-haiku-20240307')
            .withSampling(0.3, 2000)
            .withVariables({
              fileList: fileList.slice(0, 30).join('\n'),
              configFiles: JSON.stringify({
                hasDockerfile: dockerInfo.hasDockerfile,
                hasDockerCompose: dockerInfo.hasDockerCompose,
                hasKubernetes: dockerInfo.hasKubernetes,
              }),
              directoryTree: fileList.slice(0, 20).join('\n'),
              language: languageInfo.language,
              framework: frameworkInfo?.framework ?? 'none',
              dependencies: dependencies
                .map((d) => d.name)
                .slice(0, 20)
                .join(', '),
              buildSystem: buildSystemRaw?.type ?? 'none',
            });

          const result = await (context.aiService).generate(requestBuilder);

          if (result?.data != null) {
            try {
              // Try to parse structured response
              const parsed = JSON.parse(result.data);
              aiEnhancements = {
                aiInsights: parsed.insights ?? result.data,
                suggestedOptimizations: parsed.optimizations ?? [],
                securityRecommendations: parsed.security ?? [],
                recommendedBaseImage: parsed.baseImage,
                recommendedBuildStrategy: parsed.buildStrategy,
              };
            } catch {
              // Fallback to raw content
              aiEnhancements = {
                aiInsights: result.data,
                fromCache: result.metadata?.fromCache,
                tokensUsed: result.metadata?.tokensUsed,
              };
            }

            // Log AI analysis metadata
            logger.info(
              {
                model: result.metadata?.model,
                tokensUsed: result.metadata?.tokensUsed,
                fromCache: result.metadata?.fromCache,
                durationMs: result.metadata?.durationMs,
              },
              'AI-enhanced repository analysis completed',
            );
          }
        } else {
          logger.debug('AI service not available, using basic analysis');
        }
      } catch (error) {
        logger.warn({ error }, 'AI enhancement failed, continuing with basic analysis');
      }

      // Transform buildSystem to match schema structure
      const buildSystem = buildSystemRaw
        ? {
          type: buildSystemRaw.type,
          build_file: buildSystemRaw.file,
          build_command: buildSystemRaw.buildCmd,
          test_command: buildSystemRaw.testCmd,
        }
        : undefined;

      // Emit progress
      if (progressEmitter != null && sessionId != null && sessionId !== '') {
        await progressEmitter.emit({
          sessionId,
          step: 'analyze_repository',
          status: 'in_progress',
          message: 'Finalizing analysis',
          progress: 0.8,
        });
      }

      // Build enhanced recommendations
      const baseRecommendations = {
        baseImage: getRecommendedBaseImage(languageInfo.language, frameworkInfo?.framework),
        buildStrategy: buildSystem != null ? 'multi-stage' : 'single-stage',
        securityNotes: getSecurityRecommendations(dependencies),
      };

      // Merge with AI enhancements
      const recommendations = {
        ...baseRecommendations,
        ...(aiEnhancements.suggestedOptimizations != null && {
          aiOptimizations: aiEnhancements.suggestedOptimizations,
        }),
        ...(aiEnhancements.securityRecommendations != null && {
          aiSecurity: aiEnhancements.securityRecommendations,
        }),
      };

      // Store analysis in session
      if (sessionService != null && sessionId != null && sessionId !== '') {
        await sessionService.updateAtomic(sessionId, (session: Session) => ({
          ...session,
          workflow_state: {
            ...session.workflow_state,
            analysis_result: {
              language: languageInfo.language,
              framework: frameworkInfo?.framework,
              build_system: buildSystem,
              dependencies,
              ports,
              has_tests: dependencies.some((dep) => dep.type === 'test'),
              docker_compose_exists: dockerInfo.hasDockerCompose ?? false,
              ...dockerInfo,
              recommendations,
            },
          },
        }));
      }

      // Emit completion
      if (progressEmitter != null && sessionId != null && sessionId !== '') {
        await progressEmitter.emit({
          sessionId,
          step: 'analyze_repository',
          status: 'completed',
          message: 'Repository analysis complete',
          progress: 1.0,
        });
      }

      // Construct response carefully to handle exactOptionalPropertyTypes
      const response: AnalyzeOutput = {
        success: true,
        sessionId: sessionId ?? 'temp-session',
        language: languageInfo.language,
        dependencies,
        ports,
        ...dockerInfo,
      };

      // Only add optional properties if they have defined values
      if (languageInfo.version !== undefined) {
        response.languageVersion = languageInfo.version;
      }

      if (frameworkInfo?.framework !== undefined) {
        response.framework = frameworkInfo.framework;
      }

      if (frameworkInfo?.version !== undefined) {
        response.frameworkVersion = frameworkInfo.version;
      }

      if (buildSystem !== undefined) {
        response.buildSystem = {
          type: buildSystem.type,
          buildFile: buildSystem.build_file,
          buildCommand: buildSystem.build_command,
          testCommand: buildSystem.test_command,
        };
      }

      if (recommendations !== undefined) {
        response.recommendations = recommendations;
      }

      // Add metadata with AI enhancements
      response.metadata = {
        repoPath,
        depth,
        includeTests,
        timestamp: new Date().toISOString(),
        ...(aiEnhancements.aiInsights != null && { aiInsights: aiEnhancements.aiInsights }),
        ...(aiEnhancements.aiTokenUsage != null && { aiTokenUsage: aiEnhancements.aiTokenUsage }),
      };

      return response;
    } catch (error) {
      logger.error({ error }, 'Error occurred'); // Fixed logger call
      throw error instanceof Error ? error : new Error(String(error));
    }
  },

  chainHint: {
    nextTool: 'generate_dockerfile',
    reason: 'Generate Dockerfile based on repository analysis',
    paramMapper: (output) => ({
      session_id: output.sessionId,
      language: output.language,
      framework: output.framework,
      base_image: output.recommendations?.baseImage,
    }),
  },
};

// Default export for registry
export default analyzeRepositoryHandler;
