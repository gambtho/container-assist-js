/**
 * Simple MCP Tools - De-Enterprise Refactoring
 *
 * Replaces MCPToolRegistry (470 lines) with simple object map (~100 lines).
 * Removes class-based registry, validation, metadata management, and singleton patterns.
 */

import type { Logger } from 'pino';
import { createLogger } from '../lib/logger';

// Import tool instances directly
import { analyzeRepoTool } from '../tools/analyze-repo';
import { buildImageTool } from '../tools/build-image';
import { deployApplicationTool } from '../tools/deploy';
import { fixDockerfileTool } from '../tools/fix-dockerfile';
import { generateDockerfileTool } from '../tools/generate-dockerfile';
import { generateK8sManifestsTool } from '../tools/generate-k8s-manifests';
import { prepareClusterTool } from '../tools/prepare-cluster';
import { pushImageTool } from '../tools/push';
import { resolveBaseImagesTool } from '../tools/resolve-base-images';
import { scanImageTool } from '../tools/scan';
import { tagImageTool } from '../tools/tag';
import { verifyDeploymentTool } from '../tools/verify-deployment';
import { workflowTool } from '../tools/workflow';

/**
 * Simple tool interface - no complex metadata or validation
 */
export interface Tool {
  name: string;
  execute: (
    config: Record<string, unknown>,
  ) => Promise<import('../types/core/index.js').Result<unknown>>;
  schema?: Record<string, unknown>;
}

/**
 * Create all tools with logger - simple factory pattern
 */
const createAllTools = (logger: Logger): Record<string, Tool> => {
  // All tools are now direct objects that take logger as second parameter
  return {
    'analyze-repo': {
      name: 'analyze-repo',
      execute: (config: any) => analyzeRepoTool.execute(config, logger),
    },
    'build-image': {
      name: 'build-image',
      execute: (config: any) => buildImageTool.execute(config, logger),
    },
    deploy: {
      name: 'deploy',
      execute: (config: any) => deployApplicationTool.execute(config, logger),
    },
    'fix-dockerfile': {
      name: 'fix-dockerfile',
      execute: (config: any) => fixDockerfileTool.execute(config, logger),
    },
    'generate-dockerfile': {
      name: 'generate-dockerfile',
      execute: (config: any) => generateDockerfileTool.execute(config, logger),
    },
    'generate-k8s-manifests': {
      name: 'generate-k8s-manifests',
      execute: (config: any) => generateK8sManifestsTool.execute(config, logger),
    },
    'prepare-cluster': {
      name: 'prepare-cluster',
      execute: (config: any) => prepareClusterTool.execute(config, logger),
    },
    push: { name: 'push', execute: (config: any) => pushImageTool.execute(config, logger) },
    'resolve-base-images': {
      name: 'resolve-base-images',
      execute: (config: any) => resolveBaseImagesTool.execute(config, logger),
    },
    scan: { name: 'scan', execute: (config: any) => scanImageTool.execute(config, logger) },
    tag: { name: 'tag', execute: (config: any) => tagImageTool.execute(config, logger) },
    'verify-deployment': {
      name: 'verify-deployment',
      execute: (config: any) => verifyDeploymentTool.execute(config, logger),
    },
    workflow: { name: 'workflow', execute: (config: any) => workflowTool.execute(config, logger) },
  };
};

/**
 * Simple tools map - no registry pattern, just direct object access
 */
let toolsCache: Record<string, Tool> | null = null;
const defaultLogger = createLogger({ name: 'mcp-tools' });

/**
 * Get tool by name - simple object lookup
 */
export const getTool = (name: string, logger?: Logger): Tool | undefined => {
  if (!toolsCache) {
    toolsCache = createAllTools(logger || defaultLogger);
  }
  return toolsCache[name];
};

/**
 * Get all available tools - simple object values
 */
export const getAllTools = (logger?: Logger): Tool[] => {
  if (!toolsCache) {
    toolsCache = createAllTools(logger || defaultLogger);
  }
  return Object.values(toolsCache);
};

/**
 * Get tool names - simple object keys
 */
export const getToolNames = (): string[] => {
  if (!toolsCache) {
    toolsCache = createAllTools(defaultLogger);
  }
  return Object.keys(toolsCache);
};

/**
 * Check if tool exists - simple object property check
 */
export const hasTool = (name: string): boolean => {
  if (!toolsCache) {
    toolsCache = createAllTools(defaultLogger);
  }
  return name in toolsCache;
};

/**
 * Reset tools cache (useful for testing)
 */
export const resetTools = (): void => {
  toolsCache = null;
};

/**
 * Simple workflow map - no complex registry
 */
export const WORKFLOWS = {
  containerization: async (repoPath: string, logger: Logger) => {
    // Simple workflow execution - no complex orchestration
    const analyzeResult = await getTool('analyze-repo', logger)?.execute({
      sessionId: 'temp',
      repoPath,
    });
    if (!analyzeResult?.ok) return analyzeResult;

    const dockerfileResult = await getTool('generate-dockerfile', logger)?.execute({
      sessionId: 'temp',
      optimization: true,
    });
    if (!dockerfileResult?.ok) return dockerfileResult;

    const buildResult = await getTool('build-image', logger)?.execute({
      sessionId: 'temp',
      context: repoPath,
      dockerfile: 'Dockerfile',
    });

    return buildResult;
  },

  deployment: async (repoPath: string, logger: Logger) => {
    // Simple deployment workflow - use repoPath for context
    const k8sResult = await getTool('generate-k8s-manifests', logger)?.execute({
      sessionId: 'temp',
      repoPath,
      environment: 'production',
    });
    if (!k8sResult?.ok) return k8sResult;

    const deployResult = await getTool('deploy', logger)?.execute({
      sessionId: 'temp',
      manifests: k8sResult.value,
    });

    return deployResult;
  },
} as const;

/**
 * Get workflow by name
 */
export const getWorkflow = (
  name: keyof typeof WORKFLOWS,
): (typeof WORKFLOWS)[keyof typeof WORKFLOWS] => WORKFLOWS[name];
