/**
 * Container Kit MCP Server - Constructor Injection Version
 * Uses direct service instantiation instead of service locator pattern
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
// Remove ServerOptions import as McpServer uses different constructor
import { createToolRegistry, loadAllTools } from '../src/application/tools/registry-utils.js';
import type { ToolRegistry } from '../src/application/tools/ops/registry.js';
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
import { ResourceManager } from '../src/application/resources/index.js';
// Import interfaces for proper MCP sampling
import { createSampler, type SampleFunction } from '../src/infrastructure/ai/sampling.js';

export class ContainerKitMCPServer {
  private server: McpServer;
  private services: Services;
  private toolRegistry: ToolRegistry;
  private resourceManager!: ResourceManager; // Initialize later
  private logger: Logger;
  private shutdownHandlers: Array<() => Promise<void>> = [];
  private appConfig: ApplicationConfig;

  constructor(config?: ApplicationConfig) {
    // Use the unified configuration if no config provided
    this.appConfig = config || applicationConfig;

    this.logger = createPinoLogger({
      level: this.appConfig.server.logLevel,
      environment: this.appConfig.server.nodeEnv,
    });

    // Direct service instantiation - no factories or containers
    this.services = this.createServices();

    // Create tool registry with injected services
    this.toolRegistry = createToolRegistry(this.services, this.logger);

    // Initialize resource manager - needs to be done after services are created
    // Will initialize later in start() method when we have a tool registry

    // Initialize MCP server using the new API
    this.server = new McpServer({
      name: 'container-kit-mcp',
      version: '2.0.0',
    });

    // Initialize SDK logging infrastructure
    this.initializeLogging();
  }

  /**
   * Create a sampling function that uses client sampling capability
   */
  private createMCPSampler(): SampleFunction {
    return createSampler({
      type: 'mcp',
      server: this.server,
    }, this.logger);
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
    const dockerService = new DockerService(
      dockerConfig,
      this.logger.child({ service: 'docker' }),
    );

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

    // AI service will be created after MCP server is ready
    // This avoids initializing with mock sampler
    const aiService: any = null; // Will be set in start() method

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
      ai: aiService as any, // Will be undefined initially, set in start()
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

    // Only initialize AI service if it exists (created after MCP server is ready)
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

      // Create AI service with real MCP sampler (no mock fallback)
      this.services.ai = new AIService(
        {},
        mcpSampler,
        this.logger.child({ service: 'ai' }),
      ) as any;
      
      // Initialize the AI service after creation
      await this.services.ai.initialize();

      // Set server on tool registry
      this.toolRegistry.setServer(this.server);

      await loadAllTools(this.toolRegistry);

      this.resourceManager = new ResourceManager(
        this.appConfig,
        this.services.session as any, // Cast to concrete type for ResourceManager
        this.services.docker as any,
        this.toolRegistry, // Direct registry instead of factory
        this.logger,
      );

      // Register resources with MCP server
      this.resourceManager.registerWithServer(this.server);

      // MCP handlers now handled automatically by McpServer - no manual setup needed

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
          session: 'initialized',
        },
        resources: {
          providers: this.resourceManager.getProviderNames(),
          registered: this.resourceManager.isResourcesRegistered(),
        },
      }, 'MCP server started with constructor injection and resources');
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
      services.docker = dockerHealth.available ?? false;
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
      timestamp: new Date().toISOString(),
    };
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      this.logger.info({ signal }, 'Received shutdown signal');

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

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
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
   * Get tool registry for external access if needed
   */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
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
      const { AVAILABLE_TOOLS } = await import('../src/application/tools/registry-utils.js');
      const { getToolConfig } = await import('../src/application/tools/tool-config.js');

      const toolList = AVAILABLE_TOOLS.map(toolName => {
        const config = getToolConfig(toolName);
        const tool = this.toolRegistry.getTool(toolName);
        if (!tool) {
          throw new Error(`Tool ${toolName} not found`);
        }

        return {
          name: config.name,
          description: config.description,
          category: config.category || 'utility',
          inputSchema: tool.inputSchema,
          chainHint: tool.chainHint,
        };
      });

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
    this.setupGracefulShutdown();
  }
}
