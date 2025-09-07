/**
 * MCP Server Implementation
 *
 * Provides the Model Context Protocol server that exposes all tools
 * and workflows to MCP clients via stdio transport.
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
} from '@modelcontextprotocol/sdk/types.js';
import type { Logger } from 'pino';
import { createLogger } from '../lib/logger';
import { createSessionManager } from '../lib/session';
import { getMCPRegistry } from './registry';
import { McpResourceManager } from './resources/manager.js';
import { ContainerizationResourceManager } from './resources/containerization-resource-manager.js';
import { PromptTemplatesManager } from '../application/tools/intelligent/ai-prompts.js';
import { DEFAULT_CACHE } from '../config/defaults.js';
import { extendServerCapabilities } from './server-extensions.js';
import type { MCPServer as IMCPServer, MCPServerOptions, MCPRequest, MCPResponse } from './types';

/**
 * Containerization Assist MCP Server
 *
 * Exposes all containerization and deployment tools via MCP protocol
 */
export class ContainerizationMCPServer implements IMCPServer {
  private server: Server;
  private transport: StdioServerTransport;
  private logger: Logger;
  private registry: ReturnType<typeof getMCPRegistry>;
  private _sessionManager: ReturnType<typeof createSessionManager>;
  private resourceManager: ContainerizationResourceManager;
  private promptTemplates: PromptTemplatesManager;
  private isRunning: boolean = false;

  constructor(logger?: Logger, options: MCPServerOptions = {}) {
    this.logger = logger ?? createLogger({ name: 'mcp-server' });
    this.registry = getMCPRegistry(this.logger);
    this._sessionManager = createSessionManager(this.logger);

    const baseResourceManager = new McpResourceManager(
      {
        defaultTtl: DEFAULT_CACHE.defaultTtl,
        maxResourceSize: DEFAULT_CACHE.maxFileSize,
        cacheConfig: { defaultTtl: DEFAULT_CACHE.defaultTtl },
      },
      this.logger,
    );
    this.resourceManager = new ContainerizationResourceManager(baseResourceManager, this.logger);

    this.promptTemplates = new PromptTemplatesManager(this.logger);

    this.server = new Server(
      {
        name: options.name ?? 'containerization-assist',
        version: options.version ?? '1.0.0',
      },
      {
        capabilities: options.capabilities ?? {
          tools: {
            listChanged: true,
          },
          resources: {
            listChanged: true,
          },
          prompts: {
            listChanged: true,
          },
        },
      },
    );

    this.transport = new StdioServerTransport();

    this.setupHandlers();

    extendServerCapabilities(this);
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.debug('Received tools/list request');

      const tools = this.registry.getAllTools();
      const workflows = this.registry.getAllWorkflowObjects();

      const allItems = [
        ...tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.schema,
        })),
        ...workflows.map((workflow) => ({
          name: workflow.name,
          description: workflow.description,
          inputSchema: workflow.schema,
        })),
      ];

      this.logger.info({ count: allItems.length }, 'Returning tool list');

      return { tools: allItems };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      this.logger.info({ tool: name }, 'Received tool execution request');

      try {
        const workflow = this.registry.getWorkflow(name);
        if (workflow) {
          this.logger.debug({ workflow: name }, 'Executing workflow');

          const result = await workflow.execute(args as object, this.logger);

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        const tool = this.registry.getTool(name);
        if (!tool) {
          this.logger.error({ tool: name }, 'Tool not found');

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    error: `Tool or workflow not found: ${name}`,
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        this.logger.debug({ tool: name, args }, 'Executing tool');

        const result = await tool.execute(args ?? {}, this.logger);

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
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(
                    {
                      error: result.error,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }
        }

        // Handle other response formats
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        this.logger.error(
          {
            tool: name,
            error: error instanceof Error ? error.message : error,
          },
          'Tool execution failed',
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  error: error instanceof Error ? error.message : 'Unknown error occurred',
                  tool: name,
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
    });

    // Handle resource listing requests
    this.server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
      this.logger.debug('Received resources/list request');

      try {
        const category = request.params?.cursor as any; // Optional category filter
        const listResult = await this.resourceManager.listResources(category);

        if (!listResult.ok) {
          this.logger.error({ error: listResult.error }, 'Failed to list resources');
          return {
            resources: [],
            nextCursor: undefined,
          };
        }

        this.logger.info({ count: listResult.value.resources.length }, 'Returning resource list');
        return listResult.value;
      } catch (error) {
        this.logger.error({ error }, 'Resource listing failed');
        return {
          resources: [],
          nextCursor: undefined,
        };
      }
    });

    // Handle resource reading requests
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      this.logger.info({ uri }, 'Received resource read request');

      try {
        const readResult = await this.resourceManager.readResource(uri);

        if (!readResult.ok) {
          this.logger.error({ uri, error: readResult.error }, 'Failed to read resource');
          throw new Error(readResult.error);
        }

        this.logger.debug(
          { uri, contentCount: readResult.value.contents.length },
          'Resource read successful',
        );
        return readResult.value;
      } catch (error) {
        this.logger.error({ uri, error }, 'Resource reading failed');
        throw error;
      }
    });

    // Handle prompt listing requests
    this.server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
      this.logger.debug('Received prompts/list request');

      try {
        const category = request.params?.cursor as string; // Optional category filter
        const listResult = await this.promptTemplates.listPrompts(category);

        if (!listResult.ok) {
          this.logger.error({ error: listResult.error }, 'Failed to list prompts');
          return {
            prompts: [],
            nextCursor: undefined,
          };
        }

        this.logger.info({ count: listResult.value.prompts.length }, 'Returning prompt list');
        return listResult.value;
      } catch (error) {
        this.logger.error({ error }, 'Prompt listing failed');
        return {
          prompts: [],
          nextCursor: undefined,
        };
      }
    });

    // Handle prompt get requests
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: promptArgs = {} } = request.params;
      this.logger.info({ name, args: promptArgs }, 'Received prompt get request');

      try {
        // Extract context from arguments if provided
        const context =
          promptArgs && Object.keys(promptArgs).length > 0
            ? {
                repositoryPath: promptArgs.repositoryPath as string,
                language: promptArgs.language as string,
                framework: promptArgs.framework as string,
                securityLevel: promptArgs.securityLevel as 'basic' | 'enhanced' | 'strict',
                environment: promptArgs.environment as 'development' | 'staging' | 'production',
              }
            : undefined;

        const getResult = await this.promptTemplates.getPrompt(name, context);

        if (!getResult.ok) {
          this.logger.error({ name, error: getResult.error }, 'Failed to get prompt');
          throw new Error(getResult.error);
        }

        this.logger.debug(
          {
            name,
            argumentCount: Array.isArray(getResult.value.arguments)
              ? getResult.value.arguments.length
              : 0,
          },
          'Prompt retrieved',
        );
        return getResult.value;
      } catch (error) {
        this.logger.error({ name, error }, 'Prompt get failed');
        throw error;
      }
    });

    this.logger.info('MCP request handlers configured');
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Server is already running');
      return;
    }

    try {
      // Validate registry before starting
      if (!this.registry.validateRegistry()) {
        throw new Error('Registry validation failed - not all tools are registered');
      }

      // Connect server to transport
      await this.server.connect(this.transport);

      this.isRunning = true;

      const stats = this.registry.getStats();
      this.logger.info(
        {
          tools: stats.tools,
          workflows: stats.workflows,
          sessionManager: !!this._sessionManager,
        },
        'MCP server started successfully',
      );
    } catch (error) {
      this.logger.error({ error }, 'Failed to start MCP server');
      throw error;
    }
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('Server is not running');
      return;
    }

    try {
      await this.server.close();
      this.isRunning = false;
      this.logger.info('MCP server stopped');
    } catch (error) {
      this.logger.error({ error }, 'Failed to stop MCP server');
      throw error;
    }
  }

  /**
   * Handle a raw MCP request (for testing/debugging)
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    this.logger.debug({ request }, 'Handling raw MCP request');

    try {
      // This is a basic handler for testing
      // The actual MCP protocol handling is done by the SDK

      if (request.method === 'tools/list') {
        const tools = this.registry.getAllTools();
        return {
          result: {
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.schema,
            })),
          },
          id: request.id ?? undefined,
        };
      }

      if (request.method === 'tools/call' && request.params) {
        const { name, arguments: args } = request.params as { name: string; arguments: object };
        const tool = this.registry.getTool(name);

        if (!tool) {
          return {
            error: {
              code: -32601,
              message: `Tool not found: ${name}`,
            },
            id: request.id ?? undefined,
          };
        }

        const result = await tool.execute(args, this.logger);

        return {
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          },
          id: request.id ?? undefined,
        };
      }

      return {
        error: {
          code: -32601,
          message: 'Method not found',
        },
        id: request.id ?? undefined,
      };
    } catch (error) {
      return {
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
        },
        id: request.id ?? undefined,
      };
    }
  }

  /**
   * Get server status
   */
  getStatus(): {
    running: boolean;
    tools: number;
    workflows: number;
    resources: number;
    prompts: number;
  } {
    const stats = this.registry.getStats();
    const resourceStats = this.resourceManager.getStats();
    const promptStats = this.promptTemplates.getStats();
    return {
      running: this.isRunning,
      tools: stats.tools,
      workflows: stats.workflows,
      resources: resourceStats.total,
      prompts: promptStats.total,
    };
  }

  /**
   * Get the enhanced resource manager
   */
  getResourceManager(): ContainerizationResourceManager {
    return this.resourceManager;
  }

  /**
   * Get the prompt templates manager
   */
  getPromptTemplatesManager(): PromptTemplatesManager {
    return this.promptTemplates;
  }
}
