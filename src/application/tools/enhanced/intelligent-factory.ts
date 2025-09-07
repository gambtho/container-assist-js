/**
 * Tool enhancement using functional composition
 *
 * Replaces Java factory patterns with simple functional composition
 * using the utilities from lib/composition.ts
 */

import type { Logger } from 'pino';
import { Success } from '../../../types/core/index.js';
import { pipe, type Tool, type ToolEnhancer } from '../../../lib/composition.js';

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
 * Tool enhancer: Add logging
 */
export const withLogging = (logger: Logger): ToolEnhancer => (tool) => ({
  ...tool,
  execute: async (params, toolLogger) => {
    const log = toolLogger || logger;
    log.info({ tool: tool.name, params }, 'Executing tool');
    const result = await tool.execute(params, log);
    log.info({ tool: tool.name, success: result.ok }, 'Tool execution complete');
    return result;
  },
});

/**
 * Tool enhancer: Add metrics
 */
export const withMetrics = (): ToolEnhancer => (tool) => ({
  ...tool,
  execute: async (params, logger) => {
    const start = Date.now();
    const result = await tool.execute(params, logger);
    const duration = Date.now() - start;

    if (logger) {
      logger.info({ tool: tool.name, duration }, 'Tool metrics');
    }

    return result;
  },
});

/**
 * Tool enhancer: Add AI insights for specific tools
 */
export const withAIInsights = (_aiService: any, _sessionManager: any): ToolEnhancer => (tool) => {
  // Only enhance specific tools that benefit from AI
  const aiEnhancedTools = ['analyze-repo', 'generate-dockerfile', 'scan', 'workflow'];

  if (!aiEnhancedTools.includes(tool.name)) {
    return tool;
  }

  return {
    ...tool,
    execute: async (params: any, logger) => {
      const result = await tool.execute(params, logger);

      if (!result.ok || !params.sessionId) {
        return result;
      }

      // Add contextual insights based on tool type
      switch (tool.name) {
        case 'analyze-repo':
          return Success({
            ...result.value,
            insights: [
              'Consider multi-stage builds for optimal image size',
              'Use specific base image versions for reproducibility',
            ],
          });

        case 'scan': {
          const vulnerabilities = (result.value).vulnerabilitiesDetails || [];
          if (vulnerabilities.length > 0) {
            const critical = vulnerabilities.filter((v: any) => v.severity === 'CRITICAL');
            return Success({
              ...result.value,
              analysis: {
                criticalCount: critical.length,
                totalCount: vulnerabilities.length,
                recommendation: critical.length > 0
                  ? 'Fix critical vulnerabilities before deployment'
                  : 'Review and update dependencies',
              },
            });
          }
          return result;
        }

        default:
          return result;
      }
    },
  };
};

/**
 * Tool enhancer: Add session management
 */
export const withSessionManagement = (sessionManager: any): ToolEnhancer => (tool) => ({
  ...tool,
  execute: async (params: any, logger) => {
    const result = await tool.execute(params, logger);

    // Store result in session if sessionId provided
    if (params.sessionId && sessionManager && result.ok) {
      await sessionManager.storeStepResult(params.sessionId, tool.name, result.value);
    }

    return result;
  },
});

/**
 * Create enhanced tool with all enhancers
 */
export const createEnhancedTool = (
  baseTool: Tool,
  options: {
    logger?: Logger;
    aiService?: any;
    sessionManager?: any;
    enableMetrics?: boolean;
  } = {},
): Tool => {
  const enhancers: ToolEnhancer[] = [];

  // Add enhancers based on options
  if (options.logger) {
    enhancers.push(withLogging(options.logger));
  }

  if (options.enableMetrics) {
    enhancers.push(withMetrics());
  }

  if (options.aiService && options.sessionManager) {
    enhancers.push(withAIInsights(options.aiService, options.sessionManager));
  }

  if (options.sessionManager) {
    enhancers.push(withSessionManagement(options.sessionManager));
  }

  // Apply all enhancers using pipe
  return enhancers.length > 0
    ? pipe(...enhancers)(baseTool)
    : baseTool;
};

/**
 * Export all base tools as a simple object
 */
export const tools = {
  analyzeRepo: analyzeRepoTool,
  generateDockerfile: generateDockerfileTool,
  buildImage: buildImageTool,
  scan: scanImageTool,
  push: pushImageTool,
  tag: tagImageTool,
  workflow: workflowTool,
  fixDockerfile: fixDockerfileTool,
  resolveBaseImages: resolveBaseImagesTool,
  prepareCluster: prepareClusterTool,
  ops: opsTool,
  deploy: deployApplicationTool,
  generateK8sManifests: generateK8sManifestsTool,
  verifyDeployment: verifyDeploymentTool,
} as const;

/**
 * Get all tools as array
 */
export const getAllTools = (): Tool[] => Object.values(tools);

/**
 * Get tool by name
 */
export const getToolByName = (name: string): Tool | undefined => {
  return Object.values(tools).find(tool => tool.name === name);
};

/**
 * Create all enhanced tools
 */
export const createAllEnhancedTools = (options: {
  logger?: Logger;
  aiService?: any;
  sessionManager?: any;
  enableMetrics?: boolean;
} = {}): Record<string, Tool> => {
  const enhanced: Record<string, Tool> = {};

  for (const [key, tool] of Object.entries(tools)) {
    enhanced[key] = createEnhancedTool(tool, options);
  }

  return enhanced;
};
