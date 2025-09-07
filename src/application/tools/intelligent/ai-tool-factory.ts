/**
 * Simple Tool Registry - Functional approach replacing factory patterns
 */

import type { Logger } from 'pino';
import { pipe } from '../../../lib/composition.js';
import type { Tool } from '../../../types/tools.js';
import { createIntelligentTool } from './tool-factory.js';

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

/**
 * Simple tool registry using Map
 */
export type ToolRegistry = Map<string, Tool>;

/**
 * Create enhanced tools using functional composition
 */
export const createToolRegistry = (
  logger: Logger,
  config: { enableAI?: boolean; enableMetrics?: boolean } = {},
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

  const registry = new Map<string, Tool>();

  baseTools.forEach((rawTool) => {
    // Create wrapper that matches Tool interface
    const tool: Tool = {
      name: rawTool.name,
      execute: async (params: Record<string, unknown>, logger: Logger) => {
        return await rawTool.execute(params as any, logger);
      },
    };

    const aiEnhancedTool = createIntelligentTool(tool, {
      logger,
      enableMetrics: config.enableMetrics || false,
      enableRetry: true,
      retryAttempts: 3,
    });
    registry.set(tool.name, aiEnhancedTool);
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
 * AI enhancement functions using composition
 */
export const withAI =
  (aiService: any, _sessionManager: any) =>
  <T extends Tool>(tool: T): T => ({
    ...tool,
    async execute(params: any, logger: Logger) {
      const result = await tool.execute(params, logger);

      // Add AI insights if available
      if (
        result &&
        typeof result === 'object' &&
        'ok' in result &&
        result.ok &&
        params.sessionId &&
        aiService
      ) {
        try {
          const aiContext = await aiService.generateWithContext({
            prompt: `Enhance ${tool.name} results with AI insights`,
            sessionId: params.sessionId,
            context: result.value,
          });

          if (aiContext.ok) {
            const resultValue = result.value;
            return {
              ...result,
              value: {
                ...(typeof resultValue === 'object' ? resultValue : {}),
                aiInsights: aiContext.value.context.guidance,
                metadata: {
                  ...(resultValue?.metadata || {}),
                  aiEnhanced: true,
                },
              },
            };
          }
        } catch (error) {
          logger.warn({ tool: tool.name, error }, 'AI enhancement failed');
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
    aiService?: any;
    sessionManager?: any;
    enableMetrics?: boolean;
    metricsCollector?: any;
  } = {},
): ToolRegistry => {
  const baseRegistry = createToolRegistry(logger, {
    enableMetrics: config.enableMetrics ?? false,
  });

  // Apply AI enhancements if available
  if (config.aiService && config.sessionManager) {
    baseRegistry.forEach((tool, name) => {
      const aiEnhanced = pipe(withAI(config.aiService, config.sessionManager))(tool);
      baseRegistry.set(name, aiEnhanced);
    });
  }

  return baseRegistry;
};

/** @deprecated Use createEnhancedToolRegistry instead */
export const createAIToolRegistry = (
  logger: Logger,
  aiService: any,
  sessionManager: any,
): ToolRegistry => {
  return createEnhancedToolRegistry(logger, { aiService, sessionManager });
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
