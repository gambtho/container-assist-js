/**
 * MCP Server implementation using the Model Context Protocol SDK.
 * Provides tools, resources, and prompts for containerization workflows.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  McpError,
  ErrorCode,
  type ProgressToken,
} from '@modelcontextprotocol/sdk/types.js';
import type { Logger } from 'pino';
import { z } from 'zod';
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
import { containerizationWorkflowSchema, deploymentWorkflowSchema } from '@mcp/server/schemas';
import { containerizationWorkflow } from '@workflows/containerization';
import { deploymentWorkflow } from '@workflows/deployment';
import type { Tool } from '@types';
import { getContainerStatus, type Deps } from '@app/container';
import { createProgressReporter, type ProgressNotifier } from '@mcp/server/progress';

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
          resources: {},
          prompts: {},
          tools: {},
        },
      },
    );

    this.transport = new StdioServerTransport();
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Register all tools using McpServer's tool() method
    this.registerAllTools();

    // Register workflows as tools
    this.registerWorkflowTools();

    // Resource handlers with SDK patterns
    (this.server as any).server.setRequestHandler(
      ListResourcesRequestSchema,
      async (request: any) => {
        const cursor = request.params?.cursor;
        const result = await this.deps.resourceManager.listResources(cursor);

        if (!result.ok) {
          return { resources: [] };
        }

        return result.value;
      },
    );

    (this.server as any).server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request: any) => {
        const { uri } = request.params;
        const result = await this.deps.resourceManager.readResource(uri);

        if (!result.ok) {
          throw new McpError(ErrorCode.InvalidRequest, result.error);
        }

        return result.value;
      },
    );

    // Prompt handlers with SDK-native patterns
    (this.server as any).server.setRequestHandler(
      ListPromptsRequestSchema,
      async (_request: any) => {
        return await this.deps.promptRegistry.listPrompts();
      },
    );

    (this.server as any).server.setRequestHandler(GetPromptRequestSchema, async (request: any) => {
      const { name, arguments: args = {} } = request.params;

      try {
        return await this.deps.promptRegistry.getPrompt(name, args);
      } catch (error) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          error instanceof Error ? error.message : `Prompt not found: ${name}`,
        );
      }
    });

    this.deps.logger.info('SDK-native handlers configured');
  }

  /**
   * Register all tools using McpServer's tool() method
   */
  private registerAllTools(): void {
    // Register each tool directly with the McpServer
    for (const [name, tool] of this.deps.toolRegistry.tools.entries()) {
      const schema = toolSchemas[name as keyof typeof toolSchemas];
      const toolShape = schema?.shape || {};

      this.server.tool(tool.name, toolShape, async (params: any, extras: any) => {
        const abortSignal = extras.signal;
        const progressToken = extras.progressToken; // May be available in request metadata

        this.deps.logger.info({ tool: name }, 'Executing tool via McpServer handler');

        try {
          // Create progress reporter using the helper
          const progressNotifier: ProgressNotifier = {
            sendProgress: (token, progress) => this.sendProgress(token, progress),
          };
          const reportProgress = createProgressReporter(
            progressToken,
            progressNotifier,
            this.deps.logger,
          );

          await reportProgress(0, `Starting ${name}...`);

          // Parameters are already validated by Zod schema
          await reportProgress(20, 'Parameters validated');

          // Execute tool with context including abort signal
          const result = await tool.execute(params, this.deps.logger, {
            promptRegistry: this.deps.promptRegistry,
            resourceManager: this.deps.resourceManager,
            sessionManager: this.deps.sessionManager,
            progressToken,
            abortSignal,
          });

          await reportProgress(90, 'Processing results...');

          if ('ok' in result) {
            if (result.ok) {
              await reportProgress(100, 'Complete');
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

          await reportProgress(100, 'Complete');
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
    // Register containerization workflow with schema
    this.server.tool(
      'containerization',
      toolSchemas.containerization?.shape || {},
      async (params, extras) => {
        const abortSignal = extras.signal;
        const progressToken = (extras as any).progressToken;

        const progressNotifier: ProgressNotifier = {
          sendProgress: (token, progress) => this.sendProgress(token, progress),
        };
        const reportProgress = createProgressReporter(
          progressToken,
          progressNotifier,
          this.deps.logger,
        );

        await reportProgress(10, 'Initializing containerization workflow...');

        // Map MCP schema params to workflow params
        const workflowParams = {
          ...params,
          projectPath: params.repoPath || this.deps.config.workspace.workspaceDir,
          sessionId: params.sessionId || 'default',
        };

        const result = await containerizationWorkflow.execute(workflowParams, this.deps.logger, {
          abortSignal,
          deps: this.deps,
        });
        await reportProgress(100, 'Complete');

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

    // Register deployment workflow with schema
    this.server.tool('deployment', toolSchemas.deployment?.shape || {}, async (params, extras) => {
      const abortSignal = extras.signal;
      const progressToken = (extras as any).progressToken;

      const progressNotifier: ProgressNotifier = {
        sendProgress: (token, progress) => this.sendProgress(token, progress),
      };
      const reportProgress = createProgressReporter(
        progressToken,
        progressNotifier,
        this.deps.logger,
      );

      await reportProgress(10, 'Initializing deployment workflow...');

      // Map MCP schema params to workflow params
      const workflowParams = {
        sessionId: params.sessionId || 'default',
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
        abortSignal,
        deps: this.deps,
      });
      await reportProgress(100, 'Complete');

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    });

    this.deps.logger.info('Workflow tools registered with McpServer');
  }

  /**
   * Send progress notification using underlying server
   */
  private async sendProgress(
    token: ProgressToken,
    progress: {
      progress: number;
      message?: string;
      total?: number;
    },
  ): Promise<void> {
    if (!token) return; // No progress token provided

    try {
      await (this.server as any).server.notification({
        method: 'notifications/progress',
        params: {
          progressToken: token,
          ...progress,
        },
      });
    } catch (error) {
      this.deps.logger.warn({ error, token }, 'Failed to send progress notification');
    }
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
      this.deps.logger.debug('Connecting transport and starting server...');

      // Connect the transport to the server
      // The SDK server will automatically handle the initialize request
      await this.server.connect(this.transport);
      this.isRunning = true;

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
