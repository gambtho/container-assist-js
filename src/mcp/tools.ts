/**
 * Simple MCP Tools - De-Enterprise Refactoring
 *
 * Replaces MCPToolRegistry (470 lines) with simple object map (~100 lines).
 * Removes class-based registry, validation, metadata management, and singleton patterns.
 */

import type { Logger } from 'pino';
import { createLogger } from '../lib/logger';

// Import tool creators directly
import { createAnalyzeRepoTool } from '../tools/analyze-repo';
import { buildImageTool } from '../tools/build-image';
import { deployApplicationTool } from '../tools/deploy';
import { createFixDockerfileTool } from '../tools/fix-dockerfile';
import { createGenerateDockerfileTool } from '../tools/generate-dockerfile';
import { generateK8sManifestsTool } from '../tools/generate-k8s-manifests';
import { createPrepareClusterTool } from '../tools/prepare-cluster';
import { createPushTool } from '../tools/push';
import { createResolveBaseImagesTool } from '../tools/resolve-base-images';
import { createScanTool } from '../tools/scan';
import { createTagTool } from '../tools/tag';
import { verifyDeploymentTool } from '../tools/verify-deployment';
import { createWorkflowTool } from '../tools/workflow';

/**
 * Simple tool interface - no complex metadata or validation
 */
export interface Tool {
  name: string;
  execute: (config: any) => Promise<any>;
  schema?: any;
}

/**
 * Create all tools with logger - simple factory pattern
 */
const createAllTools = (logger: Logger): Record<string, Tool> => {
  const analyzeRepo = createAnalyzeRepoTool(logger);
  const buildImage = buildImageTool; // Direct tool object
  const deploy = deployApplicationTool; // Direct tool object
  const fixDockerfile = createFixDockerfileTool(logger);
  const generateDockerfile = createGenerateDockerfileTool(logger);
  const generateK8s = generateK8sManifestsTool; // Direct tool object
  const prepareCluster = createPrepareClusterTool(logger);
  const push = createPushTool(logger);
  const resolveBaseImages = createResolveBaseImagesTool(logger);
  const scan = createScanTool(logger);
  const tag = createTagTool(logger);
  const verifyDeployment = verifyDeploymentTool; // Direct tool object
  const workflow = createWorkflowTool(logger);

  return {
    'analyze-repo': { name: 'analyze-repo', execute: analyzeRepo.execute },
    'build-image': { name: 'build-image', execute: (config: any) => buildImage.execute(config, logger) },
    'deploy': { name: 'deploy', execute: (config: any) => deploy.execute(config, logger) },
    'fix-dockerfile': { name: 'fix-dockerfile', execute: fixDockerfile.execute },
    'generate-dockerfile': { name: 'generate-dockerfile', execute: generateDockerfile.execute },
    'generate-k8s-manifests': { name: 'generate-k8s-manifests', execute: (config: any) => generateK8s.execute(config, logger) },
    'prepare-cluster': { name: 'prepare-cluster', execute: prepareCluster.execute },
    'push': { name: 'push', execute: push.execute },
    'resolve-base-images': { name: 'resolve-base-images', execute: resolveBaseImages.execute },
    'scan': { name: 'scan', execute: scan.execute },
    'tag': { name: 'tag', execute: tag.execute },
    'verify-deployment': { name: 'verify-deployment', execute: (config: any) => verifyDeployment.execute(config, logger) },
    'workflow': { name: 'workflow', execute: workflow.execute },
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
  'containerization': async (repoPath: string, logger: Logger) => {
    // Simple workflow execution - no complex orchestration
    const analyzeResult = await getTool('analyze-repo', logger)?.execute({ sessionId: 'temp', repoPath });
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

  'deployment': async (repoPath: string, logger: Logger) => {
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
export const getWorkflow = (name: keyof typeof WORKFLOWS): typeof WORKFLOWS[keyof typeof WORKFLOWS] => WORKFLOWS[name];
