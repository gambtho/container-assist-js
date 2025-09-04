/**
 * Containerization Assist MCP Server - Constructor Injection Version
 * Uses direct service instantiation instead of service locator pattern
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
// Remove ServerOptions import as McpServer uses different constructor
<<<<<<< HEAD
import { registerToolsNatively, getRegisteredTools } from '../src/application/tools/native-registry.js';
import type { Services } from '../src/services/index.js';
=======
import { createToolRegistry, loadAllTools } from '../src/application/tools/registry-utils.js';
import type { ToolRegistry } from '../src/application/tools/ops/registry.js';
>>>>>>> 8f344a2 (cleaning up kubernetes & docker service)
import { createPinoLogger } from '../src/infrastructure/logger.js';
import { config as applicationConfig, type ApplicationConfig } from '../src/config/index.js';
import process from 'node:process';
import type { Logger } from 'pino';
<<<<<<< HEAD

// Import service implementations directly
import { DockerService } from '../src/services/docker.js';
import { KubernetesService } from '../src/services/kubernetes.js';
import { AIService } from '../src/services/ai.js';
import { SessionService } from '../src/services/session.js';
import { SimplifiedResourceManager as ResourceManager } from '../src/application/resources/simplified-resource-manager.js';
// Import interfaces for proper MCP sampling
import { createNativeMCPSampler, type SampleFunction } from '../src/infrastructure/ai/sampling.js';
=======
import { initializeServices, cleanupServices, type Services, type ServicesConfig } from '../src/services/index.js';
import { ResourceManager } from '../src/application/resources/index.js';
>>>>>>> 8f344a2 (cleaning up kubernetes & docker service)

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

    // Services will be initialized in start() method using factory pattern
    this.services = {} as Services;

<<<<<<< HEAD
=======
    // Tool registry will be created in start() method after services are initialized
    this.toolRegistry = null as any; // Will be initialized in start()

>>>>>>> 8f344a2 (cleaning up kubernetes & docker service)
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
<<<<<<< HEAD
   * Create a sampling function using native MCP SDK
   */
  private createMCPSampler(): SampleFunction {
    return createNativeMCPSampler(this.server, this.logger);
  }
=======
   * Create services configuration for factory pattern
   */
  private createServicesConfig(): ServicesConfig {
    const config: ServicesConfig = {};
>>>>>>> 8f344a2 (cleaning up kubernetes & docker service)

    // Docker configuration
    if (this.appConfig.infrastructure?.docker) {
      config.docker = {
        socketPath: this.appConfig.infrastructure.docker.socketPath || '/var/run/docker.sock',
      };
      if (this.appConfig.infrastructure.docker.host !== undefined) {
        config.docker.host = this.appConfig.infrastructure.docker.host;
      }
      if (this.appConfig.infrastructure.docker.port !== undefined) {
        config.docker.port = this.appConfig.infrastructure.docker.port;
      }
    }

    // Kubernetes configuration
    if (this.appConfig.infrastructure?.kubernetes) {
      config.kubernetes = {
        kubeconfig: this.appConfig.infrastructure.kubernetes.kubeconfig || '',
        namespace: this.appConfig.infrastructure.kubernetes.namespace || 'default',
      };
      if (this.appConfig.infrastructure.kubernetes.context !== undefined) {
        config.kubernetes.context = this.appConfig.infrastructure.kubernetes.context;
      }
    }

    // Session configuration
    config.session = {
      ttl: this.appConfig.session?.ttl || 3600,
    };

    return config;
  }

  /**
   * Initialize SDK logging infrastructure
   */
  private initializeLogging(): void {
    // MCP SDK logging is handled through the logging capability
    // The client will set the logging level via logging/setLevel requests
  }


  async start(): Promise<void> {
    try {
      // Create services configuration
      const servicesConfig = this.createServicesConfig();

      // Initialize all services using factory pattern with MCP server
      this.services = await initializeServices(servicesConfig, this.logger, this.server);

      // Update tool registry with initialized services
      this.toolRegistry = createToolRegistry(this.services, this.logger, this.appConfig);

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
            ai: this.services.ai ? 'initialized' : 'unavailable',
            session: 'initialized',
          },
          resources: {
            registered: this.resourceManager.isResourcesRegistered(),
          },
        },
        'MCP server started with service factory pattern and resources',
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
   * Close all services gracefully using factory cleanup
   */
  private async closeAllServices(): Promise<void> {
    try {
      await cleanupServices(this.services, this.logger);
    } catch (error) {
      this.logger.error({ error }, 'Services cleanup failed');
    }
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
