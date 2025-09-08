/**
 * MCP Server implementation using the Model Context Protocol SDK.
 * Provides tools, resources, and prompts for containerization workflows.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { Logger } from 'pino';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { analyzeRepoSchema } from '@tools/analyze-repo/schema';
import { generateDockerfileSchema } from '@tools/generate-dockerfile/schema';
import { buildImageSchema } from '@tools/build-image/schema';
import { scanImageSchema } from '@tools/scan/schema';
import { deployApplicationSchema } from '@tools/deploy/schema';
import { pushImageSchema } from '@tools/push-image/schema';
import { tagImageSchema } from '@tools/tag-image/schema';
import { workflowSchema } from '@tools/workflow/schema';
import { fixDockerfileSchema } from '@tools/fix-dockerfile/schema';
import { resolveBaseImagesSchema } from '@tools/resolve-base-images/schema';
import { prepareClusterSchema } from '@tools/prepare-cluster/schema';
import { opsToolSchema } from '@tools/ops/schema';
import { generateK8sManifestsSchema } from '@tools/generate-k8s-manifests/schema';
import { verifyDeploymentSchema } from '@tools/verify-deployment/schema';
import {
  containerizationWorkflowSchema,
  deploymentWorkflowSchema,
  toolSchemas as zodToolSchemas,
} from '@mcp/server/schemas';
import { containerizationWorkflow } from '@workflows/containerization';
import { deploymentWorkflow } from '@workflows/deployment';
import type { Tool } from '@types';
import { getContainerStatus, type Deps } from '@app/container';

// Import tool functions
import { analyzeRepo } from '@tools/analyze-repo';
import { generateDockerfile } from '@tools/generate-dockerfile';
import { buildImage } from '@tools/build-image';
import { scanImage } from '@tools/scan';
import { deployApplication } from '@tools/deploy';
import { pushImage } from '@tools/push-image';
import { tagImage } from '@tools/tag-image';
import { workflowTool } from '@tools/workflow';
import { fixDockerfile } from '@tools/fix-dockerfile';
import { resolveBaseImagesTool } from '@tools/resolve-base-images';
import { prepareCluster } from '@tools/prepare-cluster';
import { opsTool } from '@tools/ops';
import { generateK8sManifests } from '@tools/generate-k8s-manifests';
import { verifyDeployment } from '@tools/verify-deployment';

// Tool schemas map
const toolSchemas = {
  'analyze-repo': analyzeRepoSchema,
  'generate-dockerfile': generateDockerfileSchema,
  'build-image': buildImageSchema,
  scan: scanImageSchema,
  deploy: deployApplicationSchema,
  push: pushImageSchema,
  tag: tagImageSchema,
  workflow: workflowSchema,
  'fix-dockerfile': fixDockerfileSchema,
  'resolve-base-images': resolveBaseImagesSchema,
  'prepare-cluster': prepareClusterSchema,
  ops: opsToolSchema,
  'generate-k8s-manifests': generateK8sManifestsSchema,
  'verify-deployment': verifyDeploymentSchema,
  containerization: containerizationWorkflowSchema,
  deployment: deploymentWorkflowSchema,
} as const;

// Tool function map
const toolFunctions = {
  'analyze-repo': analyzeRepo,
  'generate-dockerfile': generateDockerfile,
  'build-image': buildImage,
  scan: scanImage,
  deploy: deployApplication,
  'push-image': pushImage,
  'tag-image': tagImage,
  workflow: workflowTool.execute,
  'fix-dockerfile': fixDockerfile,
  'resolve-base-images': resolveBaseImagesTool.execute,
  'prepare-cluster': prepareCluster,
  ops: opsTool.execute,
  'generate-k8s-manifests': generateK8sManifests,
  'verify-deployment': verifyDeployment,
} as const;

/**
 * MCP Server class that integrates containerization tools with the MCP protocol.
 * Handles tool invocation, resource management, and prompt templates.
 */
export class MCPServer {
  private server: McpServer;
  private transport: StdioServerTransport;
  private deps: Deps;
  private isRunning: boolean = false;

  constructor(
    deps: Deps,
    options?: {
      name?: string;
      version?: string;
    },
  ) {
    this.deps = deps;

    // Create SDK server with capabilities using config
    this.server = new McpServer(
      {
        name: options?.name ?? deps.config.mcp.name,
        version: options?.version ?? deps.config.mcp.version,
      },
      {
        capabilities: {
          resources: {
            subscribe: false,
            listChanged: false,
          },
          prompts: {
            listChanged: false,
          },
          tools: {
            listChanged: false,
          },
        },
      },
    );

    this.transport = new StdioServerTransport();
    // Don't setup handlers in constructor - do it before connecting
  }

  private setupHandlers(): void {
    // Register all tools using McpServer's tool() method
    this.registerAllTools();

    // Register workflows as tools
    this.registerWorkflowTools();

    // Register a simple status resource
    this.server.resource(
      'status',
      'containerization://status',
      {
        title: 'Container Status',
        description: 'Current status of the containerization system',
      },
      async () => {
        const status = getContainerStatus(this.deps, this.isRunning);
        return {
          contents: [
            {
              uri: 'containerization://status',
              mimeType: 'application/json',
              text: JSON.stringify(status, null, 2),
            },
          ],
        };
      },
    );

    // Register a prompt
    this.server.prompt(
      'dockerfile-generation',
      'Generate Dockerfile for application',
      {
        language: z.string().describe('Programming language'),
        framework: z.string().optional().describe('Application framework'),
      },
      async (params) => {
        try {
          const result = await this.deps.promptRegistry.getPrompt('dockerfile-generation', params);
          return result;
        } catch (error) {
          throw new McpError(
            ErrorCode.MethodNotFound,
            error instanceof Error ? error.message : 'Prompt not found: dockerfile-generation',
          );
        }
      },
    );

    this.deps.logger.info('SDK-native handlers configured');
  }

  /**
   * Register all tools using McpServer's tool() method
   */
  private registerAllTools(): void {
    // Register each tool directly with the McpServer using JSON schemas
    for (const [name, _schema] of Object.entries(toolSchemas)) {
      // Skip workflow schemas as they're handled separately
      if (name === 'containerization' || name === 'deployment') {
        continue;
      }

      // Get the Zod schema shape for this tool
      const zodSchema = zodToolSchemas[name as keyof typeof zodToolSchemas];
      const schemaShape = zodSchema?.shape || {};

      // Also register with toolRegistry for compatibility with existing code
      const toolFunction = toolFunctions[name as keyof typeof toolFunctions];
      if (toolFunction) {
        const toolObject: Tool = {
          name,
          description: `${name} tool`,
          execute: async (params: any, logger: Logger) => {
            return await toolFunction(params, logger);
          },
        };
        this.deps.toolRegistry.registerTool(toolObject);
      }

      // Use the SDK's tool() method with Zod shape (SDK handles conversion)
      this.server.tool(name, `${name} tool`, schemaShape, async (params: any) => {
        this.deps.logger.info({ tool: name }, 'Executing tool via McpServer handler');

        try {
          // Ensure sessionId is provided - generate a unique one if missing
          if (!params.sessionId) {
            params.sessionId = randomUUID();
            this.deps.logger.debug(
              { sessionId: params.sessionId },
              'Generated new session ID for tool execution',
            );
          }

          // Execute tool function directly
          const toolFunction = toolFunctions[name as keyof typeof toolFunctions];
          if (!toolFunction) {
            throw new Error(`Tool function not found: ${name}`);
          }

          const result = await toolFunction(params, this.deps.logger);

          if ('ok' in result) {
            if (result.ok) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: JSON.stringify(result.value, null, 2),
                  },
                ],
              };
            } else {
              throw new McpError(ErrorCode.InternalError, result.error);
            }
          }

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          this.deps.logger.error({ tool: name, error }, 'Tool execution failed');

          if (error instanceof McpError) {
            throw error;
          }

          throw new McpError(
            ErrorCode.InternalError,
            error instanceof Error ? error.message : 'Unknown error occurred',
          );
        }
      });
    }

    this.deps.logger.info(
      { count: this.deps.toolRegistry.tools.size },
      'Tools registered with McpServer',
    );
  }

  /**
   * Register workflow tools using McpServer's tool() method
   */
  private registerWorkflowTools(): void {
    // Register containerization workflow with Zod shape
    this.server.tool(
      'containerization',
      'Containerization workflow',
      containerizationWorkflowSchema.shape,
      async (params) => {
        this.deps.logger.info(
          { workflow: 'containerization' },
          'Executing containerization workflow',
        );

        // Map MCP schema params to workflow params
        const workflowParams = {
          ...params,
          projectPath: params.repoPath || this.deps.config.workspace.workspaceDir,
          sessionId: params.sessionId || randomUUID(),
        };

        if (!params.sessionId) {
          this.deps.logger.debug(
            { sessionId: workflowParams.sessionId },
            'Generated new session ID for containerization workflow',
          );
        }

        const result = await containerizationWorkflow.execute(workflowParams, this.deps.logger, {
          deps: this.deps,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    );

    // Register deployment workflow with Zod shape
    this.server.tool(
      'deployment',
      'Deployment workflow',
      deploymentWorkflowSchema.shape,
      async (params) => {
        this.deps.logger.info({ workflow: 'deployment' }, 'Executing deployment workflow');

        // Map MCP schema params to workflow params
        const generatedSessionId = params.sessionId || randomUUID();
        if (!params.sessionId) {
          this.deps.logger.debug(
            { sessionId: generatedSessionId },
            'Generated new session ID for deployment workflow',
          );
        }
        const workflowParams = {
          sessionId: generatedSessionId,
          imageId: params.imageId || 'latest',
          clusterConfig: {
            namespace: params.namespace || this.deps.config.kubernetes.namespace,
            context: params.clusterType || 'default',
          },
          deploymentOptions: {
            name: 'deployment',
            replicas: 1,
          },
        };

        const result = await deploymentWorkflow.execute(workflowParams, this.deps.logger, {
          deps: this.deps,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    );

    this.deps.logger.info('Workflow tools registered with McpServer');
  }

  /**
   * Register a dynamic resource template
   */
  public registerResourceTemplate(name: string, pattern: string): void {
    // This would integrate with SDK ResourceTemplate when available
    this.deps.logger.info({ name, pattern }, 'Resource template registered');
  }

  /**
   * Register a tool with Zod schema
   */
  public registerTool<T extends z.ZodType>(
    name: string,
    schema: T,
    handler: (params: z.infer<T>, logger: Logger) => Promise<any>,
  ): void {
    const tool: Tool = {
      name,
      description: `${name} tool`,
      execute: async (params: any, logger: Logger) => {
        const validated = schema.parse(params);
        return await handler(validated, logger);
      },
    };

    this.deps.toolRegistry.registerTool(tool);
    this.deps.logger.info({ tool: name }, 'Tool registered with Zod schema');
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.deps.logger.warn('Server is already running');
      return;
    }

    try {
      this.deps.logger.info('Starting MCP server connection...');

      // Setup handlers before connecting
      this.setupHandlers();

      // Connect the transport to the server
      await this.server.connect(this.transport);
      this.isRunning = true;

      this.deps.logger.info('MCP server connection established successfully');

      // Get current status from container for consistent logging
      const status = getContainerStatus(this.deps, this.isRunning);
      this.deps.logger.info(
        {
          ...status.stats,
          healthy: status.healthy,
        },
        'MCP server started',
      );
    } catch (error) {
      this.deps.logger.error({ error }, 'Failed to start server');
      throw error;
    }
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.deps.logger.warn('Server is not running');
      return;
    }

    try {
      await this.server.close();
      this.isRunning = false;
      this.deps.logger.info('Server stopped');
    } catch (error) {
      this.deps.logger.error({ error }, 'Failed to stop server');
      throw error;
    }
  }

  /**
   * Get server status
   * Delegates to the container for single source of truth
   */
  getStatus(): {
    running: boolean;
    tools: number;
    resources: number;
    prompts: number;
    workflows: number;
  } {
    const status = getContainerStatus(this.deps, this.isRunning);
    return {
      running: status.running,
      tools: status.stats.tools,
      resources: status.stats.resources,
      prompts: status.stats.prompts,
      workflows: status.stats.workflows,
    };
  }

  /**
   * Get list of available tools with their descriptions
   */
  getTools(): Array<{ name: string; description: string }> {
    return this.deps.toolRegistry.getAllTools().map((tool) => ({
      name: tool.name,
      description: tool.description || `${tool.name} tool`,
    }));
  }

  /**
   * Get list of workflow tools
   */
  getWorkflows(): Array<{ name: string; description: string }> {
    return [
      {
        name: 'start_workflow',
        description: 'Start a complete containerization workflow',
      },
      {
        name: 'workflow_status',
        description: 'Get the status of a running workflow',
      },
    ];
  }
}
