/**
 * MCP Server Implementation
 *
 * Provides the Model Context Protocol server that exposes all tools
 * and workflows to MCP clients via stdio transport.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Logger } from 'pino';
import { createLogger } from '../lib/logger.js';
import { getSessionManager } from '../lib/session.js';
import { getMCPRegistry } from './registry.js';
// Workflows are registered via the registry
// import { containerizationWorkflow } from '../workflows/containerization.js';
// import { deploymentWorkflow } from '../workflows/deployment.js';
import type {
  MCPServer as IMCPServer,
  MCPServerOptions,
  MCPRequest,
  MCPResponse,
} from './types.js';

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
  private _sessionManager: ReturnType<typeof getSessionManager>; // For future session-aware tool execution
  private isRunning: boolean = false;

  constructor(logger?: Logger, options: MCPServerOptions = {}) {
    this.logger = logger ?? createLogger({ name: 'mcp-server' });
    this.registry = getMCPRegistry(this.logger);
    this._sessionManager = getSessionManager(this.logger);

    // Initialize MCP server
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
        },
      },
    );

    // Initialize stdio transport
    this.transport = new StdioServerTransport();

    // Setup request handlers
    this.setupHandlers();
  }

  /**
   * Setup MCP request handlers
   */
  private setupHandlers(): void {
    // Handle tool listing requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.debug('Received tools/list request');

      const tools = this.registry.getAllTools();
      const workflows = this.registry.getAllWorkflowObjects();

      // Combine tools and workflows
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

    // Handle tool execution requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      this.logger.info({ tool: name }, 'Received tool execution request');

      try {
        // Check if it's a workflow first
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

        // Check if it's a tool
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

        // Execute the tool
        this.logger.debug({ tool: name, args }, 'Executing tool');

        const result = await tool.execute(args ?? {}, this.logger);

        // Handle Result type from tools
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
      // This is a simplified handler for testing
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
  getStatus(): { running: boolean; tools: number; workflows: number } {
    const stats = this.registry.getStats();
    return {
      running: this.isRunning,
      tools: stats.tools,
      workflows: stats.workflows,
    };
  }
}

/**
 * Factory function to create and start an MCP server
 */
export async function startMCPServer(
  logger?: Logger,
  options?: MCPServerOptions,
): Promise<ContainerizationMCPServer> {
  const server = new ContainerizationMCPServer(logger, options);
  await server.start();
  return server;
}

/**
 * Export the server class as default
 */
export default ContainerizationMCPServer;
