import type { Logger } from 'pino';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { McpError, ErrorCode as MCPErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ServiceError, ErrorCode } from '../../../contracts/types/errors.js';
import type { Services } from '../../../services/index.js';
import type { ToolContext, ToolDescriptor } from '../tool-types.js';
import { convertToMcpError } from '../../errors/mcp-error-mapper.js';
import { withValidationAndLogging } from '../../errors/validation.js';
import { ToolNotImplementedError, suggestAlternativeTools } from '../../errors/tool-errors.js';
import { getImplementedTools, isToolImplemented, getToolInfo } from '../tool-manifest.js';

// Re-export types
export type { ToolDescriptor, ToolContext } from '../tool-types.js';

// Helper function to convert Zod schema to JSON Schema (simplified)
function zodToJsonSchema(_schema: any): any {
  return {
    type: 'object',
    properties: {},
    additionalProperties: true,
  };
}

export class ToolRegistry {
  private tools = new Map<string, ToolDescriptor>();
  private toolList: Array<{ name: string; description?: string; inputSchema?: unknown }> = [];
  private server: any = null;

  constructor(
    private readonly services: Services,
    private readonly logger: Logger,
  ) {
    this.logger = logger.child({ component: 'ToolRegistry' });
  }

  setServer(server: unknown): void {
    this.server = server;
    this.logger.info('MCP server attached to registry');
  }

  private logToolExecution(toolName: string, params: unknown): void {
    if (this.server != null) {
      this.server.log('info', 'Tool execution started', {
        tool: toolName,
        params: this.sanitizeParams(params) as any,
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

    try {
      this.tools.set(descriptor.name, descriptor);

      const tool: Tool = {
        name: descriptor.name,
        description: descriptor.description,
        inputSchema: zodToJsonSchema(descriptor.inputSchema) as {
          type: 'object';
          properties?: any;
        } & { [k: string]: unknown },
      };

      this.server.addTool(tool, async (params: unknown, context: unknown) => {
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

          const result = await validatedHandler(params as TInput);

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
      });

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
    const desc = descriptor as any;
    if (desc?.name == null || desc?.inputSchema == null || desc?.outputSchema == null) {
      throw new ServiceError(
        ErrorCode.VALIDATION_ERROR,
        'Tool must have name, inputSchema, and outputSchema',
      );
    }

    if (desc.inputSchema?.parse == null || desc.outputSchema?.parse == null) {
      throw new ServiceError(
        ErrorCode.VALIDATION_ERROR,
        'Input and output schemas must be valid Zod schemas',
      );
    }

    if (desc.execute != null && desc.handler == null) {
      desc.handler = desc.execute;
    }

    this.tools.set(desc.name, desc);

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
    const { name, arguments: args } = request as { name: string; arguments: unknown };

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
    }

    this.logToolExecution(name, args);

    const tool = this.tools.get(name);
    if (tool == null) {
      this.logger.warn({ tool: name }, 'Tool not found in registry');
      throw new McpError(MCPErrorCode.MethodNotFound, `Tool ${name} not registered`, {
        requestedTool: name,
        hint: 'Tool is implemented but not registered. This is a server configuration issue.',
      });
    }

    const baseContext = await this.createToolContext();

    try {
      const validated = tool.inputSchema.parse(args);

      const timeout = (tool as any)?.timeout ?? 30000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const executeFn = (tool as any).execute ?? tool.handler;
        const result = await executeFn(validated, {
          ...baseContext,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (result?.success && result?.data) {
          const validatedOutput = tool.outputSchema.parse(result.data);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(validatedOutput, null, 2),
              },
            ],
          };
        } else {
          throw convertToMcpError(result?.error ?? new Error('Unknown error'));
        }
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
  }

  async listTools(): Promise<{
    tools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
  }> {
    return { tools: this.toolList };
  }

  async handleSamplingRequest(request: unknown): Promise<unknown> {
    if ((this.services as any)?.mcpSampler != null) {
      const sampler = (this.services as any).mcpSampler;
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

    const aiService = this.services.ai as any;

    if (
      aiService == null ||
      typeof aiService.isAvailable !== 'function' ||
      !aiService.isAvailable()
    ) {
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
      const result = await aiService.generate(request);
      const resultText =
        typeof result === 'string'
          ? result
          : result && typeof result === 'object' && 'content' in result
            ? result.content
            : result && typeof result === 'object' && 'data' in result
              ? result.data
              : String(result) || 'No result';

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
      const allModules = [
        'ping',
        'server-status',
        '../analyze-repo/analyze-repo',
        '../resolve-base-images/resolve-base-images',
        '../generate-dockerfile/generate-dockerfile',
        '../fix-dockerfile/fix-dockerfile',
        '../build-image/build-image',
        '../scan-image/scan-image',
        '../tag-image/tag-image',
        '../push-image/push-image',
        '../generate-k8s-manifests/generate-k8s-manifests',
        '../prepare-cluster/prepare-cluster',
        '../deploy-application/deploy-application',
        '../verify-deployment/verify-deployment',
      ];

      for (const moduleName of allModules) {
        try {
          const module = await import(`./${moduleName}`);
          if (module.default != null) {
            if (this.server != null && module.default?.handler != null) {
              this.registerTool(module.default);
              this.logger.debug({ module: moduleName, type: 'mcp' }, 'Tool loaded');
            } else {
              this.logger.warn({ module: moduleName }, 'Tool missing handler property');
            }
          } else {
            this.logger.warn({ module: moduleName }, 'No default export');
          }
        } catch (error) {
          this.logger.error(
            {
              module: moduleName,
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
    const signal = logger ? (contextOrSignal as AbortSignal) : (contextOrSignal as AbortSignal);
    const contextLogger = logger ?? this.logger;

    const { WorkflowManager } = await import('../../workflow/manager');
    const { WorkflowOrchestrator } = await import('../../workflow/orchestrator');

    const workflowManager = new WorkflowManager(this.logger);
    const workflowOrchestrator = new WorkflowOrchestrator(
      this.services.session as any,
      this.logger,
    );

    const context: ToolContext = {
      server: this.server,
      progressToken: logger ? (contextOrSignal as any)?.progressToken : undefined,

      logger: contextLogger,
      sessionService: this.services.session as any,
      progressEmitter: this.services.events as any,
      dockerService: this.services.docker as any,
      kubernetesService: this.services.kubernetes as any,
      aiService: this.services.ai as any,
      eventPublisher: this.services.events as any,
      workflowManager,
      workflowOrchestrator,
      config: {
        session: { store: 'memory', ttl: 3600, maxSessions: 100 },
        server: { nodeEnv: 'development', logLevel: 'info', port: 3000, host: 'localhost' },
        mcp: {
          storePath: './data/sessions.db',
          sessionTTL: '24h',
          maxSessions: 100,
          enableMetrics: false,
          enableEvents: true,
        },
        workspace: { workspaceDir: process.cwd(), tempDir: './tmp', cleanupOnExit: true },
        infrastructure: {
          docker: {
            socketPath: '/var/run/docker.sock',
            registry: 'docker.io',
            host: 'localhost',
            port: 2376,
            timeout: 300000,
            apiVersion: '1.41',
          },
          kubernetes: {
            kubeconfig: '',
            namespace: 'default',
            context: '',
            timeout: 300000,
            dryRun: false,
          },
          scanning: {
            enabled: true,
            scanner: 'trivy' as const,
            severityThreshold: 'high' as const,
            failOnVulnerabilities: false,
            skipUpdate: false,
            timeout: 300000,
          },
          build: {
            enableCache: true,
            parallel: false,
            maxParallel: 4,
            buildArgs: {},
            labels: {},
            target: '',
            squash: false,
          },
          java: {
            defaultVersion: '17',
            defaultJvmHeapPercentage: 75,
            enableNativeImage: false,
            enableJmx: false,
            enableProfiling: false,
          },
        },
        aiServices: {
          ai: {
            apiKey: '',
            model: 'claude-3-sonnet-20241022',
            baseUrl: '',
            timeout: 30000,
            retryAttempts: 3,
            retryDelayMs: 1000,
            temperature: 0.1,
            maxTokens: 4096,
          },
          sampler: {
            mode: 'auto' as const,
            templateDir: './templates',
            cacheEnabled: true,
            retryAttempts: 3,
            retryDelayMs: 1000,
          },
          mock: {
            enabled: false,
            responsesDir: './mock-responses',
            deterministicMode: false,
            simulateLatency: false,
            errorRate: 0,
            latencyRange: { min: 100, max: 500 },
          },
        },
        logging: {
          level: 'info' as const,
          format: 'pretty' as const,
          destination: 'console' as const,
          filePath: './logs/app.log',
          maxFileSize: '10MB',
          maxFiles: 5,
          enableColors: true,
        },
        workflow: {
          mode: 'interactive' as const,
          autoRetry: true,
          maxRetries: 3,
          retryDelayMs: 5000,
          parallelSteps: false,
          skipOptionalSteps: false,
        },
        features: {
          aiEnabled: true,
          mockMode: false,
          enableMetrics: false,
          enableEvents: true,
          enablePerformanceMonitoring: false,
          enableDebugLogs: false,
          enableTracing: false,
          nonInteractive: false,
        },
      } as any,
      logPerformanceMetrics: (operation: string, duration: number, metadata?: unknown) => {
        try {
          this.server?.notification({
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

    if (this.services.ai && 'isAvailable' in this.services.ai && (this.services.ai as any).isAvailable?.() === true) {
      // Add AI components if available
    }

    if (signal != null) {
      context.signal = signal;
    }

    return context;
  }
}
