/**
 * MCP Server implementation using the Model Context Protocol SDK.
 * Provides tools, resources, and prompts for containerization workflows.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
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
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createLogger } from '../../lib/logger';
import { toolSchemas } from '../core/schemas';
import { createSessionManager } from '../../lib/session';
import { createToolRegistry, createAIToolRegistry } from '../tools/registry';
import { containerizationWorkflow } from '../../workflows/containerization';
import { deploymentWorkflow } from '../../workflows/deployment';
import {
  createSDKResourceManager,
  createResourceContext,
  type SDKResourceManager,
} from '../resources/manager';
import { MCPPromptRegistry } from '../prompts/mcp-prompt-registry';
import { DEFAULT_CACHE } from '../../config/defaults';
import type { Tool } from '../../core/types';

/**
 * MCP Server class that integrates containerization tools with the MCP protocol.
 * Handles tool invocation, resource management, and prompt templates.
 */
export class MCPServer {
  private server: Server;
  private transport: StdioServerTransport;
  private logger: Logger;
  private sessionManager: ReturnType<typeof createSessionManager>;
  private resourceManager: SDKResourceManager;
  private promptRegistry: MCPPromptRegistry;
  private toolRegistry: Map<string, Tool>;
  private isRunning: boolean = false;

  constructor(
    logger?: Logger,
    options?: {
      name?: string;
      version?: string;
      aiService?: any;
    },
  ) {
    this.logger = logger ?? createLogger({ name: 'mcp-server' });
    this.sessionManager = createSessionManager(this.logger);

    // Initialize prompt registry
    this.promptRegistry = new MCPPromptRegistry(this.logger);

    // Initialize resource manager with SDK patterns
    const resourceContext = createResourceContext(
      {
        defaultTtl: DEFAULT_CACHE.defaultTtl,
        maxResourceSize: DEFAULT_CACHE.maxFileSize,
        cacheConfig: { defaultTtl: DEFAULT_CACHE.defaultTtl },
      },
      this.logger,
    );
    this.resourceManager = createSDKResourceManager(resourceContext);

    // Initialize tool registry
    this.toolRegistry = options?.aiService
      ? createAIToolRegistry(this.logger, {
          mcpHostAI: options.aiService,
          promptRegistry: this.promptRegistry,
          sessionManager: this.sessionManager,
        })
      : createToolRegistry(this.logger, {
          sessionManager: this.sessionManager,
        });

    // Create SDK server with capabilities
    this.server = new Server(
      {
        name: options?.name ?? 'containerization-assist',
        version: options?.version ?? '2.0.0',
      },
      {
        capabilities: {
          tools: {
            listChanged: true,
          },
          resources: {
            listChanged: true,
            subscribe: true,
          },
          prompts: {
            listChanged: true,
          },
          logging: {},
        },
      },
    );

    this.transport = new StdioServerTransport();
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.debug('Listing tools with Zod schemas');

      const tools = Array.from(this.toolRegistry.values()).map((tool) => {
        const schema = toolSchemas[tool.name as keyof typeof toolSchemas];
        const jsonSchema = schema
          ? zodToJsonSchema(schema, {
              target: 'openApi3',
              $refStrategy: 'none',
            })
          : { type: 'object', properties: {}, required: [] };

        return {
          name: tool.name,
          description: tool.description || `${tool.name} tool`,
          inputSchema: jsonSchema,
        };
      });

      const workflows = [
        {
          name: 'containerization',
          description: 'Complete containerization workflow',
          inputSchema: zodToJsonSchema(toolSchemas.containerization),
        },
        {
          name: 'deployment',
          description: 'Kubernetes deployment workflow',
          inputSchema: zodToJsonSchema(toolSchemas.deployment),
        },
      ];

      return { tools: [...tools, ...workflows] };
    });

    // Tool execution with progress reporting
    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      const { name, arguments: args } = request.params;
      const progressToken = request.params._meta?.progressToken;

      this.logger.info({ tool: name }, 'Executing tool');

      try {
        // Progress reporting helper
        const reportProgress = async (progress: number, message?: string): Promise<void> => {
          if (progressToken) {
            await this.sendProgress(progressToken, {
              progress,
              ...(message && { message }),
            });
          }
        };

        await reportProgress(0, `Starting ${name}...`);

        // Check if it's a workflow
        if (name === 'containerization' || name === 'deployment') {
          await reportProgress(10, `Initializing ${name} workflow...`);

          const workflow =
            name === 'containerization' ? containerizationWorkflow : deploymentWorkflow;

          const result = await workflow.execute(args, this.logger);

          await reportProgress(100, 'Complete');

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        // Execute regular tool
        const tool = this.toolRegistry.get(name);
        if (!tool) {
          throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
        }

        await reportProgress(10, `Executing ${name}...`);

        // Validate with Zod schema if available
        const schema = toolSchemas[name as keyof typeof toolSchemas];
        if (schema) {
          try {
            schema.parse(args);
            await reportProgress(20, 'Parameters validated');
          } catch (error) {
            if (error instanceof z.ZodError) {
              throw new McpError(
                ErrorCode.InvalidParams,
                `Invalid parameters: ${error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
              );
            }
          }
        }

        // Execute tool with context
        const result = await tool.execute(args ?? {}, this.logger, {
          promptRegistry: this.promptRegistry,
          resourceManager: this.resourceManager,
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
        this.logger.error({ tool: name, error }, 'Tool execution failed');

        if (error instanceof McpError) {
          throw error;
        }

        throw new McpError(
          ErrorCode.InternalError,
          error instanceof Error ? error.message : 'Unknown error occurred',
        );
      }
    });

    // Resource handlers with SDK patterns
    this.server.setRequestHandler(ListResourcesRequestSchema, async (request: any) => {
      const cursor = request.params?.cursor;
      const result = await this.resourceManager.listResources(cursor);

      if (!result.ok) {
        return { resources: [] };
      }

      return result.value;
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
      const { uri } = request.params;
      const result = await this.resourceManager.readResource(uri);

      if (!result.ok) {
        throw new McpError(ErrorCode.InvalidRequest, result.error);
      }

      return result.value;
    });

    // Prompt handlers with context-aware completions
    this.server.setRequestHandler(ListPromptsRequestSchema, async (_request: any) => {
      const promptNames = this.promptRegistry.listPrompts();
      return {
        prompts: promptNames.map((name) => {
          const info = this.promptRegistry.getPromptInfo(name);
          return {
            name,
            description: info?.description || `${name} prompt`,
            arguments: info?.arguments || [],
          };
        }),
      };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request: any) => {
      const { name, arguments: args = {} } = request.params;

      try {
        return await this.promptRegistry.getPrompt(name, args);
      } catch (error) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          error instanceof Error ? error.message : `Prompt not found: ${name}`,
        );
      }
    });

    this.logger.info('SDK-native handlers configured');
  }

  /**
   * Send progress notification
   */
  private async sendProgress(
    token: ProgressToken,
    progress: {
      progress: number;
      message?: string;
      total?: number;
    },
  ): Promise<void> {
    try {
      await this.server.notification({
        method: 'notifications/progress',
        params: {
          progressToken: token,
          ...progress,
        },
      });
    } catch (error) {
      this.logger.warn({ error, token }, 'Failed to send progress notification');
    }
  }

  /**
   * Register a dynamic resource template
   */
  public registerResourceTemplate(name: string, pattern: string): void {
    // This would integrate with SDK ResourceTemplate when available
    this.logger.info({ name, pattern }, 'Resource template registered');
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

    this.toolRegistry.set(name, tool);
    this.logger.info({ tool: name }, 'Tool registered with Zod schema');
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Server is already running');
      return;
    }

    try {
      await this.server.connect(this.transport);
      this.isRunning = true;

      this.logger.info(
        {
          tools: this.toolRegistry.size,
          workflows: 2,
          resources: await this.getResourceCount(),
          prompts: this.promptRegistry.listPrompts().length,
        },
        'SDK-native MCP server started',
      );
    } catch (error) {
      this.logger.error({ error }, 'Failed to start server');
      throw error;
    }
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('Server is not running');
      return;
    }

    try {
      await this.server.close();
      this.isRunning = false;
      this.logger.info('Server stopped');
    } catch (error) {
      this.logger.error({ error }, 'Failed to stop server');
      throw error;
    }
  }

  /**
   * Get resource count
   */
  private async getResourceCount(): Promise<number> {
    const stats = this.resourceManager.getStats();
    return stats.total;
  }

  /**
   * Get server status
   */
  getStatus(): {
    running: boolean;
    tools: number;
    resources: number;
    prompts: number;
    workflows: number;
  } {
    return {
      running: this.isRunning,
      tools: this.toolRegistry.size,
      resources: this.resourceManager.getStats().total,
      prompts: this.promptRegistry.listPrompts().length,
      workflows: 2,
    };
  }
}
