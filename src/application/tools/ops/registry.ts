import type { Logger } from 'pino';
import { z } from 'zod';
import { McpError, ErrorCode as MCPErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ServiceError, ErrorCode } from '../../../domain/types/errors';
import type { Services } from '../../../services/index';

// MCP Server interface based on usage
interface McpServer {
  log?: (level: string, message: string, data: Record<string, unknown>) => void;
  registerTool: (
    name: string,
    definition: {
      title: string;
      description?: string;
      inputSchema: unknown;
    },
    handler: (
      params: unknown,
      context: unknown,
    ) => Promise<{
      content: Array<{ type: 'text'; text: string }>;
    }>,
  ) => void;
  notification?: (params: { method: string; params: Record<string, unknown> }) => void;
}

import type { ToolContext, ToolDescriptor } from '../tool-types';
import { convertToMcpError } from '../../errors/mcp-error-mapper';
import { withValidationAndLogging } from '../../errors/validation';
import { ToolNotImplementedError, suggestAlternativeTools } from '../../errors/tool-errors';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { getImplementedTools, isToolImplemented, getToolInfo } from '../tool-manifest';
import type { ApplicationConfig } from '../../../config/types';

// Re-export types
export type { ToolDescriptor, ToolContext } from '../tool-types';

export class ToolRegistry {
  private tools = new Map<string, ToolDescriptor>();
  private toolList: Array<{ name: string; description?: string; inputSchema?: unknown }> = [];
  private server: McpServer | null = null;

  constructor(
    private readonly services: Services,
    private readonly logger: Logger,
    private readonly config: ApplicationConfig,
  ) {
    this.logger = logger.child({ component: 'ToolRegistry' });
  }

  setServer(server: McpServer): void {
    this.server = server;
    this.logger.info('MCP server attached to registry');
  }

  private logToolExecution(toolName: string, params: unknown): void {
    if (this.server != null && 'log' in this.server && typeof this.server.log === 'function') {
      this.server.log('info', 'Tool execution started', {
        tool: toolName,
        params: this.sanitizeParams(params),
        timestamp: new Date().toISOString(),
      });
    }
  }

  private sanitizeParams(params: unknown): unknown {
    if (params == null || typeof params !== 'object') {
      return params;
    }

    const sanitized: Record<string, unknown> = { ...(params as Record<string, unknown>) };
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'credential'];

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  registerTool<TInput, TOutput>(descriptor: ToolDescriptor<TInput, TOutput>): void {
    if (this.server == null) {
      throw new ServiceError(
        ErrorCode.DependencyNotInitialized,
        'MCP server not attached to registry. Call setServer() first.',
      );
    }

    // Check for duplicate tool registration
    if (this.tools.has(descriptor.name)) {
      throw new ServiceError(
        ErrorCode.InvalidInput,
        `Tool '${descriptor.name}' is already registered`,
      );
    }

    try {
      this.tools.set(descriptor.name, descriptor);

      this.server.registerTool(
        descriptor.name,
        {
          title: descriptor.name,
          description: descriptor.description,
          inputSchema: descriptor.inputSchema,
        },
        async (params: unknown, context: unknown) => {
          const toolLogger = this.logger.child({ tool: descriptor.name });

          this.logToolExecution(descriptor.name, params);

          try {
            const toolContext = await this.createToolContext(context, toolLogger);

            const validatedHandler = withValidationAndLogging(
              descriptor.inputSchema as z.ZodType<TInput>,
              descriptor.outputSchema,
              async (validatedInput: TInput, _logger) => {
                return await descriptor.handler(validatedInput, toolContext);
              },
              toolLogger,
              descriptor.name,
            );

            const result = (await validatedHandler(params)) as TOutput;

            const responseText = `✅ **${descriptor.name} completed**\n${JSON.stringify(result, null, 2)}`;

            return {
              content: [
                {
                  type: 'text' as const,
                  text: responseText,
                },
              ],
            };
          } catch (error) {
            toolLogger.error({ error }, 'Tool execution failed');

            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `❌ **${descriptor.name} failed**: ${errorMessage}`,
                },
              ],
            };
          }
        },
      );

      this.toolList.push({
        name: descriptor.name,
        description: descriptor.description,
        inputSchema: zodToJsonSchema(descriptor.inputSchema),
      });

      this.logger.info(
        {
          tool: descriptor.name,
          category: descriptor.category,
          hasChainHint: !!descriptor.chainHint,
          registrationMethod: 'mcp-sdk',
        },
        'MCP tool registered',
      );
    } catch (error) {
      this.logger.error({ error, tool: descriptor.name }, 'Failed to register MCP tool');
      throw convertToMcpError(error);
    }
  }

  register(descriptor: unknown): void {
    const desc = descriptor as {
      name?: string;
      inputSchema?: { parse?: (data: unknown) => unknown };
      outputSchema?: { parse?: (data: unknown) => unknown };
      handler?: unknown;
      execute?: unknown;
      description?: string;
      category?: string;
      chainHint?: unknown;
    };

    if (!desc?.name || !desc?.inputSchema || !desc?.outputSchema) {
      throw new ServiceError(
        ErrorCode.VALIDATION_ERROR,
        'Tool must have name, inputSchema, and outputSchema',
      );
    }

    if (!desc.inputSchema?.parse || !desc.outputSchema?.parse) {
      throw new ServiceError(
        ErrorCode.VALIDATION_ERROR,
        'Input and output schemas must be valid Zod schemas',
      );
    }

    if (desc.execute && !desc.handler) {
      desc.handler = desc.execute;
    }

    // Check for duplicate tool registration
    if (this.tools.has(desc.name)) {
      throw new ServiceError(ErrorCode.InvalidInput, `Tool '${desc.name}' is already registered`);
    }

    this.tools.set(desc.name, desc as ToolDescriptor);

    // Add to toolList for listTools() method
    const toolInfo: { name: string; description?: string; inputSchema: unknown } = {
      name: desc.name,
      inputSchema: zodToJsonSchema(desc.inputSchema as z.ZodType),
    };
    if (desc.description) {
      toolInfo.description = desc.description;
    }

    // Check for duplicate in toolList as well (extra safety)
    if (!this.toolList.find((tool) => tool.name === desc.name)) {
      this.toolList.push(toolInfo);
    }

    this.logger.info(
      {
        tool: desc.name,
        category: desc.category,
        hasChainHint: Boolean(desc.chainHint),
      },
      'Tool registered',
    );
  }

  async handleToolCall(request: unknown): Promise<unknown> {
    try {
      const { name, arguments: args } = request as { name: string; arguments: unknown };

      // First check if tool is directly registered (e.g., test tools)
      if (!this.tools.has(name)) {
        // Then check if it should be implemented according to manifest
        if (!isToolImplemented(name)) {
          const availableTools = getImplementedTools();
          const suggestions = suggestAlternativeTools(name, availableTools);

          const toolInfo = getToolInfo(name);
          let errorMessage = `Tool '${name}' is not implemented`;

          if (toolInfo != null) {
            errorMessage += `. Status: ${toolInfo.status}`;
            if (toolInfo.notes != null && toolInfo.notes !== '') {
              errorMessage += `. Note: ${toolInfo.notes}`;
            }
          }

          this.logger.warn(
            {
              tool: name,
              availableTools: availableTools.length,
              suggestions,
            },
            'Unimplemented tool requested',
          );

          throw new ToolNotImplementedError(errorMessage, name, {
            availableTools,
            suggestedAlternatives: suggestions,
          });
        } else {
          // Tool is in manifest but not registered - configuration issue
          this.logger.warn({ tool: name }, 'Tool not found in registry');
          throw new McpError(MCPErrorCode.MethodNotFound, `Tool ${name} not registered`, {
            requestedTool: name,
            hint: 'Tool is implemented but not registered. This is a server configuration issue.',
          });
        }
      }

      this.logToolExecution(name, args);

      const tool = this.tools.get(name)!; // We already checked existence above

      const baseContext = await this.createToolContext();

      try {
        const validated = tool.inputSchema.parse(args) as Record<string, unknown>;

        const toolWithTimeout = tool as ToolDescriptor & { timeout?: number };
        const timeout = toolWithTimeout.timeout ?? 30000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
          const toolWithExecute = tool as ToolDescriptor & {
            execute?: (...args: unknown[]) => unknown;
          };
          const executeFn = toolWithExecute.execute ?? tool.handler;
          const result = await executeFn(validated, {
            ...baseContext,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          // Tool handlers return results directly, not wrapped in {success, data}
          const validatedOutput = tool.outputSchema.parse(result) as unknown;

          return {
            success: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify(validatedOutput, null, 2),
              },
            ],
          };
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error) {
        this.logger.error({ error, tool: name }, 'Tool execution error');

        if (error instanceof z.ZodError) {
          throw new McpError(MCPErrorCode.InvalidParams, 'Input validation failed', {
            issues: error.issues.map((e) => ({
              path: e.path.join('.'),
              message: e.message,
              code: e.code,
            })),
          });
        }

        throw convertToMcpError(error);
      }
    } catch (error) {
      // Handle all errors by converting them to structured MCP responses
      this.logger.error({ error }, 'handleToolCall failed');

      if (error instanceof ToolNotImplementedError) {
        return {
          success: false,
          content: [
            {
              type: 'text',
              text: `Tool ${error.toolName} not found`,
            },
          ],
        };
      }

      if (error instanceof McpError) {
        return {
          success: false,
          content: [
            {
              type: 'text',
              text: `Validation error: ${error.message}`,
            },
          ],
        };
      }

      // Check for MCP error-like objects (which may not be instanceof McpError)
      if (error && typeof error === 'object' && 'message' in error && 'code' in error) {
        return {
          success: false,
          content: [
            {
              type: 'text',
              text: `Error: ${String(error.message)}`,
            },
          ],
        };
      }

      // Generic error handling
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
      };
    }
  }

  listTools(): {
    tools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
  } {
    return { tools: this.toolList };
  }

  async handleSamplingRequest(request: unknown): Promise<unknown> {
    const servicesWithSampler = this.services as Services & {
      mcpSampler?: {
        sample: (request: unknown) => Promise<{
          success?: boolean;
          content?: unknown;
          error?: string;
        }>;
      };
    };

    if (servicesWithSampler.mcpSampler) {
      const sampler = servicesWithSampler.mcpSampler;
      try {
        const result = await sampler.sample(request);
        if (result?.success) {
          return {
            success: true,
            content: [
              {
                type: 'text',
                text:
                  typeof result?.content === 'string'
                    ? result.content
                    : JSON.stringify(result?.content),
              },
            ],
          };
        } else {
          return {
            success: false,
            content: [
              {
                type: 'text',
                text: `Sampling error: ${result?.error ?? 'Unknown error'}`,
              },
            ],
          };
        }
      } catch (error) {
        return {
          success: false,
          content: [
            {
              type: 'text',
              text: `Sampling error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }

    const aiService = this.services.ai;

    if (!aiService || typeof aiService.isAvailable !== 'function' || !aiService.isAvailable()) {
      return {
        success: false,
        content: [
          {
            type: 'text',
            text: 'AI sampling not available',
          },
        ],
      };
    }

    try {
      interface AiServiceWithGenerate {
        generate: (request: unknown) => Promise<unknown>;
      }
      const result = await (aiService as unknown as AiServiceWithGenerate).generate(request);
      let resultText = 'No result';

      if (typeof result === 'string') {
        resultText = result;
      } else if (result && typeof result === 'object') {
        const objResult = result as Record<string, unknown>;
        if ('content' in objResult && typeof objResult.content === 'string') {
          resultText = objResult.content;
        } else if ('data' in objResult && typeof objResult.data === 'string') {
          resultText = objResult.data;
        } else {
          resultText = JSON.stringify(result);
        }
      } else {
        resultText = String(result);
      }

      return {
        success: true,
        content: [
          {
            type: 'text',
            text: resultText,
          },
        ],
      };
    } catch (error) {
      this.logger.error({ error }, 'Sampling error');
      return {
        success: false,
        content: [
          {
            type: 'text',
            text: `Sampling error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }

  async registerAll(): Promise<void> {
    try {
      // Import tools statically to ensure they're included in the bundle
      const pingTool = await import('./ping.js');
      const serverStatusTool = await import('./server-status.js');

      const tools = [
        { name: 'ping', module: pingTool },
        { name: 'server-status', module: serverStatusTool },
      ];

      for (const { name, module } of tools) {
        try {
          if (module.default != null) {
            if (this.server != null && module.default?.handler != null) {
              this.registerTool(module.default as ToolDescriptor);
              this.logger.debug({ module: name, type: 'mcp' }, 'Tool loaded');
            } else if (
              module.default?.handler != null ||
              (module.default as { execute?: unknown })?.execute != null
            ) {
              // Fallback to basic registration for testing
              this.register(module.default);
              this.logger.debug({ module: name, type: 'basic' }, 'Tool loaded');
            } else {
              this.logger.warn({ module: name }, 'Tool missing handler property');
            }
          } else {
            this.logger.warn({ module: name }, 'No default export');
          }
        } catch (error) {
          this.logger.error(
            {
              module: name,
              error: error instanceof Error ? error.message : String(error),
            },
            'Failed to load tool handler',
          );
        }
      }

      this.logger.info(
        {
          toolCount: this.tools.size,
        },
        'All tools registered',
      );
    } catch (error) {
      this.logger.error({ error }, 'Failed to register tools');
      throw new ServiceError(
        ErrorCode.ServiceUnavailable,
        'Failed to register tool handlers',
        error instanceof Error ? error : undefined,
      );
    }
  }

  getToolCount(): number {
    return this.tools.size;
  }

  getTool(name: string): ToolDescriptor | undefined {
    return this.tools.get(name);
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  private async createToolContext(
    contextOrSignal?: unknown,
    logger?: Logger,
  ): Promise<ToolContext> {
    // When logger is provided, contextOrSignal is interpreted as AbortSignal
    // Otherwise, contextOrSignal could be either signal or context (legacy support)
    const signal = contextOrSignal as AbortSignal | undefined;
    const contextLogger = logger ?? this.logger;

    const { WorkflowManager } = await import('../../workflow/manager');
    const { WorkflowOrchestrator } = await import('../../workflow/orchestrator');

    const workflowManager = new WorkflowManager(this.logger);
    const workflowOrchestrator = new WorkflowOrchestrator(
      this.services.session as any,
      this.logger,
    );

    const contextWithToken = contextOrSignal as { progressToken?: unknown } | undefined;

    // Use EventEmitter directly - no need for adapters
    const progressEmitter = this.services.events;
    const eventPublisher = this.services.events;

    const context: ToolContext = {
      server: this.server,
      ...(logger && contextWithToken?.progressToken
        ? { progressToken: String(contextWithToken.progressToken) }
        : {}),

      logger: contextLogger,
      sessionService: this.services.session,
      progressEmitter,
      dockerService: this.services.docker,
      kubernetesService: this.services.kubernetes,
      aiService: this.services.ai,
      eventPublisher,
      workflowManager,
      workflowOrchestrator,
      config: this.config,
      toolRegistry: this,
      logPerformanceMetrics: (operation: string, duration: number, metadata?: unknown) => {
        try {
          this.server?.notification?.({
            method: 'notifications/message',
            params: {
              level: 'info',
              logger: 'tool-performance',
              data: {
                operation,
                duration,
                metadata: metadata ?? {},
                timestamp: new Date().toISOString(),
              },
            },
          });
        } catch (error) {
          contextLogger.info(
            {
              operation,
              duration,
              metadata: metadata ?? {},
            },
            'Performance metrics',
          );
        }
      },
    };

    if (
      this.services.ai &&
      'isAvailable' in this.services.ai &&
      typeof this.services.ai.isAvailable === 'function' &&
      this.services.ai.isAvailable() === true
    ) {
      // Add AI components if available
    }

    if (signal != null) {
      context.signal = signal;
    }

    return context;
  }
}
