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
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import type { Logger } from 'pino';
import { createLogger } from '../../lib/logger.js';
import { createSessionManager } from '../../lib/session.js';
import {
  ensureInitialized,
  getTool,
  getAllTools,
  getWorkflow,
  getAllWorkflows,
  getRegistryStats,
} from './registry.js';
import {
  createSDKResourceManager,
  createResourceContext,
  type SDKResourceManager,
} from '../resources/manager.js';
import { SDKPromptRegistry } from '../prompts/sdk-prompt-registry.js';
import { DEFAULT_CACHE } from '../../config/defaults.js';
import { extendServerCapabilities } from './middleware.js';
import { createMCPAIOrchestrator, type MCPAIOrchestrator } from '../ai/orchestrator.js';
import type {
  MCPServer as IMCPServer,
  MCPServerOptions,
  MCPRequest,
  MCPResponse,
} from '../core/types.js';

/**
 * Containerization Assist MCP Server
 *
 * Exposes all containerization and deployment tools via MCP protocol
 */
export class ContainerizationMCPServer implements IMCPServer {
  private server: Server;
  private transport: StdioServerTransport;
  private logger: Logger;
  private _sessionManager: ReturnType<typeof createSessionManager>;
  private resourceManager: SDKResourceManager;
  private promptRegistry: SDKPromptRegistry;
  private aiOrchestrator: MCPAIOrchestrator;
  private isRunning: boolean = false;

  constructor(logger?: Logger, options: MCPServerOptions = {}) {
    this.logger = logger ?? createLogger({ name: 'mcp-server' });
    this._sessionManager = createSessionManager(this.logger);

    const resourceContext = createResourceContext(
      {
        defaultTtl: DEFAULT_CACHE.defaultTtl,
        maxResourceSize: DEFAULT_CACHE.maxFileSize,
        cacheConfig: { defaultTtl: DEFAULT_CACHE.defaultTtl },
      },
      this.logger,
      undefined, // Use default cache
    );
    this.resourceManager = createSDKResourceManager(resourceContext);

    this.promptRegistry = new SDKPromptRegistry(this.logger);

    // Initialize AI orchestrator with integrated services
    this.aiOrchestrator = createMCPAIOrchestrator(this.logger, {
      promptRegistry: this.promptRegistry,
    });

    // Initialize tools and workflows with enhanced context
    ensureInitialized(this.logger, {
      promptRegistry: this.promptRegistry,
      sessionManager: this._sessionManager,
    });

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

      const tools = getAllTools();
      const workflows = getAllWorkflows();

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

    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      const { name, arguments: args } = request.params;

      this.logger.info({ tool: name }, 'Received tool execution request');

      try {
        const workflow = getWorkflow(name);
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

        const tool = getTool(name);
        if (!tool) {
          this.logger.error({ tool: name }, 'Tool not found');
          throw new McpError(ErrorCode.MethodNotFound, `Tool or workflow not found: ${name}`);
        }

        this.logger.debug({ tool: name, args }, 'Executing tool');

        // Pass enhanced MCP context with AI orchestrator
        const mcpContext = {
          promptRegistry: this.promptRegistry,
          resourceManager: this.resourceManager,
          aiOrchestrator: this.aiOrchestrator,
        };

        const result = await tool.execute(args ?? {}, this.logger, mcpContext);

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

        // Re-throw MCP errors as-is
        if (error instanceof McpError) {
          throw error;
        }

        // Convert other errors to MCP errors
        throw new McpError(
          ErrorCode.InternalError,
          error instanceof Error ? error.message : 'Unknown error occurred',
          { tool: name },
        );
      }
    });

    // Handle resource listing requests
    this.server.setRequestHandler(ListResourcesRequestSchema, async (request: any) => {
      this.logger.debug('Received resources/list request');

      try {
        const category = request.params?.cursor; // Optional category filter
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
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
      const { uri } = request.params;
      this.logger.info({ uri }, 'Received resource read request');

      try {
        const readResult = await this.resourceManager.readResource(uri);

        if (!readResult.ok) {
          this.logger.error({ uri, error: readResult.error }, 'Failed to read resource');
          return {
            uri,
            mimeType: 'text/plain',
            text: `Error reading resource: ${readResult.error}`,
          };
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
    this.server.setRequestHandler(ListPromptsRequestSchema, async (request: any) => {
      this.logger.debug('Received prompts/list request');

      try {
        const category = request.params?.cursor as string; // Optional category filter
        const listResult = await this.promptRegistry.listPrompts(category);

        this.logger.info({ count: listResult.prompts.length }, 'Returning prompt list');
        return listResult;
      } catch (error) {
        this.logger.error({ error }, 'Prompt listing failed');
        throw new McpError(ErrorCode.InternalError, 'Failed to list prompts');
      }
    });

    // Handle prompt get requests
    this.server.setRequestHandler(GetPromptRequestSchema, async (request: any) => {
      const { name, arguments: promptArgs = {} } = request.params;
      this.logger.info({ name, args: promptArgs }, 'Received prompt get request');

      try {
        const getResult = await this.promptRegistry.getPrompt(name, promptArgs);

        this.logger.debug(
          {
            name,
            argumentCount: Array.isArray(getResult.arguments) ? getResult.arguments.length : 0,
            messageCount: Array.isArray(getResult.messages) ? getResult.messages.length : 0,
          },
          'Prompt retrieved',
        );
        return getResult;
      } catch (error) {
        this.logger.error({ name, error }, 'Prompt get failed');
        throw new McpError(ErrorCode.MethodNotFound, `Prompt not found: ${name}`);
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
      // Check registry stats
      const registryStats = getRegistryStats();
      if (registryStats.tools === 0) {
        this.logger.error('No tools registered - registry initialization failed');
        return;
      }

      // Connect server to transport
      await this.server.connect(this.transport);

      this.isRunning = true;

      const stats = getRegistryStats();
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
        const tools = getAllTools();
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
        const tool = getTool(name);

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
    const stats = getRegistryStats();
    const resourceStats = this.resourceManager.getStats();
    const promptStats = this.promptRegistry.getPromptsByCategory('').length; // Get total count
    return {
      running: this.isRunning,
      tools: stats.tools,
      workflows: stats.workflows,
      resources: resourceStats.total,
      prompts: promptStats,
    };
  }

  /**
   * Get the resource manager
   */
  getResourceManager(): SDKResourceManager {
    return this.resourceManager;
  }

  /**
   * Get the SDK prompt registry
   */
  getPromptRegistry(): SDKPromptRegistry {
    return this.promptRegistry;
  }
}
