import type { Logger } from 'pino';
import type { Result } from '../../../types/core/index.js';
import { Success } from '../../../types/core/index.js';
import type { EnhancedTool } from './intelligent-tool-wrapper.js';
import { createEnhancedTool } from './tool-enhancers.js';
import { analyzeRepoTool } from '../../../tools/analyze-repo.js';
import { generateDockerfileTool } from '../../../tools/generate-dockerfile.js';
import { buildImageTool } from '../../../tools/build-image.js';
import { scanImageTool } from '../../../tools/scan.js';
import { pushImageTool } from '../../../tools/push.js';
import { tagImageTool } from '../../../tools/tag.js';
import { workflowTool } from '../../../tools/workflow.js';
import { fixDockerfileTool } from '../../../tools/fix-dockerfile.js';
import { resolveBaseImagesTool } from '../../../tools/resolve-base-images.js';
import { prepareClusterTool } from '../../../tools/prepare-cluster.js';
import { opsTool } from '../../../tools/ops.js';
import { deployApplicationTool } from '../../../tools/deploy.js';
import { generateK8sManifestsTool } from '../../../tools/generate-k8s-manifests.js';
import { verifyDeploymentTool } from '../../../tools/verify-deployment.js';

// Tool registry with direct enhancement
export type ToolRegistry = Map<string, EnhancedTool>;

/**
 * Create a tool registry with optional AI enhancement
 */
export function createToolRegistry(
  tools: EnhancedTool[],
  enhancers?: Array<(tool: EnhancedTool) => EnhancedTool>,
): ToolRegistry {
  const registry = new Map<string, EnhancedTool>();

  tools.forEach((tool) => {
    let enhancedTool = tool;
    enhancers?.forEach((enhancer) => {
      enhancedTool = enhancer(enhancedTool);
    });
    registry.set(tool.name, enhancedTool);
  });

  return registry;
}

/**
 * Get tool from registry
 */
export function getTool(registry: ToolRegistry, name: string): EnhancedTool | undefined {
  return registry.get(name);
}

/**
 * Get all tools from registry
 */
export function getAllTools(registry: ToolRegistry): EnhancedTool[] {
  return Array.from(registry.values());
}

/**
 * Tool enhancer function that adds AI capabilities
 */
export function withAIEnhancement(aiService: any, sessionManager: any, logger: Logger) {
  return (tool: EnhancedTool): EnhancedTool => {
    return createEnhancedTool(tool, {
      aiService,
      sessionManager,
      logger,
      enableProgress: true,
      enableCancellation: true,
    });
  };
}

/**
 * Create analyze repo tool with AI enhancement
 */
export function createAnalyzeRepoWithAI(
  aiService: any,
  _sessionManager: any,
  _logger: Logger,
): EnhancedTool {
  const baseTool = analyzeRepoTool;

  return {
    ...baseTool,
    name: 'analyze-repo',
    description: 'Analyze repository structure with AI insights',
    async execute(params: any, logger: Logger): Promise<Result<any>> {
      // Enhanced repository analysis with AI insights
      const baseResult = await baseTool.execute(params, logger);

      if (baseResult.ok && params.sessionId && aiService) {
        // Add AI-powered recommendations
        const aiContext = await aiService.generateWithContext({
          prompt: 'Analyze repository analysis results for containerization recommendations',
          sessionId: params.sessionId,
          context: baseResult.value,
        });

        if (aiContext.ok) {
          return Success({
            ...baseResult.value,
            aiRecommendations: {
              guidance: aiContext.value.context.guidance,
              template: aiContext.value.context.template,
              insights: [
                'Consider multi-stage builds for optimal image size',
                'Use specific base image versions for reproducibility',
                'Implement health checks for container orchestration',
              ],
            },
            metadata: {
              ...baseResult.value.metadata,
              aiEnhanced: true,
            },
          });
        }
      }

      return baseResult;
    },
  } as EnhancedTool;
}

/**
 * Create Dockerfile generator with AI enhancement
 */
export function createDockerfileGeneratorWithAI(
  _aiService: any,
  sessionManager: any,
  _logger: Logger,
): EnhancedTool {
  const baseTool = generateDockerfileTool;

  return {
    ...baseTool,
    name: 'generate-dockerfile',
    description: 'Generate Dockerfile with AI context',
    async execute(params: any, logger: Logger): Promise<Result<any>> {
      // Get repository analysis from session
      const sessionState =
        params.sessionId && sessionManager
          ? await sessionManager.getState(params.sessionId)
          : undefined;
      const repoAnalysis = sessionState?.analysis_result;

      // Enhance parameters with repository context
      const enhancedParams = {
        ...params,
        ...(repoAnalysis && {
          language: params.language || repoAnalysis.language,
          framework: params.framework || repoAnalysis.framework,
          baseImage: params.baseImage || repoAnalysis.recommendations?.baseImage,
          dependencies: params.dependencies || repoAnalysis.dependencies,
        }),
      };

      logger.info(
        {
          original: params,
          enhanced: enhancedParams,
        },
        'Enhanced Dockerfile generation parameters',
      );

      // Generate dockerfile with enhanced context
      const result = await baseTool.execute(enhancedParams, logger);

      if (result.ok) {
        // Add context-aware insights
        const contextUsed = {
          repositoryAnalysis: !!repoAnalysis,
          inferredParameters: Object.keys(enhancedParams).filter((k) => !params[k]),
          aiGuidance: !!sessionState?.ai_context,
        };

        return Success({
          ...result.value,
          contextUsed,
          insights: [
            repoAnalysis
              ? `Optimized for ${repoAnalysis.language} ${repoAnalysis.framework || ''}`
              : null,
            'Security best practices applied',
            'Multi-stage build for size optimization',
          ].filter(Boolean),
          metadata: {
            ...(result.value as any).metadata,
            sessionAware: !!params.sessionId,
            contextEnhanced: true,
          },
        });
      }

      return result;
    },
  } as EnhancedTool;
}

/**
 * Create scanner with AI vulnerability analysis
 */
export function createScannerWithAI(
  _aiService: any,
  _sessionManager: any,
  _logger: Logger,
): EnhancedTool {
  const baseTool = scanImageTool;

  return {
    ...baseTool,
    name: 'scan',
    description: 'Scan image with AI vulnerability analysis',
    async execute(params: any, logger: Logger): Promise<Result<any>> {
      const result = await baseTool.execute(params, logger);

      if (result.ok) {
        const vulnerabilities = (result.value as any).vulnerabilitiesDetails || [];
        if (vulnerabilities.length > 0) {
          // Prioritize and add remediation suggestions
          const critical = vulnerabilities.filter((v: any) => v.severity === 'CRITICAL');
          const high = vulnerabilities.filter((v: any) => v.severity === 'HIGH');

          const remediation = {
            immediate: critical.map((v: any) => ({
              vulnerability: v.id,
              action: v.fixedVersion ? `Update to ${v.fixedVersion}` : 'No fix available',
              priority: 'CRITICAL',
            })),
            recommended: high.map((v: any) => ({
              vulnerability: v.id,
              action: v.fixedVersion
                ? `Update to ${v.fixedVersion}`
                : 'Consider alternative package',
              priority: 'HIGH',
            })),
          };

          return Success({
            ...result.value,
            analysis: {
              criticalCount: critical.length,
              highCount: high.length,
              totalCount: vulnerabilities.length,
              remediation,
            },
            recommendations: [
              critical.length > 0 ? 'Fix critical vulnerabilities before deployment' : null,
              'Update base image to latest secure version',
              'Consider using distroless or minimal base images',
            ].filter(Boolean),
            metadata: {
              ...(result.value as any).metadata,
              aiAnalyzed: true,
            },
          });
        }
      }

      return result;
    },
  } as EnhancedTool;
}

/**
 * Create workflow executor with AI optimization
 */
export function createWorkflowExecutorWithAI(
  aiService: any,
  _sessionManager: any,
  _logger: Logger,
): EnhancedTool {
  const baseTool = workflowTool;

  return {
    ...baseTool,
    name: 'workflow',
    description: 'Execute workflow with AI optimization',
    async execute(params: any, logger: Logger): Promise<Result<any>> {
      // Pre-validate workflow parameters
      if (params.sessionId && aiService) {
        const validation = await aiService.validateParameters('workflow', params, {
          sessionId: params.sessionId,
        });

        if (validation.ok && validation.value.suggestions?.length > 0) {
          logger.info(
            { suggestions: validation.value.suggestions },
            'Workflow optimization suggestions',
          );
        }
      }

      // Execute workflow with enhanced monitoring
      const result = await baseTool.execute(params, logger);

      if (result.ok) {
        // Add workflow insights
        return Success({
          ...result.value,
          insights: {
            stepsCompleted: result.value.completedSteps?.length || 0,
            optimizationApplied: true,
            sessionTracked: !!params.sessionId,
          },
          nextSteps: [
            'Review generated artifacts',
            'Test container functionality',
            'Deploy to staging environment',
          ],
          metadata: {
            ...result.value.metadata,
            intelligentExecution: true,
          },
        });
      }

      return result;
    },
  } as EnhancedTool;
}

/**
 * Create all base tools
 */
export function createBaseTools(): EnhancedTool[] {
  return [
    {
      ...analyzeRepoTool,
      name: 'analyze-repo',
      description: 'Analyze repository structure',
    } as EnhancedTool,
    {
      ...generateDockerfileTool,
      name: 'generate-dockerfile',
      description: 'Generate Dockerfile',
    } as EnhancedTool,
    { ...buildImageTool, name: 'build-image', description: 'Build Docker image' } as EnhancedTool,
    {
      ...scanImageTool,
      name: 'scan',
      description: 'Scan image for vulnerabilities',
    } as EnhancedTool,
    { ...pushImageTool, name: 'push', description: 'Push image to registry' } as EnhancedTool,
    { ...tagImageTool, name: 'tag', description: 'Tag Docker image' } as EnhancedTool,
    { ...workflowTool, name: 'workflow', description: 'Execute workflow' } as EnhancedTool,
    {
      ...fixDockerfileTool,
      name: 'fix-dockerfile',
      description: 'Fix Dockerfile issues',
    } as EnhancedTool,
    {
      ...resolveBaseImagesTool,
      name: 'resolve-base-images',
      description: 'Resolve base images',
    } as EnhancedTool,
    {
      ...prepareClusterTool,
      name: 'prepare-cluster',
      description: 'Prepare cluster',
    } as EnhancedTool,
    { ...opsTool, name: 'ops', description: 'Ops operations' } as EnhancedTool,
    { ...deployApplicationTool, name: 'deploy', description: 'Deploy application' } as EnhancedTool,
    {
      ...generateK8sManifestsTool,
      name: 'generate-k8s-manifests',
      description: 'Generate K8s manifests',
    } as EnhancedTool,
    {
      ...verifyDeploymentTool,
      name: 'verify-deployment',
      description: 'Verify deployment',
    } as EnhancedTool,
  ];
}

/**
 * Create specialized AI-enhanced tools
 */
export function createAIEnhancedTools(
  aiService: any,
  sessionManager: any,
  logger: Logger,
): Map<string, EnhancedTool> {
  const specializedTools = new Map<string, EnhancedTool>();

  specializedTools.set('analyze-repo', createAnalyzeRepoWithAI(aiService, sessionManager, logger));
  specializedTools.set(
    'generate-dockerfile',
    createDockerfileGeneratorWithAI(aiService, sessionManager, logger),
  );
  specializedTools.set('scan', createScannerWithAI(aiService, sessionManager, logger));
  specializedTools.set('workflow', createWorkflowExecutorWithAI(aiService, sessionManager, logger));

  return specializedTools;
}

/**
 * Create complete tool registry with AI enhancement
 */
export function createEnhancedToolRegistry(
  aiService?: any,
  sessionManager?: any,
  logger?: Logger,
): {
  registry: ToolRegistry;
  getTool: (name: string) => EnhancedTool | undefined;
  getAllTools: () => EnhancedTool[];
  getStats: () => Record<string, any>;
} {
  const baseTools = createBaseTools();
  const registry = new Map<string, EnhancedTool>();

  // If AI services are provided, create specialized tools
  if (aiService && sessionManager && logger) {
    const specializedTools = createAIEnhancedTools(aiService, sessionManager, logger);

    // Add base tools with AI enhancement for non-specialized ones
    const enhancer = withAIEnhancement(aiService, sessionManager, logger);
    baseTools.forEach((tool) => {
      const specialized = specializedTools.get(tool.name);
      registry.set(tool.name, specialized || enhancer(tool));
    });
  } else {
    // Just add base tools without enhancement
    baseTools.forEach((tool) => {
      registry.set(tool.name, tool);
    });
  }

  return {
    registry,
    getTool: (name: string) => registry.get(name),
    getAllTools: () => Array.from(registry.values()),
    getStats: () => ({
      totalTools: registry.size,
      enhancedTools: aiService ? registry.size : 0,
      specializedTools: aiService ? 4 : 0,
      aiEnabled: !!aiService,
      sessionManagementEnabled: !!sessionManager,
    }),
  };
}
