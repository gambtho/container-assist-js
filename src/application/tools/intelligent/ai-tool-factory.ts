/**
 * Simple Tool Registry - Functional approach replacing factory patterns
 */

import type { Logger } from 'pino';
import type { Tool } from '../../../types/tools.js';
import { AIEnhancementService } from '../../ai/enhancement-service.js';
import type { MCPHostAI } from '../../../lib/mcp-host-ai.js';
import type { SDKPromptRegistry } from '../../../mcp/prompts/sdk-prompt-registry.js';
import { createProductionTool } from './tool-capabilities.js';

// Import base tools
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

// Import sampling tools
import {
  dockerfileSampling,
  dockerfileCompare,
  dockerfileValidate,
  dockerfileBest,
  samplingStrategies,
} from '../../../tools/sampling-tools.js';

// Import analysis sampling tools
import { analysisSamplingTools } from '../../../tools/analysis-sampling-tools.js';

// Import analysis perspectives tools
import { analysisPerspectivesTools } from '../../../tools/analysis-perspectives-tools.js';

/**
 * Simple tool registry using Map
 */
export type ToolRegistry = Map<string, Tool>;

/**
 * Create enhanced tools using standardized enhancement pipeline
 */
export const createToolRegistry = (
  logger: Logger,
  config: {
    enableAI?: boolean;
    enableMetrics?: boolean;
    aiEnhancementService?: AIEnhancementService;
    metricsCollector?: any;
    sessionManager?: any;
  } = {},
): ToolRegistry => {
  const baseTools = [
    analyzeRepoTool,
    generateDockerfileTool,
    buildImageTool,
    scanImageTool,
    pushImageTool,
    tagImageTool,
    workflowTool,
    fixDockerfileTool,
    resolveBaseImagesTool,
    prepareClusterTool,
    opsTool,
    deployApplicationTool,
    generateK8sManifestsTool,
    verifyDeploymentTool,
    // Sampling tools
    dockerfileSampling,
    dockerfileCompare,
    dockerfileValidate,
    dockerfileBest,
    samplingStrategies,
  ];

  // Convert analysis sampling tools to expected format
  const analysisTools = Object.entries(analysisSamplingTools).map(([name, tool]) => ({
    name,
    execute: tool.execute,
  }));

  // Convert analysis perspectives tools to expected format
  const perspectivesTools = Object.entries(analysisPerspectivesTools).map(([name, tool]) => ({
    name,
    execute: tool.execute,
  }));

  // Combine all tools
  const allTools = [...baseTools, ...analysisTools, ...perspectivesTools];

  const registry = new Map<string, Tool>();

  allTools.forEach((rawTool) => {
    // Create wrapper that matches Tool interface
    const baseTool: any = {
      name: rawTool.name,
      description: (rawTool as any).description || `${rawTool.name} tool`,
      execute: async (params: Record<string, unknown>, logger: Logger) => {
        return await rawTool.execute(params as any, logger);
      },
    };

    // Use standardized production tool enhancement
    const enhancementConfig: Parameters<typeof createProductionTool>[1] = {
      logger,
      retry: { attempts: 3, delay: 1000, backoff: true },
    };

    if (config.aiEnhancementService !== undefined) {
      enhancementConfig.aiEnhancementService = config.aiEnhancementService;
    }
    if (config.metricsCollector !== undefined) {
      enhancementConfig.metricsCollector = config.metricsCollector;
    }
    if (config.sessionManager !== undefined) {
      enhancementConfig.sessionManager = config.sessionManager;
    }

    const enhancedTool = createProductionTool(baseTool, enhancementConfig);

    registry.set(baseTool.name, enhancedTool);
  });

  return registry;
};

/**
 * Get tool from registry
 */
export const getTool = (registry: ToolRegistry, name: string): Tool | undefined => {
  return registry.get(name);
};

/**
 * Get all tools from registry
 */
export const getAllTools = (registry: ToolRegistry): Tool[] => {
  return Array.from(registry.values());
};

/**
 * AI enhancement functions using centralized AI Enhancement Service
 */
export const withAI =
  (aiEnhancementService: AIEnhancementService) =>
  <T extends Tool>(tool: T): T => ({
    ...tool,
    async execute(
      params: any,
      logger: Logger,
      context?: import('../../../mcp/types.js').MCPContext,
    ) {
      const result = await tool.execute(params, logger, context);

      // Add AI insights if available and requested
      if (
        result &&
        typeof result === 'object' &&
        'ok' in result &&
        result.ok &&
        params.enableAI !== false &&
        aiEnhancementService.isAvailable()
      ) {
        try {
          const enhancementResult = await aiEnhancementService.enhanceTool(
            tool.name,
            result.value,
            {
              metadata: params.context || {},
              requirements: {
                securityLevel: params.securityLevel,
                optimization: params.optimization,
                environment: params.environment,
              },
            },
          );

          if (enhancementResult.ok && enhancementResult.value.enhanced) {
            const enhancement = enhancementResult.value;
            const resultValue = result.value;

            return {
              ...result,
              value: {
                ...(typeof resultValue === 'object' ? resultValue : {}),
                aiInsights: enhancement.insights,
                aiRecommendations: enhancement.recommendations,
                metadata: {
                  ...(resultValue?.metadata || {}),
                  aiEnhanced: true,
                  aiProvider: enhancement.metadata.aiProvider,
                  enhancementType: enhancement.metadata.enhancementType,
                  processingTime: enhancement.metadata.processingTime,
                },
              },
            };
          }
        } catch (error) {
          logger.warn({ tool: tool.name, error }, 'AI enhancement request failed');
        }
      }

      return result;
    },
  });

/**
 * Create enhanced tool registry with AI capabilities
 */
export const createEnhancedToolRegistry = (
  logger: Logger,
  config: {
    mcpHostAI?: MCPHostAI;
    promptRegistry?: SDKPromptRegistry;
    enableMetrics?: boolean;
    metricsCollector?: any;
    sessionManager?: any;
  } = {},
): ToolRegistry => {
  // Create AI enhancement service if available
  const aiEnhancementService =
    config.mcpHostAI && config.promptRegistry
      ? new AIEnhancementService(config.mcpHostAI, config.promptRegistry, logger)
      : undefined;

  // Create registry with all enhancements applied consistently
  return createToolRegistry(logger, {
    enableAI: !!aiEnhancementService,
    enableMetrics: config.enableMetrics ?? false,
    ...(aiEnhancementService ? { aiEnhancementService } : {}),
    metricsCollector: config.metricsCollector,
    sessionManager: config.sessionManager,
  });
};

/**
 * Get registry stats
 */
export const getRegistryStats = (
  registry: ToolRegistry,
): {
  totalTools: number;
  tools: string[];
} => ({
  totalTools: registry.size,
  tools: Array.from(registry.keys()),
});
