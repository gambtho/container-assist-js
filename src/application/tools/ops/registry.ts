/**
 * Registry - MCP SDK Compatible Version
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Logger } from 'pino';
import type { Tool } from '@modelcontextprotocol/sdk/types';
// Server type not exported from SDK
import { McpError, ErrorCode as MCPErrorCode } from '@modelcontextprotocol/sdk/types';
import { ServiceError, ErrorCode } from '../../../contracts/types/errors.js';
import type { Services } from '../../../services/index.js';
import type {
  ToolHandler,
  ToolContext as HandlerContext,
  ToolDescriptor,
  MCPToolDescriptor,
  MCPToolContext
} from '../tool-types.js';
import { convertToMcpError } from '../../errors/mcp-error-mapper.js';
import { withValidationAndLogging } from '../../errors/validation.js';

// Re-export types for compatibility
export type { ToolHandler, ToolDescriptor };
export type ToolContext = HandlerContext;

export class ToolRegistry {
  private tools = new Map<string, ToolDescriptor>();
  private mcpTools = new Map<string, MCPToolDescriptor>();
  private toolList: Array<{ name: string; description?: string; inputSchema?: unknown }> = [];
  private server: any | null = null; // Server type not exported from SDK

  constructor(
    private readonly services: Services,
    private readonly logger: Logger
  ) {
    this.logger = logger.child({ component: 'ToolRegistry' });
  }

  /**
   * Set the MCP server instance for SDK tool registration
   */
  setServer(server: unknown): void {
    // Server type not exported from SDK
    this.server = server;
    this.logger.info('MCP server attached to registry');
  }

  /**
   * Log tool execution through MCP server
   */
  private logToolExecution(toolName: string, params: unknown): void {
    if (this.server) {
      this.server.log('info', 'Tool execution started', {
        tool: toolName,
        params: this.sanitizeParams(params),
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Sanitize parameters for logging (remove sensitive data)
   */
  private sanitizeParams(params: unknown): any {
    if (!params || typeof params !== 'object') {
      return params;
    }

    const sanitized = { ...params };
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'credential'];

    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Register a tool with the registry (Legacy method)
   */
  register<TInput, TOutput>(descriptor: ToolDescriptor<TInput, TOutput>): void {
    try {
      // Validate schemas can produce JSON Schema
      const inputJson = zodToJsonSchema(descriptor.inputSchema);
      // Validate output schema can also be converted (but we don't need to store it)
      zodToJsonSchema(descriptor.outputSchema);

      // Store the tool locally for compatibility
      this.tools.set(descriptor.name, descriptor);

      // Add to tool list for MCP
      this.toolList.push({
        name: descriptor.name,
        description: descriptor.description,
        inputSchema: inputJson
      });

      this.logger.info(
        {
          tool: descriptor.name,
          category: descriptor.category,
          hasChainHint: !!descriptor.chainHint
        },
        'Tool registered'
      );
    } catch (error) {
      this.logger.error({ error, tool: descriptor.name }, 'Failed to register tool');
      throw new ServiceError(
        ErrorCode.ToolNotFound,
        `Failed to register tool ${descriptor.name}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Register a tool with MCP SDK (New method)
   */
  registerMCPTool<TInput, TOutput>(descriptor: MCPToolDescriptor<TInput, TOutput>): void {
    if (!this.server) {
      throw new ServiceError(
        ErrorCode.DependencyNotInitialized,
        'MCP server not attached to registry. Call setServer() first.'
      );
    }

    try {
      // Store the descriptor for later use
      this.mcpTools.set(descriptor.name, descriptor);

      // Create the MCP Tool compatible with SDK
      const tool: Tool = {
        name: descriptor.name,
        description: descriptor.description,
        inputSchema: zodToJsonSchema(descriptor.inputSchema) as unknown
      };

      // Register with SDK server
      this.server.addTool(tool, async (params: unknown, context: unknown) => {
        const toolLogger = this.logger.child({ tool: descriptor.name });

        // Log tool execution through MCP server
        this.logToolExecution(descriptor.name, params);

        try {
          // Create MCP tool context
          const mcpContext = await this.createMCPToolContext(context, toolLogger);

          // Validate input using our validation utilities
          const validatedHandler = withValidationAndLogging(
            descriptor.inputSchema,
            descriptor.outputSchema,
            async (validatedInput, _logger) => {
              return await descriptor.handler(validatedInput, mcpContext);
            },
            toolLogger,
            descriptor.name
          );

          // Execute the validated handler
          const result = await validatedHandler(params);

          // Return MCP-compatible response
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        } catch (error) {
          // Convert any error to MCP error and re-throw
          throw convertToMcpError(error);
        }
      });

      // Also add to legacy tool list for compatibility
      this.toolList.push({
        name: descriptor.name,
        description: descriptor.description,
        inputSchema: zodToJsonSchema(descriptor.inputSchema)
      });

      this.logger.info(
        {
          tool: descriptor.name,
          category: descriptor.category,
          hasChainHint: !!descriptor.chainHint,
          registrationMethod: 'mcp-sdk'
        },
        'MCP tool registered'
      );
    } catch (error) {
      this.logger.error({ error, tool: descriptor.name }, 'Failed to register MCP tool');
      throw convertToMcpError(error);
    }
  }

  /**
   * Handle MCP tool call request
   */
  async handleToolCall(request: unknown): Promise<any> {
    const { name, arguments: args } = request;

    // Log tool execution through MCP server
    this.logToolExecution(name, args);

    const tool = this.tools.get(name);
    if (!tool) {
      this.logger.warn({ tool: name }, 'Tool not found');
      throw new McpError(MCPErrorCode.MethodNotFound, `Tool ${name} not found`, {
        requestedTool: name
      });
    }

    // Create base context
    const baseContext = await this.createToolContext();

    try {
      // Validate input
      const validated = tool.inputSchema.parse(args);

      // Execute with timeout
      const timeout = tool.timeout ?? 30000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const result = await tool.execute(validated, {
          ...baseContext,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (result.success && result.data) {
          // Validate output
          const validatedOutput = tool.outputSchema.parse(result.data);

          // Return MCP response
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(validatedOutput, null, 2)
              }
            ]
          };
        } else {
          throw convertToMcpError(result.error ?? new Error('Unknown error'));
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
            code: e.code
          }))
        });
      }

      throw convertToMcpError(error);
    }
  }

  /**
   * Handle MCP list tools request
   */
  async listTools(): Promise<{
    tools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
  }> {
    return { tools: this.toolList };
  }

  /**
   * Handle MCP sampling request (for AI operations)
   */
  async handleSamplingRequest(request: unknown): Promise<any> {
    const aiService = this.services.ai;

    if (!aiService.isAvailable()) {
      throw new McpError(MCPErrorCode.InternalError, 'AI sampling service not available', {
        service: 'ai',
        available: false
      });
    }

    try {
      // Use the AI service directly for generation
      const result = await aiService.generate(request);
      const resultText =
        typeof result === 'string'
          ? result
          : result && typeof result === 'object' && 'content' in result
            ? (result as unknown).content
            : result && typeof result === 'object' && 'data' in result
              ? (result as unknown).data
              : String(result) || 'No result';

      return {
        content: [
          {
            type: 'text',
            text: resultText
          }
        ]
      };
    } catch (error) {
      this.logger.error({ error }, 'Sampling error');
      throw convertToMcpError(error);
    }
  }

  /**
   * Register all tool handlers from new directory structure
   */
  async registerAll(): Promise<void> {
    try {
      // Direct loading from flattened directory structure
      const allModules = [
        'analyze-repository',
        'resolve-base-images',
        'generate-dockerfile',
        'generate-dockerfile-ext',
        'fix-dockerfile',
        'build-image',
        'scan-image',
        'tag-image',
        'push-image',
        'generate-k8s-manifests',
        'prepare-cluster',
        'deploy-application',
        'verify-deployment',
        'start-workflow',
        'workflow-status',
        'ping',
        'list-tools',
        'server-status'
      ];

      for (const moduleName of allModules) {
        try {
          const module = await import(`./${moduleName}`);
          if (module.default) {
            // Check if this is a new MCP tool (has handler property) or legacy tool (has execute property)
            if (this.server && module.default.handler) {
              // New MCP tool format
              this.registerMCPTool(module.default);
              this.logger.debug({ module: moduleName, type: 'mcp' }, 'MCP tool loaded');
            } else if (module.default.execute) {
              // Legacy tool format
              this.register(module.default);
              this.logger.debug({ module: moduleName, type: 'legacy' }, 'Legacy tool loaded');
            } else {
              this.logger.warn({ module: moduleName }, 'Unknown tool format');
            }
          } else {
            this.logger.warn({ module: moduleName }, 'No default export');
          }
        } catch (error) {
          this.logger.error(
            {
              module: moduleName,
              error: error instanceof Error ? error.message : String(error)
            },
            'Failed to load tool handler'
          );
        }
      }

      this.logger.info(
        {
          toolCount: this.tools.size + this.mcpTools.size,
          legacy: this.tools.size,
          mcp: this.mcpTools.size
        },
        'All tools registered'
      );
    } catch (error) {
      this.logger.error({ error }, 'Failed to register tools');
      throw new ServiceError(
        ErrorCode.ServiceUnavailable,
        'Failed to register tool handlers',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get the number of registered tools
   */
  getToolCount(): number {
    return this.tools.size;
  }

  /**
   * Get tool by name
   */
  getTool(name: string): ToolDescriptor | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Create tool context from services
   */
  private async createToolContext(signal?: AbortSignal): Promise<ToolContext> {
    // Import workflow components
    const { WorkflowManager } = await import('../../workflow/manager');
    const { WorkflowOrchestrator } = await import('../../workflow/orchestrator');

    // Create workflow components
    const workflowManager = new WorkflowManager(this.logger);
    const workflowOrchestrator = new WorkflowOrchestrator(this.services.session, this.logger);

    const context: ToolContext = {
      logger: this.logger,
      sessionService: this.services.session,
      progressEmitter: this.services.progress,
      dockerService: this.services.docker,
      kubernetesService: this.services.kubernetes,
      aiService: this.services.ai,
      eventPublisher: this.services.events as unknown,
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
          enableEvents: true
        },
        workspace: { workspaceDir: process.cwd(), tempDir: './tmp', cleanupOnExit: true },
        infrastructure: {
          docker: {
            socketPath: '/var/run/docker.sock',
            registry: 'docker.io',
            host: 'localhost',
            port: 2376,
            timeout: 300000,
            apiVersion: '1.41'
          },
          kubernetes: {
            kubeconfig: '',
            namespace: 'default',
            context: '',
            timeout: 300000,
            dryRun: false
          },
          scanning: {
            enabled: true,
            scanner: 'trivy' as const,
            severityThreshold: 'high' as const,
            failOnVulnerabilities: false,
            skipUpdate: false,
            timeout: 300000
          },
          build: {
            enableCache: true,
            parallel: false,
            maxParallel: 4,
            buildArgs: {},
            labels: {},
            target: '',
            squash: false
          },
          java: {
            defaultVersion: '17',
            defaultJvmHeapPercentage: 75,
            enableNativeImage: false,
            enableJmx: false,
            enableProfiling: false
          }
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
            maxTokens: 4096
          },
          sampler: {
            mode: 'auto' as const,
            templateDir: './templates',
            cacheEnabled: true,
            retryAttempts: 3,
            retryDelayMs: 1000
          },
          mock: {
            enabled: false,
            responsesDir: './mock-responses',
            deterministicMode: false,
            simulateLatency: false,
            errorRate: 0,
            latencyRange: { min: 100, max: 500 }
          }
        },
        logging: {
          level: 'info' as const,
          format: 'pretty' as const,
          destination: 'console' as const,
          filePath: './logs/app.log',
          maxFileSize: '10MB',
          maxFiles: 5,
          enableColors: true
        },
        workflow: {
          mode: 'interactive' as const,
          autoRetry: true,
          maxRetries: 3,
          retryDelayMs: 5000,
          parallelSteps: false,
          skipOptionalSteps: false
        },
        features: {
          aiEnabled: true,
          mockMode: false,
          enableMetrics: false,
          enableEvents: true,
          enablePerformanceMonitoring: false,
          enableDebugLogs: false,
          enableTracing: false,
          nonInteractive: false
        }
      } as unknown
    };

    // Add AI components if available
    if (this.services.ai.isAvailable()) {
      // For now, we don't have direct access to sampler from the simplified AI service
      // This would need to be implemented if needed
    }

    if (signal) {
      context.signal = signal;
    }

    return context;
  }

  /**
   * Create MCP tool context from SDK context
   */
  private async createMCPToolContext(context: unknown, logger: Logger): Promise<MCPToolContext> {
    // Import workflow components
    const { WorkflowManager } = await import('../../workflow/manager');
    const { WorkflowOrchestrator } = await import('../../workflow/orchestrator');

    // Create workflow components
    const workflowManager = new WorkflowManager(this.logger);
    const workflowOrchestrator = new WorkflowOrchestrator(this.services.session, this.logger);

    const mcpContext: MCPToolContext = {
      server: this.server!,
      progressToken: context?.progressToken,
      logger,
      sessionService: this.services.session,
      progressEmitter: this.services.progress,
      dockerService: this.services.docker,
      kubernetesService: this.services.kubernetes,
      aiService: this.services.ai,
      eventPublisher: this.services.events as unknown,
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
          enableEvents: true
        },
        workspace: { workspaceDir: process.cwd(), tempDir: './tmp', cleanupOnExit: true },
        infrastructure: {
          docker: {
            socketPath: '/var/run/docker.sock',
            registry: 'docker.io',
            host: 'localhost',
            port: 2376,
            timeout: 300000,
            apiVersion: '1.41'
          },
          kubernetes: {
            kubeconfig: '',
            namespace: 'default',
            context: '',
            timeout: 300000,
            dryRun: false
          },
          scanning: {
            enabled: true,
            scanner: 'trivy' as const,
            severityThreshold: 'high' as const,
            failOnVulnerabilities: false,
            skipUpdate: false,
            timeout: 300000
          },
          build: {
            enableCache: true,
            parallel: false,
            maxParallel: 4,
            buildArgs: {},
            labels: {},
            target: '',
            squash: false
          },
          java: {
            defaultVersion: '17',
            defaultJvmHeapPercentage: 75,
            enableNativeImage: false,
            enableJmx: false,
            enableProfiling: false
          }
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
            maxTokens: 4096
          },
          sampler: {
            mode: 'auto' as const,
            templateDir: './templates',
            cacheEnabled: true,
            retryAttempts: 3,
            retryDelayMs: 1000
          },
          mock: {
            enabled: false,
            responsesDir: './mock-responses',
            deterministicMode: false,
            simulateLatency: false,
            errorRate: 0,
            latencyRange: { min: 100, max: 500 }
          }
        },
        logging: {
          level: 'info' as const,
          format: 'pretty' as const,
          destination: 'console' as const,
          filePath: './logs/app.log',
          maxFileSize: '10MB',
          maxFiles: 5,
          enableColors: true
        },
        workflow: {
          mode: 'interactive' as const,
          autoRetry: true,
          maxRetries: 3,
          retryDelayMs: 5000,
          parallelSteps: false,
          skipOptionalSteps: false
        },
        features: {
          aiEnabled: true,
          mockMode: false,
          enableMetrics: false,
          enableEvents: true,
          enablePerformanceMonitoring: false,
          enableDebugLogs: false,
          enableTracing: false,
          nonInteractive: false
        }
      } as unknown,
      // Add performance logging function
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
                timestamp: new Date().toISOString()
              }
            }
          });
        } catch (error) {
          // Fallback to regular logger
          this.logger.info(
            {
              operation,
              duration,
              metadata: metadata ?? {}
            },
            'Performance metrics'
          );
        }
      }
    };

    // Add AI components if available
    if (this.services.ai.isAvailable()) {
      // Add any additional AI-specific context here if needed
    }

    return mcpContext;
  }
}
