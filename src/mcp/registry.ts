/**
 * MCP Tool Registry - Simple object exports for tools and workflows
 *
 * No classes or singletons, just simple Maps and functions
 */

import type { Logger } from 'pino';
import { createLogger } from '../lib/logger';

// Import tool instances from flat tools structure
import { analyzeRepoTool } from '../tools/analyze-repo';
import { buildImageTool } from '../tools/build-image';
import { deployApplicationTool } from '../tools/deploy';
import { fixDockerfileTool } from '../tools/fix-dockerfile';
import { generateDockerfileTool } from '../tools/generate-dockerfile';
import { generateK8sManifestsTool } from '../tools/generate-k8s-manifests';
import { opsTool } from '../tools/ops';
import { prepareClusterTool } from '../tools/prepare-cluster';
import { pushImageTool } from '../tools/push';
import { resolveBaseImagesTool } from '../tools/resolve-base-images';
import { scanImageTool } from '../tools/scan';
import { tagImageTool } from '../tools/tag';
import { verifyDeploymentTool } from '../tools/verify-deployment';
import { workflowTool } from '../tools/workflow';

// Import AI enhancement capabilities
import { createAIService } from '../lib/ai';
import {
  createEnhancedTool,
} from '../application/tools/enhanced/intelligent-factory';

// Import session utilities
import * as sessionUtils from '../mcp/session/manager';

// Import workflows
import { containerizationWorkflow } from '../workflows/containerization';
import { deploymentWorkflow } from '../workflows/deployment';

import type { MCPTool, MCPWorkflow } from './types';

// Module-level registries - simple Maps
const toolsRegistry = new Map<string, MCPTool>();
const workflowsRegistry = new Map<string, MCPWorkflow>();

// Tool metadata definitions
const toolMetadata = {
  'analyze-repo': {
    description: 'Analyze repository structure and detect language, framework, and build system',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        repoPath: { type: 'string' },
        depth: { type: 'number' },
        includeTests: { type: 'boolean' },
      },
      required: ['sessionId', 'repoPath'],
    },
  },
  'build-image': {
    description: 'Build Docker image from Dockerfile',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        dockerfilePath: { type: 'string' },
        contextPath: { type: 'string' },
        buildArgs: { type: 'object' },
        target: { type: 'string' },
        platform: { type: 'string' },
        noCache: { type: 'boolean' },
      },
      required: ['sessionId'],
    },
  },
  deploy: {
    description: 'Deploy application to Kubernetes cluster',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        manifestPaths: { type: 'array', items: { type: 'string' } },
        namespace: { type: 'string' },
        context: { type: 'string' },
        wait: { type: 'boolean' },
        timeout: { type: 'number' },
      },
      required: ['sessionId'],
    },
  },
  'fix-dockerfile': {
    description: 'Fix issues in existing Dockerfile',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        dockerfilePath: { type: 'string' },
        issues: { type: 'array', items: { type: 'string' } },
      },
      required: ['sessionId', 'dockerfilePath'],
    },
  },
  'generate-dockerfile': {
    description: 'Generate optimized Dockerfile based on repository analysis',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        baseImage: { type: 'string' },
        optimization: { type: 'boolean' },
        multistage: { type: 'boolean' },
        securityHardening: { type: 'boolean' },
      },
      required: ['sessionId'],
    },
  },
  'generate-k8s-manifests': {
    description: 'Generate Kubernetes deployment manifests',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        deploymentName: { type: 'string' },
        image: { type: 'string' },
        namespace: { type: 'string' },
        replicas: { type: 'number' },
        port: { type: 'number' },
      },
      required: ['sessionId', 'deploymentName', 'image'],
    },
  },
  ops: {
    description: 'Operations tool for health checks and status',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        operation: { type: 'string', enum: ['ping', 'status', 'health'] },
      },
      required: ['sessionId'],
    },
  },
  'prepare-cluster': {
    description: 'Prepare Kubernetes cluster for deployment',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        context: { type: 'string' },
        namespace: { type: 'string' },
        createNamespace: { type: 'boolean' },
      },
      required: ['sessionId'],
    },
  },
  push: {
    description: 'Push Docker image to registry',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        imageId: { type: 'string' },
        registry: { type: 'string' },
        tag: { type: 'string' },
      },
      required: ['sessionId', 'imageId', 'registry'],
    },
  },
  'resolve-base-images': {
    description: 'Resolve and recommend base images',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        language: { type: 'string' },
        framework: { type: 'string' },
      },
      required: ['sessionId'],
    },
  },
  scan: {
    description: 'Scan Docker image for security vulnerabilities',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        imageId: { type: 'string' },
        severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        ignoreUnfixed: { type: 'boolean' },
      },
      required: ['sessionId', 'imageId'],
    },
  },
  tag: {
    description: 'Tag Docker image',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        imageId: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['sessionId', 'imageId', 'tags'],
    },
  },
  'verify-deployment': {
    description: 'Verify deployment health and readiness',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        deploymentName: { type: 'string' },
        namespace: { type: 'string' },
        timeout: { type: 'number' },
      },
      required: ['sessionId', 'deploymentName'],
    },
  },
  workflow: {
    description: 'Execute containerization or deployment workflow',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        workflowType: { type: 'string', enum: ['containerization', 'deployment'] },
        params: { type: 'object' },
      },
      required: ['sessionId', 'workflowType'],
    },
  },
} as const;

// Base tools array for registration
const baseTools = [
  analyzeRepoTool,
  buildImageTool,
  deployApplicationTool,
  fixDockerfileTool,
  generateDockerfileTool,
  generateK8sManifestsTool,
  opsTool,
  prepareClusterTool,
  pushImageTool,
  resolveBaseImagesTool,
  scanImageTool,
  tagImageTool,
  verifyDeploymentTool,
  workflowTool,
];

/**
 * Initialize tools with enhancements
 */
export const initializeTools = (logger?: Logger): void => {
  const log = logger ?? createLogger({ name: 'mcp-registry' });

  // Create AI service for enhancement
  const aiService = createAIService(log);

  // Create session management functions wrapper
  const sessionManager = {
    storeStepResult: (sessionId: string, step: string, result: any) =>
      Promise.resolve(sessionUtils.storeStepResult(sessionId, step, result, log)),
  };

  // Register each tool with enhancements
  baseTools.forEach((baseTool) => {
    const metadata = toolMetadata[baseTool.name as keyof typeof toolMetadata];

    if (!metadata) {
      log.warn({ tool: baseTool.name }, 'No metadata found for tool');
      return;
    }

    // Create enhanced tool with composition
    const enhancedTool = createEnhancedTool(baseTool, {
      logger: log,
      aiService,
      sessionManager,
      enableMetrics: true,
    });

    // Create MCPTool wrapper
    const mcpTool: MCPTool = {
      name: baseTool.name,
      description: metadata.description,
      schema: metadata.schema as any,
      execute: async (params: object, toolLogger: Logger) => {
        return enhancedTool.execute(params, toolLogger || log.child({ component: 'tool' }));
      },
    };

    toolsRegistry.set(baseTool.name, mcpTool);
    log.debug({ tool: baseTool.name }, 'Tool registered');
  });

  log.info({ count: toolsRegistry.size }, 'Tools registration complete');
};

/**
 * Initialize workflows
 */
export const initializeWorkflows = (logger?: Logger): void => {
  const log = logger ?? createLogger({ name: 'mcp-registry' });

  // Register containerization workflow
  workflowsRegistry.set(containerizationWorkflow.name, {
    name: containerizationWorkflow.name,
    description: containerizationWorkflow.description,
    execute: async (params: object, wfLogger?: Logger) => {
      return containerizationWorkflow.execute(
        params as Parameters<typeof containerizationWorkflow.execute>[0],
        wfLogger,
      );
    },
    schema: containerizationWorkflow.schema,
  });

  // Register deployment workflow
  workflowsRegistry.set(deploymentWorkflow.name, {
    name: deploymentWorkflow.name,
    description: deploymentWorkflow.description,
    execute: async (params: object, wfLogger?: Logger) => {
      return deploymentWorkflow.execute(
        params as Parameters<typeof deploymentWorkflow.execute>[0],
        wfLogger,
      );
    },
    schema: deploymentWorkflow.schema,
  });

  log.info({ count: workflowsRegistry.size }, 'Workflows registration complete');
};

/**
 * Get a tool by name
 */
export const getTool = (name: string): MCPTool | undefined => {
  return toolsRegistry.get(name);
};

/**
 * Get all registered tools
 */
export const getAllTools = (): MCPTool[] => {
  return Array.from(toolsRegistry.values());
};

/**
 * Get a workflow by name
 */
export const getWorkflow = (name: string): MCPWorkflow | undefined => {
  return workflowsRegistry.get(name);
};

/**
 * Get all workflows
 */
export const getAllWorkflows = (): MCPWorkflow[] => {
  return Array.from(workflowsRegistry.values());
};

/**
 * Validate registry
 */
export const validateRegistry = (logger?: Logger): boolean => {
  const log = logger ?? createLogger({ name: 'mcp-registry' });
  const expectedToolCount = 14;
  const actualToolCount = toolsRegistry.size;

  if (actualToolCount !== expectedToolCount) {
    log.error({
      expected: expectedToolCount,
      actual: actualToolCount,
      registered: Array.from(toolsRegistry.keys()),
    }, 'Tool count mismatch');
    return false;
  }

  const expectedWorkflowCount = 2;
  const actualWorkflowCount = workflowsRegistry.size;

  if (actualWorkflowCount !== expectedWorkflowCount) {
    log.error({
      expected: expectedWorkflowCount,
      actual: actualWorkflowCount,
      registered: Array.from(workflowsRegistry.keys()),
    }, 'Workflow count mismatch');
    return false;
  }

  // Validate each tool has required properties
  for (const [name, tool] of toolsRegistry) {
    if (!tool.description || !tool.execute || !tool.schema) {
      log.error({ tool: name }, 'Tool missing required properties');
      return false;
    }
  }

  log.info('Registry validation successful');
  return true;
};

/**
 * Get registry statistics
 */
export const getRegistryStats = (): { tools: number; workflows: number; valid: boolean } => {
  return {
    tools: toolsRegistry.size,
    workflows: workflowsRegistry.size,
    valid: validateRegistry(),
  };
};

/**
 * Initialize everything on module load if not already done
 */
let initialized = false;

export const ensureInitialized = (logger?: Logger): void => {
  if (!initialized) {
    initializeTools(logger);
    initializeWorkflows(logger);
    initialized = true;
  }
};

/**
 * Legacy compatibility: getMCPRegistry
 * Returns an object with the same interface as the old class
 */
export const getMCPRegistry = (logger?: Logger): any => {
  ensureInitialized(logger);

  return {
    getTool,
    getAllTools,
    getWorkflow,
    getAllWorkflows: () => Array.from(workflowsRegistry.keys()),
    getAllWorkflowObjects: getAllWorkflows,
    validateRegistry: () => validateRegistry(logger),
    getStats: getRegistryStats,
    registerTool: (tool: MCPTool) => {
      toolsRegistry.set(tool.name, tool);
    },
    registerWorkflow: (workflow: MCPWorkflow) => {
      workflowsRegistry.set(workflow.name, workflow);
    },
  };
};
