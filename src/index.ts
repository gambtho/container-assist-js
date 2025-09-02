/**
 * Container Kit MCP Server - Main Entry Point
 * A Model Context Protocol server for containerization workflows
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Dependencies } from './service/dependencies.js'
import { ToolRegistry } from './service/tools/registry.js'
import { createLogger } from './infrastructure/core/logger.js'
// Use the new unified configuration
import { config as applicationConfig, type ApplicationConfig } from './config/index.js'
// Keep backward compatibility with old Config import
import { Config } from './service/config/config.js'
import process from 'node:process'
import type { Logger } from './domain/types/index.js'

export class ContainerKitMCPServer {
  private server: Server
  private deps: Dependencies
  private registry: ToolRegistry
  private logger: Logger
  private shutdownHandlers: Array<() => Promise<void>> = []
  private appConfig: ApplicationConfig

  constructor(config?: Config | ApplicationConfig) {
    // Use the unified configuration if no config provided
    this.appConfig = config instanceof Config ? applicationConfig : (config || applicationConfig)
    
    this.logger = createLogger({
      level: this.appConfig.server.logLevel,
      environment: this.appConfig.server.nodeEnv
    })

    this.server = new Server(
      { name: 'container-kit-mcp', version: '2.0.0' },
      { capabilities: { tools: {}, sampling: {} } }
    )

    // No need to create a separate DependenciesConfig - use ApplicationConfig directly
    this.deps = new Dependencies({
      config: this.appConfig,
      logger: this.logger,
      mcpServer: this.server
    })

    this.registry = new ToolRegistry(this.deps, this.logger)
  }

  async start(): Promise<void> {
    try {
      // Initialize dependencies
      await this.deps.initialize()

      // Register all tools
      await this.registry.registerAll()

      // Setup MCP handlers
      this.setupMCPHandlers()

      // Setup graceful shutdown
      this.setupGracefulShutdown()

      // Connect transport
      const transport = new StdioServerTransport()
      await this.server.connect(transport)

      this.logger.info({
        pid: process.pid,
        version: '2.0.0',
        tools: this.registry.getToolCount()
      }, 'MCP server started')
    } catch (error) {
      this.logger.error({ error }, 'Failed to start server')
      throw error
    }
  }

  private setupMCPHandlers(): void {
    // Tool handler
    this.server.setRequestHandler('tools/call' as any, async (request: any) => {
      return this.registry.handleToolCall(request)
    })

    // List tools handler
    this.server.setRequestHandler('tools/list' as any, async () => {
      return this.registry.listTools()
    })

    // Sampling handler (for AI operations)
    this.server.setRequestHandler('sampling/create' as any, async (request: any) => {
      return this.registry.handleSamplingRequest(request)
    })
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string): Promise<void> => {
      this.logger.info({ signal }, 'Shutting down')

      try {
        // Run custom shutdown handlers
        await Promise.all(this.shutdownHandlers.map(handler =>
          handler().catch((err: any) =>
            this.logger.error({ error: err }, 'Shutdown handler error')
          )
        ))

        // Clean up dependencies
        await this.deps.cleanup()

        this.logger.info('Graceful shutdown complete')
        process.exit(0)
      } catch (error) {
        this.logger.error({ error }, 'Shutdown error')
        process.exit(1)
      }
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      this.logger.fatal({ error }, 'Uncaught exception')
      process.exit(1)
    })

    process.on('unhandledRejection', (reason, promise) => {
      this.logger.fatal({ reason, promise }, 'Unhandled rejection')
      process.exit(1)
    })
  }

  /**
   * Register a custom shutdown handler
   */
  onShutdown(handler: () => Promise<void>): void {
    this.shutdownHandlers.push(handler)
  }

  /**
   * Get server health status
   */
  async getHealth(): Promise<{
    status: 'healthy' | 'unhealthy'
    uptime: number
    services: Record<string, boolean>
    metrics?: Record<string, unknown>
  }> {
    const health = await this.deps.getHealth()

    return {
      status: health.healthy ? 'healthy' : 'unhealthy',
      uptime: process.uptime(),
      services: health.services,
      ...(health.metrics ? { metrics: health.metrics } : {})
    }
  }

  /**
   * Shutdown the server
   */
  async shutdown(): Promise<void> {
    await this.deps.cleanup()
  }
}

// This file is now a library module only
// Use ./bin/cli.js for command-line usage

// Export for programmatic usage
export { Config } from './service/config/config.js';  // Backward compatibility
export { 
  config as applicationConfig, 
  type ApplicationConfig,
  ConfigurationFactory,
  createConfig,
  validateConfig 
} from './config/index.js';  // New unified configuration
export { Dependencies } from './service/dependencies.js'
export { ToolRegistry } from './service/tools/registry.js'

