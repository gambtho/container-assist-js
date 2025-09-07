/**
 * MCP Tool Registry - Registers and manages all available tools and workflows
 *
 * This registry manages all 14 tools from src/tools/ and provides
 * an interface for the MCP server to access them.
 */

import type { Logger } from 'pino';
import { createLogger } from '../lib/logger';
import type { Result } from '../types/core/index';

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
import { createSessionManager } from '../lib/session';
import {
  createAnalyzeRepoWithAI,
  createDockerfileGeneratorWithAI,
  createScannerWithAI,
  createWorkflowExecutorWithAI,
  withAIEnhancement,
} from '../application/tools/enhanced/intelligent-factory';

// Import workflows
import { containerizationWorkflow } from '../workflows/containerization';
import { deploymentWorkflow } from '../workflows/deployment';

import type { MCPTool, MCPWorkflow, ToolRegistry, WorkflowRegistry } from './types';

/**
 * MCP Tool and Workflow Registry implementation
 * Manages all tools and workflows for the MCP server
 */
class MCPToolRegistry implements ToolRegistry, WorkflowRegistry {
  private tools: Map<string, MCPTool> = new Map();
  private workflows: Map<string, MCPWorkflow> = new Map();
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? createLogger({ name: 'mcp-registry' });
    this.registerAllTools();
    this.registerAllWorkflows();
  }

  /**
   * Register all 14 tools from the flat tools structure with AI enhancements
   */
  private registerAllTools(): void {
    this.logger.info('Registering all tools in MCP registry with AI enhancements');

    // Create AI service and session manager for tool enhancement
    const aiService = createAIService(this.logger);
    const sessionManager = createSessionManager(this.logger);

    // Tool metadata for MCP
    const toolMetadata: Record<string, { description: string; schema: object }> = {
      'analyze-repo': {
        description:
          'Analyze repository structure and detect language, framework, and build system',
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
    };

    // Create AI-enhanced versions of specialized tools
    const specializedTools = new Map<string, any>([
      ['analyze-repo', createAnalyzeRepoWithAI(aiService, sessionManager, this.logger)],
      [
        'generate-dockerfile',
        createDockerfileGeneratorWithAI(aiService, sessionManager, this.logger),
      ],
      ['scan', createScannerWithAI(aiService, sessionManager, this.logger)],
      ['workflow', createWorkflowExecutorWithAI(aiService, sessionManager, this.logger)],
    ]);

    // Create AI enhancer for other tools
    const enhancer = withAIEnhancement(aiService, sessionManager, this.logger);

    // Create and register tools with full MCPTool interface
    const toolCreators = [
      () => specializedTools.get('analyze-repo') || enhancer(analyzeRepoTool),
      () => enhancer(buildImageTool),
      () => enhancer(deployApplicationTool),
      () => enhancer(fixDockerfileTool),
      () => specializedTools.get('generate-dockerfile') || enhancer(generateDockerfileTool),
      () => enhancer(generateK8sManifestsTool),
      () => enhancer(opsTool),
      () => enhancer(prepareClusterTool),
      () => enhancer(pushImageTool),
      () => enhancer(resolveBaseImagesTool),
      () => specializedTools.get('scan') || enhancer(scanImageTool),
      () => enhancer(tagImageTool),
      () => enhancer(verifyDeploymentTool),
      () => specializedTools.get('workflow') || enhancer(workflowTool),
    ];

    toolCreators.forEach((creator) => {
      try {
        const toolImpl = creator();
        const metadata = toolMetadata[toolImpl.name];

        if (!metadata) {
          this.logger.warn({ tool: toolImpl.name }, 'No metadata found for tool');
          return;
        }

        // Wrap the tool with full MCPTool interface
        const mcpTool: MCPTool = {
          name: toolImpl.name,
          description: metadata.description,
          schema: metadata.schema as {
            type: string;
            properties?: Record<string, object>;
            required?: string[];
            additionalProperties?: boolean;
          },
          execute: async (params: object, logger: Logger) => {
            // Each tool handles its own type validation internally
            // We pass params and logger directly - the tool signature has changed
            return (
              toolImpl as { execute: (params: object, logger: Logger) => Promise<Result<unknown>> }
            ).execute(params, logger || this.logger.child({ component: 'tool' }));
          },
        };

        this.registerTool(mcpTool);
        this.logger.debug({ tool: toolImpl.name }, 'Tool registered successfully');
      } catch (error) {
        this.logger.error({ error }, 'Failed to register tool');
      }
    });

    this.logger.info({ count: this.tools.size }, 'Tools registration complete');
  }

  /**
   * Register workflow orchestrations
   */
  private registerAllWorkflows(): void {
    this.logger.info('Registering workflows in MCP registry');

    // Register containerization workflow
    this.registerWorkflow({
      name: containerizationWorkflow.name,
      description: containerizationWorkflow.description,
      execute: async (params: object, logger?: Logger) => {
        return containerizationWorkflow.execute(
          params as Parameters<typeof containerizationWorkflow.execute>[0],
          logger,
        );
      },
      schema: containerizationWorkflow.schema,
    });

    // Register deployment workflow
    this.registerWorkflow({
      name: deploymentWorkflow.name,
      description: deploymentWorkflow.description,
      execute: async (params: object, logger?: Logger) => {
        return deploymentWorkflow.execute(
          params as Parameters<typeof deploymentWorkflow.execute>[0],
          logger,
        );
      },
      schema: deploymentWorkflow.schema,
    });

    this.logger.info({ count: this.workflows.size }, 'Workflows registration complete');
  }

  /**
   * Register a single tool
   */
  registerTool(tool: MCPTool): void {
    if (!tool.name) {
      throw new Error('Tool must have a name');
    }

    if (this.tools.has(tool.name)) {
      this.logger.warn({ tool: tool.name }, 'Tool already registered, overwriting');
    }

    this.tools.set(tool.name, tool);
  }

  /**
   * Register a workflow
   */
  registerWorkflow(workflow: MCPWorkflow): void {
    if (!workflow.name) {
      throw new Error('Workflow must have a name');
    }

    if (this.workflows.has(workflow.name)) {
      this.logger.warn({ workflow: workflow.name }, 'Workflow already registered, overwriting');
    }

    this.workflows.set(workflow.name, workflow);
  }

  /**
   * Get a tool by name
   */
  getTool(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get a workflow by name
   */
  getWorkflow(name: string): MCPWorkflow | undefined {
    return this.workflows.get(name);
  }

  /**
   * Get all workflow names
   */
  getAllWorkflows(): string[] {
    return Array.from(this.workflows.keys());
  }

  /**
   * Get all workflow objects
   */
  getAllWorkflowObjects(): MCPWorkflow[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Validate that all expected tools are registered
   */
  validateRegistry(): boolean {
    const expectedToolCount = 14;
    const actualToolCount = this.tools.size;

    if (actualToolCount !== expectedToolCount) {
      this.logger.error(
        {
          expected: expectedToolCount,
          actual: actualToolCount,
          registered: Array.from(this.tools.keys()),
        },
        'Tool count mismatch',
      );
      return false;
    }

    const expectedWorkflowCount = 2;
    const actualWorkflowCount = this.workflows.size;

    if (actualWorkflowCount !== expectedWorkflowCount) {
      this.logger.error(
        {
          expected: expectedWorkflowCount,
          actual: actualWorkflowCount,
          registered: Array.from(this.workflows.keys()),
        },
        'Workflow count mismatch',
      );
      return false;
    }

    // Validate each tool has required properties
    for (const [name, tool] of this.tools) {
      if (!tool.description || !tool.execute || !tool.schema) {
        this.logger.error({ tool: name }, 'Tool missing required properties');
        return false;
      }
    }

    this.logger.info('Registry validation successful');
    return true;
  }

  /**
   * Get registry statistics
   */
  getStats(): { tools: number; workflows: number; valid: boolean } {
    return {
      tools: this.tools.size,
      workflows: this.workflows.size,
      valid: this.validateRegistry(),
    };
  }
}

/**
 * Create and export a singleton registry instance
 */
let registryInstance: MCPToolRegistry | undefined;

/**
 * Get the singleton MCP tool registry instance
 * @param logger - Optional logger for registry operations
 * @returns The MCP tool registry instance
 */
export function getMCPRegistry(logger?: Logger): MCPToolRegistry {
  if (!registryInstance) {
    registryInstance = new MCPToolRegistry(logger);
  }
  return registryInstance;
}
