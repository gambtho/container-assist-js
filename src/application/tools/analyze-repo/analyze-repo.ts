/**
 * Analyze Repository - Main Orchestration Logic
 */

import path from 'node:path';
import { ErrorCode, DomainError } from '../../../domain/types/errors';
import { buildAnalysisRequest } from '../../../infrastructure/ai/index';
import type { ToolDescriptor, ToolContext } from '../tool-types';
import type { Session } from '../../../domain/types/session';
import { AIServiceResponse, isAIServiceResponse } from '../../../domain/types/workflow-state';
import {
  AnalyzeRepositoryInput as AnalyzeRepositoryInputSchema,
  AnalysisResultSchema,
  AnalyzeRepositoryParams,
  AnalysisResult,
} from '../schemas';
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
    const contextServices = context;
    const logger = contextServices.logger;
    const sessionService = contextServices.sessionService;
    const progressEmitter = contextServices.progressEmitter;

    // Type definitions for context services
    type SessionService = {
      create: (params: { projectName: string; metadata: unknown }) => Promise<{ id: string }>;
      updateAtomic: (id: string, updater: (session: Session) => Session) => Promise<void>;
    };

    type ProgressEmitter = {
      emit: (progress: {
        sessionId: string;
        step: string;
        status: string;
        message: string;
        progress?: number;
      }) => Promise<void>;
    };

    type AIService = {
      generate: (request: unknown) => Promise<AIServiceResponse>;
    };
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
        try {
          const sessionResult = await (sessionService as unknown as SessionService).create({
            projectName: path.basename(repoPath),
            metadata: {
              repoPath,
              analysisDepth: depth,
              includeTests,
            },
          });
          sessionId = sessionResult.id;
        } catch (error) {
          logger.warn({ error }, 'Failed to create session for repo analysis');
          // Continue without session
        }
      }

      // Emit progress
      if (progressEmitter != null && sessionId != null && sessionId !== '') {
        await (progressEmitter as unknown as ProgressEmitter).emit({
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
        aiInsights?: string;
        aiTokenUsage?: {
          inputTokens: number;
          outputTokens: number;
          totalTokens: number;
        };
        suggestedOptimizations?: unknown;
        securityRecommendations?: unknown;
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
          const analysisVariables = {
            fileList: fileList.slice(0, 30).join('\n'),
            configFiles: JSON.stringify({
              hasDockerfile: dockerInfo.hasDockerfile,
              hasDockerCompose: dockerInfo.hasDockerCompose,
              hasKubernetes: dockerInfo.hasKubernetes,
            }),
            directoryTree: fileList.slice(0, 20).join('\n'),
          };

          const requestBuilder = buildAnalysisRequest(analysisVariables, {
            temperature: 0.3,
            maxTokens: 2000,
          });

          const aiResponse = await (context.aiService as AIService).generate(requestBuilder);

          if (isAIServiceResponse(aiResponse) && aiResponse.success && aiResponse.data != null) {
            try {
              let dataString: string;
              if (typeof aiResponse.data === 'string') {
                dataString = aiResponse.data;
              } else if (typeof aiResponse.data === 'object' && 'content' in aiResponse.data) {
                dataString = String((aiResponse.data as { content: unknown }).content);
              } else {
                dataString = String(aiResponse.data);
              }

              // Try to parse structured response
              const parsed = JSON.parse(dataString) as {
                insights?: string;
                optimizations?: string[];
                security?: string[];
                baseImage?: string;
                buildStrategy?: string;
              };

              aiEnhancements = {
                aiInsights: parsed.insights ?? dataString,
                suggestedOptimizations: parsed.optimizations ?? [],
                securityRecommendations: parsed.security ?? [],
                ...(parsed.baseImage && { recommendedBaseImage: parsed.baseImage }),
                ...(parsed.buildStrategy && { recommendedBuildStrategy: parsed.buildStrategy }),
              };
            } catch {
              // Fallback to raw content
              const contentStr =
                typeof aiResponse.data === 'string' ? aiResponse.data : String(aiResponse.data);
              aiEnhancements = {
                aiInsights: contentStr,
                fromCache: false,
                tokensUsed: 0,
              };
            }

            // Log AI analysis metadata
            logger.info(
              {
                hasData: aiResponse.success && aiResponse.data != null,
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
        await (progressEmitter as unknown as ProgressEmitter).emit({
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
        await (sessionService as unknown as SessionService).updateAtomic(
          sessionId,
          (currentSession: Session) => ({
            ...currentSession,
            workflow_state: {
              ...currentSession.workflow_state,
              analysis_result: {
                language: languageInfo.language,
                language_version: languageInfo?.version,
                framework: frameworkInfo?.framework,
                framework_version: frameworkInfo?.version,
                build_system: buildSystem
                  ? {
                      type: buildSystem.type,
                      build_file: buildSystem.build_file,
                      build_command: buildSystem.build_command,
                    }
                  : undefined,
                dependencies: dependencies.map((dep) => ({
                  name: dep.name,
                  version: dep.version,
                  type: dep.type,
                })),
                has_tests: dependencies.some((dep) => dep.type === 'test'),
                ports,
                env_variables: {}, // Add if available
                docker_compose_exists: dockerInfo.hasDockerCompose ?? false,
                recommendations: {
                  baseImage: recommendations.baseImage,
                  buildStrategy: recommendations.buildStrategy,
                  securityNotes: recommendations.securityNotes ?? [],
                },
              },
              completed_steps: [
                ...(currentSession.workflow_state?.completed_steps ?? []),
                'analyze_repository',
              ],
            },
          }),
        );
      }

      // Emit completion
      if (progressEmitter != null && sessionId != null && sessionId !== '') {
        await (progressEmitter as unknown as ProgressEmitter).emit({
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
