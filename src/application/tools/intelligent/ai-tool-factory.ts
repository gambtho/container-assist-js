/**
 * Simple Tool Registry - Functional approach replacing factory patterns
 */

import type { Logger } from 'pino';
import { pipe, type Tool } from '../../../lib/composition.js';
import { createEnhancedTool } from './tool-factory.js';

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
  ];

  const registry = new Map<string, Tool>();

  baseTools.forEach((tool) => {
    const enhancedTool = createEnhancedTool(tool, {
      logger,
      enableMetrics: config.enableMetrics,
      enableRetry: true,
      retryAttempts: 3,
    });
    registry.set(tool.name, enhancedTool);
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
export const withAI = (aiService: any, _sessionManager: any) => <T extends Tool>(tool: T): T => ({
  ...tool,
  async execute(params: any, logger: Logger) {
    const result = await tool.execute(params, logger);

    // Add AI insights if available
    if (result.ok && params.sessionId && aiService) {
      try {
        const aiContext = await aiService.generateWithContext({
          prompt: `Enhance ${tool.name} results with AI insights`,
          sessionId: params.sessionId,
          context: result.value,
        });

        if (aiContext.ok) {
          return {
            ...result,
            value: {
              ...result.value,
              aiInsights: aiContext.value.context.guidance,
              metadata: {
                ...result.value.metadata,
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
 * Create AI-enhanced tool registry
 */
export const createAIToolRegistry = (
  logger: Logger,
  aiService: any,
  sessionManager: any,
): ToolRegistry => {
  const baseRegistry = createToolRegistry(logger);
  const aiRegistry = new Map<string, Tool>();

  baseRegistry.forEach((tool, name) => {
    const aiEnhancedTool = pipe(
      withAI(aiService, sessionManager),
    )(tool);
    aiRegistry.set(name, aiEnhancedTool);
  });

  return aiRegistry;
};


/**
 * Get registry stats
 */
export const getRegistryStats = (registry: ToolRegistry): {
  totalTools: number;
  tools: string[];
} => ({
  totalTools: registry.size,
  tools: Array.from(registry.keys()),
});
