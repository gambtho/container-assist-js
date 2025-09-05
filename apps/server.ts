/**
 * Containerization Assist MCP Server - Constructor Injection Version
 * Uses direct service instantiation instead of service locator pattern
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
// Remove ServerOptions import as McpServer uses different constructor
import { registerToolsNatively, getRegisteredTools } from '../src/application/tools/native-registry.js';
import type { Services } from '../src/services/index.js';
import { createPinoLogger } from '../src/infrastructure/logger.js';
import { config as applicationConfig, type ApplicationConfig } from '../src/config/index.js';
import process from 'node:process';
import { EventEmitter } from 'events';
import type { Logger } from 'pino';

// Import service implementations directly
import { DockerService } from '../src/services/docker.js';
import { KubernetesService } from '../src/services/kubernetes.js';
import { AIService } from '../src/services/ai.js';
import { SessionService } from '../src/services/session.js';
import { SimplifiedResourceManager as ResourceManager } from '../src/application/resources/simplified-resource-manager.js';
// Import interfaces for proper MCP sampling
import { createNativeMCPSampler, type SampleFunction } from '../src/infrastructure/ai/sampling.js';

export class ContainerizationAssistMCPServer {
  private server: McpServer;
  private services: Services;
  private resourceManager!: ResourceManager; // Initialize later
  private logger: Logger;
  private shutdownHandlers: Array<() => Promise<void>> = [];
  private appConfig: ApplicationConfig;
  private isShuttingDown: boolean = false;

  constructor(config?: ApplicationConfig, useStderr = true) {
    // Use the unified configuration if no config provided
    this.appConfig = config || applicationConfig;

    this.logger = createPinoLogger({
      level: this.appConfig.server.logLevel,
      environment: useStderr ? 'production' : this.appConfig.server.nodeEnv, // Force production mode for MCP
      useStderr, // Use stderr for MCP stdio transport
    });

    // Direct service instantiation - no factories or containers
    this.services = this.createServices();

    // Initialize resource manager - needs to be done after services are created
    // Will initialize later in start() method when we have a tool registry

    // Initialize MCP server using the new API
    this.server = new McpServer({
      name: 'containerization-assist-mcp',
      version: '2.0.0',
    });

    // Initialize SDK logging infrastructure
    this.initializeLogging();
  }

  /**
   * Create a sampling function using native MCP SDK
   */
  private createMCPSampler(): SampleFunction {
    return createNativeMCPSampler(this.server, this.logger);
  }

  /**
   * Create services directly with constructor injection
   * No service locator, no factories - just direct instantiation
   */
  private createServices(): Services {
    // Progress notifications handled via MCP SDK progressToken

    // Direct service instantiation with explicit dependencies
    const dockerConfig: any = {
      socketPath: this.appConfig.infrastructure?.docker?.socketPath || '/var/run/docker.sock',
    };
    if (this.appConfig.infrastructure?.docker?.host !== undefined) {
      dockerConfig.host = this.appConfig.infrastructure.docker.host;
    }
    if (this.appConfig.infrastructure?.docker?.port !== undefined) {
      dockerConfig.port = this.appConfig.infrastructure.docker.port;
    }
    const dockerService = new DockerService(dockerConfig, this.logger.child({ service: 'docker' }));

    const kubernetesConfig: any = {
      kubeconfig: this.appConfig.infrastructure?.kubernetes?.kubeconfig || '',
      namespace: this.appConfig.infrastructure?.kubernetes?.namespace || 'default',
    };
    if (this.appConfig.infrastructure?.kubernetes?.context !== undefined) {
      kubernetesConfig.context = this.appConfig.infrastructure.kubernetes.context;
    }
    const kubernetesService = new KubernetesService(
      kubernetesConfig,
      this.logger.child({ service: 'kubernetes' }),
    );

    // AI service will be properly initialized after MCP server is ready
    const aiService: any = null; // Will be created with proper sampler in start()

    const sessionService = new SessionService(
      {
        storeType: 'memory',
        ttl: this.appConfig.session?.ttl || 3600,
      },
      this.logger.child({ service: 'session' }),
    );

    return {
      docker: dockerService as any,
      kubernetes: kubernetesService as any,
      ai: aiService, // Will be undefined initially, set in start()
      session: sessionService as any,
      events: new EventEmitter(),
    } as Services;
  }

  /**
   * Initialize SDK logging infrastructure
   */
  private initializeLogging(): void {
    // MCP SDK logging is handled through the logging capability
    // The client will set the logging level via logging/setLevel requests
  }

  /**
   * Initialize all services
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing services with direct injection...');

    // Initialize all services directly - no complex factory patterns
    const initPromises = [
      this.services.docker.initialize(),
      this.services.kubernetes.initialize(),
      this.services.session.initialize(),
    ];

    // Skip AI service initialization here - it will be initialized in start()
    // after we have the proper MCP sampler
    // Only initialize AI service if it exists
    if (this.services.ai) {
      initPromises.push(this.services.ai.initialize());
    }

    await Promise.all(initPromises);

    this.logger.info('All services initialized successfully');
  }

  async start(): Promise<void> {
    try {
      // Initialize services
      await this.initialize();

      // Create real MCP sampler using the server's client sampling capability
      const mcpSampler = this.createMCPSampler();

      // Get AI configuration from app config
      const aiConfig = {
        provider: 'openai',
        apiKey: this.appConfig.aiServices?.ai?.apiKey || process.env.OPENAI_API_KEY || '',
        model: this.appConfig.aiServices?.ai?.model || 'gpt-4',
        temperature: this.appConfig.aiServices?.ai?.temperature || 0.7,
        maxTokens: this.appConfig.aiServices?.ai?.maxTokens || 2000,
        timeout: this.appConfig.aiServices?.ai?.timeout || 30000,
        retryConfig: {
          maxRetries: 3,
          retryDelay: 1000,
          maxRetryDelay: 10000,
        },
      };

      // Create AI service with real MCP sampler and config
      this.services.ai = new AIService(
        aiConfig,
        mcpSampler,
        this.logger.child({ service: 'ai' }),
      ) as any;

      // Initialize and validate the AI service
      try {
        await this.services.ai.initialize();

        // Test AI service connectivity
        if (this.appConfig.aiServices?.ai?.apiKey) {
          // AI service is configured, log success
          this.logger.info({ provider: aiConfig.provider }, 'AI service initialized successfully');
        }
      } catch (error) {
        this.logger.error({ error }, 'AI service initialization failed');

        // Decide whether to fail hard or continue with degraded functionality
        if (this.appConfig.features?.aiEnabled) {
          this.logger.warn(
            'AI is enabled but failed to initialize, continuing with degraded functionality',
          );
        } else {
          this.logger.info('AI service is optional, continuing without it');
        }
      }

      // Register tools natively with MCP SDK (eliminates ToolRegistry complexity)
      await registerToolsNatively(this.server as any, this.services, this.logger, this.appConfig);

      this.resourceManager = new ResourceManager(
        this.appConfig,
        this.services.session as any, // Cast to concrete type for ResourceManager
        this.services.docker as any,
        this.logger,
      );

      // Register resources with MCP server
      this.resourceManager.registerWithServer(this.server as any);

      // MCP handlers now handled automatically by McpServer - no manual setup needed

      this.setupGracefulShutdown();

      // Connect transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      this.logger.info(
        {
          pid: process.pid,
          version: '2.0.0',
          services: {
            docker: 'initialized',
            kubernetes: 'initialized',
            ai: 'initialized',
            session: 'initialized',
          },
          resources: {
            registered: this.resourceManager.isResourcesRegistered(),
          },
        },
        'MCP server started with constructor injection and resources',
      );
    } catch (error) {
      this.logger.error({ error }, 'Failed to start server');
      throw error;
    }
  }

  /**
   * Get comprehensive health status
   */
  private async getHealthStatus(): Promise<any> {
    const services = {
      docker: false,
      kubernetes: false,
      ai: false,
      session: false,
    };

    try {
      const dockerHealth = await this.services.docker.health();
      services.docker = dockerHealth?.available ?? false;
    } catch (error) {
      this.logger.warn({ error }, 'Docker health check failed');
    }

    try {
      const k8sHealth = await this.services.kubernetes.checkClusterAccess();
      services.kubernetes = k8sHealth;
    } catch (error) {
      this.logger.warn({ error }, 'Kubernetes health check failed');
    }

    services.ai = this.services.ai ? this.services.ai.isAvailable() : false;
    services.session = true; // Session service is always available

    return {
      healthy: Object.values(services).every((status) => status),
      services,
      version: '2.0.0',
      timestamp: new Date().toISOString(),
    };
  }

  private setupGracefulShutdown(): void {
    // Handle signals properly with async error handling
    process.on('SIGTERM', () => {
      this.performShutdown('SIGTERM').catch((error) => {
        this.logger.error({ error }, 'Error during SIGTERM shutdown');
        process.exit(1);
      });
    });

    process.on('SIGINT', () => {
      this.performShutdown('SIGINT').catch((error) => {
        this.logger.error({ error }, 'Error during SIGINT shutdown');
        process.exit(1);
      });
    });
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
  getServices(): Services {
    return this.services;
  }

  /**
   * Get MCP server instance for external access if needed
   */
  getServer(): McpServer {
    return this.server;
  }

  /**
   * Get registered tools for external access if needed
   */
  getRegisteredTools(): Array<{ name: string; description: string }> {
    return getRegisteredTools();
  }

  /**
   * Perform graceful shutdown
   */
  private async performShutdown(signal: string): Promise<void> {
    this.logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown...');

    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;

    try {
      const shutdownTimeout = setTimeout(() => {
        this.logger.error('Graceful shutdown timeout, forcing exit');
        process.exit(1);
      }, 30000);

      for (const handler of this.shutdownHandlers) {
        try {
          await handler();
        } catch (error) {
          this.logger.error({ error }, 'Shutdown handler failed');
        }
      }

      await this.closeAllServices();
      clearTimeout(shutdownTimeout);
      this.logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      this.logger.error({ error }, 'Error during graceful shutdown');
      process.exit(1);
    }
  }

  /**
   * Close all services gracefully
   */
  private async closeAllServices(): Promise<void> {
    const closePromises = [];

    // Close Docker service
    if (this.services.docker) {
      if ('close' in this.services.docker) {
        closePromises.push((this.services.docker as any).close());
      } else if ('cleanup' in this.services.docker) {
        closePromises.push((this.services.docker as any).cleanup());
      }
    }

    // Close Kubernetes service
    if (this.services.kubernetes) {
      if ('close' in this.services.kubernetes) {
        closePromises.push((this.services.kubernetes as any).close());
      } else if ('cleanup' in this.services.kubernetes) {
        closePromises.push((this.services.kubernetes as any).cleanup());
      }
    }

    // Close Session service
    if (this.services.session) {
      if ('close' in this.services.session) {
        closePromises.push((this.services.session as any).close());
      } else if ('cleanup' in this.services.session) {
        closePromises.push((this.services.session as any).cleanup());
      }
    }

    // Close AI service
    if (this.services.ai) {
      if ('close' in this.services.ai) {
        closePromises.push((this.services.ai as any).close());
      } else if ('cleanup' in this.services.ai) {
        closePromises.push((this.services.ai as any).cleanup());
      }
    }

    // Wait for all services to close
    const results = await Promise.allSettled(closePromises);

    // Log any errors
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error({ error: result.reason, index }, 'Service close failed');
      }
    });
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
      // Use native tool registration instead of complex discovery

      const toolList = getRegisteredTools().map((tool) => ({
        name: tool.name,
        description: tool.description,
        category: 'utility', // Default category for native tools
        inputSchema: {}, // Schema not exposed in simple interface
      }));

      return {
        success: true,
        tools: toolList,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        tools: [],
      };
    }
  }

  /**
   * Shutdown the server gracefully
   */
  shutdown(): void {
    this.performShutdown('manual').catch((error) => {
      this.logger.error({ error }, 'Error during manual shutdown');
      process.exit(1);
    });
  }
}
