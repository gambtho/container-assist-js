/**
 * Container Kit MCP Server - Constructor Injection Version
 * Uses direct service instantiation instead of service locator pattern
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ServerOptions } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { ToolFactory } from '../src/application/tools/factory.js';
import type { CoreServices } from '../src/application/services/interfaces.js';
import { createPinoLogger } from '../src/runtime/logger.js';
import { config as applicationConfig, type ApplicationConfig } from '../src/config/index.js';
import process from 'node:process';
import type { Logger } from 'pino';

// Import service implementations directly
import { DockerService } from '../src/services/docker.js';
import { KubernetesService } from '../src/services/kubernetes.js';
import { AIService } from '../src/services/ai.js';
import { SessionService } from '../src/services/session.js';
import { ResourceManager } from '../src/application/resources/index.js';

export class ContainerKitMCPServerV2 {
  private server: Server;
  private services: CoreServices;
  private toolFactory: ToolFactory;
  private resourceManager!: ResourceManager; // Initialize later
  private logger: Logger;
  private shutdownHandlers: Array<() => Promise<void>> = [];
  private appConfig: ApplicationConfig;

  constructor(config?: ApplicationConfig) {
    // Use the unified configuration if no config provided
    this.appConfig = config || applicationConfig;

    this.logger = createPinoLogger({
      level: this.appConfig.server.logLevel,
      environment: this.appConfig.server.nodeEnv
    });

    // Direct service instantiation - no factories or containers
    this.services = this.createServices();
    
    // Create tool factory with injected services
    this.toolFactory = new ToolFactory(this.services);

    // Initialize resource manager - needs to be done after services are created
    // Will initialize later in start() method when we have a tool registry

    // Properly typed server initialization with experimental progress support
    const serverInfo = {
      name: 'container-kit-mcp',
      version: '2.0.0'
    };
    
    const serverOptions: ServerOptions = {
      capabilities: {
        tools: {},
        resources: {},
        logging: {},
        // Enable experimental progress notifications
        experimental_progress: true
      }
    };

    this.server = new Server(serverInfo, serverOptions);
    
    // Initialize SDK logging infrastructure
    this.initializeLogging();
  }

  /**
   * Create services directly with constructor injection
   * No service locator, no factories - just direct instantiation
   */
  private createServices(): CoreServices {
    // Create progress emitter
    const progressEmitter = {
      emit: async (update: any) => {
        // Progress notifications should be sent via the notification method
        // The SDK doesn't have a sendProgressNotification method
        // Progress is handled through the progressToken in requests
        this.logger.info({ update }, 'Progress update');
      }
    };

    // Direct service instantiation with explicit dependencies
    const dockerConfig: any = {
      socketPath: this.appConfig.infrastructure?.docker?.socketPath || '/var/run/docker.sock'
    };
    if (this.appConfig.infrastructure?.docker?.host !== undefined) {
      dockerConfig.host = this.appConfig.infrastructure.docker.host;
    }
    if (this.appConfig.infrastructure?.docker?.port !== undefined) {
      dockerConfig.port = this.appConfig.infrastructure.docker.port;
    }
    const dockerService = new DockerService(
      dockerConfig,
      this.logger.child({ service: 'docker' })
    );

    const kubernetesConfig: any = {
      kubeconfig: this.appConfig.infrastructure?.kubernetes?.kubeconfig || '',
      namespace: this.appConfig.infrastructure?.kubernetes?.namespace || 'default'
    };
    if (this.appConfig.infrastructure?.kubernetes?.context !== undefined) {
      kubernetesConfig.context = this.appConfig.infrastructure.kubernetes.context;
    }
    const kubernetesService = new KubernetesService(
      kubernetesConfig,
      this.logger.child({ service: 'kubernetes' })
    );

    const aiService = new AIService(
      {},
      undefined, // MCP sampler would be injected here if available
      this.logger.child({ service: 'ai' })
    );

    const sessionService = new SessionService(
      {
        storeType: 'memory',
        ttl: this.appConfig.session?.ttl || 3600
      },
      this.logger.child({ service: 'session' })
    );

    return {
      docker: dockerService as any,
      kubernetes: kubernetesService as any,
      ai: aiService as any,
      session: sessionService as any,
      logger: this.logger,
      progress: progressEmitter,
      events: {
        emit: async (event: string, data: any) => {
          this.logger.info({ event, data }, 'Event emitted');
        }
      }
    } as CoreServices;
  }

  /**
   * Initialize SDK logging infrastructure
   */
  private initializeLogging(): void {
    // MCP SDK logging is handled through the logging capability
    // The client will set the logging level via logging/setLevel requests
  }

  /**
   * Log tool execution with sanitized parameters
   */
  private async logToolExecution(toolName: string, params: any): Promise<void> {
    try {
      await this.server.sendLoggingMessage({
        level: 'info',
        logger: 'tool-execution',
        data: {
          tool: toolName,
          params: this.sanitizeParams(params),
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      // Fallback to regular logger if MCP logging fails
      this.logger.info({
        tool: toolName,
        params: this.sanitizeParams(params)
      }, 'Tool execution started');
    }
  }

  /**
   * Sanitize parameters for logging (remove sensitive data)
   */
  private sanitizeParams(params: any): any {
    if (!params || typeof params !== 'object') {
      return params;
    }

    const sanitized = { ...params };
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'credential'];
    
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Initialize all services
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing services with direct injection...');

    // Initialize all services directly - no complex factory patterns
    await Promise.all([
      this.services.docker.initialize(),
      this.services.kubernetes.initialize(),
      this.services.ai.initialize(),
      this.services.session.initialize()
    ]);

    this.logger.info('All services initialized successfully');
  }

  async start(): Promise<void> {
    try {
      // Initialize services
      await this.initialize();

      // Initialize resource manager with services
      this.resourceManager = new ResourceManager(
        this.appConfig,
        this.services.session as any, // Cast to concrete type for ResourceManager
        this.services.docker as any,
        this.toolFactory, // Use tool factory as proxy for tool registry
        this.logger
      );

      // Register resources with MCP server
      this.resourceManager.registerWithServer(this.server);

      // Setup MCP handlers
      this.setupMCPHandlers();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      // Connect transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      this.logger.info({
        pid: process.pid,
        version: '2.0.0',
        services: {
          docker: 'initialized',
          kubernetes: 'initialized', 
          ai: 'initialized',
          session: 'initialized'
        },
        resources: {
          providers: this.resourceManager.getProviderNames(),
          registered: this.resourceManager.isResourcesRegistered()
        }
      }, 'MCP server started with constructor injection and resources');
    } catch (error) {
      this.logger.error({ error }, 'Failed to start server');
      throw error;
    }
  }

  private setupMCPHandlers(): void {
    // Set up proper MCP request handlers using SDK
    
    // Tools list handler
    this.server.setRequestHandler(
      { method: z.literal('tools/list') } as any,
      async () => {
        const tools = this.toolFactory.getAllTools();
        return {
          tools: tools.map(tool => ({
            name: (tool as any).config.name,
            description: (tool as any).config.description || '',
            inputSchema: tool.inputSchema || { type: 'object', properties: {} }
          }))
        };
      }
    );
    
    // Tools call handler
    this.server.setRequestHandler(
      { method: z.literal('tools/call') } as any,
      async (request: any) => {
        const { name, arguments: args } = request.params;
        
        await this.logToolExecution(name, args);
        
        try {
          // Create tool with injected services
          const tool = this.toolFactory.createTool(name);
          
          // Execute tool with direct service access
          const result = await tool.handle({
            method: name,
            arguments: args
          });

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          };
        } catch (error) {
          this.logger.error({ error, tool: name }, 'Tool execution failed');
          return {
            content: [{
              type: 'text', 
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                tool: name
              }, null, 2)
            }],
            isError: true
          };
        }
      }
    );

    // Logging level handler
    this.server.setRequestHandler(
      { method: z.literal('logging/setLevel') } as any,
      async (request: any) => {
        const { level } = request.params;
        this.logger.level = level;
        return {};
      }
    );

    // Health check handler (custom)
    this.server.setRequestHandler(
      { method: z.literal('health/check') } as any,
      async () => {
        const health = await this.getHealthStatus();
        return health;
      }
    );
  }

  /**
   * Get comprehensive health status
   */
  private async getHealthStatus(): Promise<any> {
    const services = {
      docker: false,
      kubernetes: false,
      ai: false,
      session: false
    };

    try {
      const dockerHealth = await this.services.docker.health();
      services.docker = dockerHealth.healthy;
    } catch (error) {
      this.logger.warn({ error }, 'Docker health check failed');
    }

    try {
      const k8sHealth = await this.services.kubernetes.checkClusterAccess();
      services.kubernetes = k8sHealth;
    } catch (error) {
      this.logger.warn({ error }, 'Kubernetes health check failed');
    }

    services.ai = this.services.ai.isAvailable();
    services.session = true; // Session service is always available

    return {
      healthy: Object.values(services).every(status => status),
      services,
      version: '2.0.0',
      timestamp: new Date().toISOString()
    };
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      this.logger.info({ signal }, 'Received shutdown signal');

      // Run shutdown handlers
      for (const handler of this.shutdownHandlers) {
        try {
          await handler();
        } catch (error) {
          this.logger.error({ error }, 'Shutdown handler failed');
        }
      }

      // Cleanup services (no complex container cleanup needed)
      try {
        if (this.services.docker && 'cleanup' in this.services.docker) {
          await (this.services.docker as any).cleanup();
        }
        if (this.services.session && 'cleanup' in this.services.session) {
          await (this.services.session as any).cleanup();
        }
      } catch (error) {
        this.logger.error({ error }, 'Service cleanup failed');
      }

      this.logger.info('Server shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  /**
   * Add shutdown handler
   */
  addShutdownHandler(handler: () => Promise<void>): void {
    this.shutdownHandlers.push(handler);
  }

  /**
   * Get services for external access if needed
   */
  getServices(): CoreServices {
    return this.services;
  }

  /**
   * Get tool factory for external access if needed
   */
  getToolFactory(): ToolFactory {
    return this.toolFactory;
  }

  /**
   * Get health status for external access
   */
  async getHealth(): Promise<any> {
    return this.getHealthStatus();
  }

  /**
   * List all available tools (for CLI support)
   */
  async listTools(): Promise<any> {
    try {
      // Import the available tools list and config function
      const { AVAILABLE_TOOLS } = await import('../src/application/tools/factory.js');
      const { getSimpleToolConfig } = await import('../src/application/tools/simple-config.js');
      
      const toolList = AVAILABLE_TOOLS.map(toolName => {
        const config = getSimpleToolConfig(toolName);
        const tool = this.toolFactory.createTool(toolName);
        
        return {
          name: config.name,
          description: config.description,
          category: config.category || 'utility',
          inputSchema: tool.inputSchema,
          chainHint: tool.chainHint
        };
      });
      
      return {
        success: true,
        tools: toolList
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        tools: []
      };
    }
  }

  /**
   * Shutdown the server gracefully
   */
  async shutdown(): Promise<void> {
    await this.setupGracefulShutdown();
  }
}