#!/usr/bin/env node
/**
 * Container Kit MCP CLI
 * Command-line interface for the Container Kit MCP Server
 */

import { program } from 'commander'
import { ContainerKitMCPServer } from '../index.js'
import { Config } from '../service/config/config.js'
import { createLogger } from '../infrastructure/core/logger.js'
import process from 'node:process'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageJson = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'))

const logger = createLogger({ service: 'cli' })

program
  .name('container-kit-mcp')
  .description('MCP server for AI-powered containerization workflows')
  .version(packageJson.version)
  .option('--config <path>', 'path to configuration file')
  .option('--log-level <level>', 'logging level (debug, info, warn, error)', 'info')
  .option('--workspace <path>', 'workspace directory path', process.cwd())
  .option('--port <port>', 'port for HTTP transport (default: stdio)', parseInt)
  .option('--host <host>', 'host for HTTP transport', 'localhost')
  .option('--dev', 'run in development mode')
  .option('--mock', 'run with mock AI sampler')
  .option('--validate', 'validate configuration and exit')
  .option('--list-tools', 'list available tools and exit')
  .option('--health-check', 'perform health check and exit')
  .option('--docker-socket <path>', 'Docker socket path', '/var/run/docker.sock')
  .option('--k8s-namespace <namespace>', 'Kubernetes namespace', 'default')

program.parse(process.argv)

const options = program.opts()

async function main(): Promise<void> {
  try {
    // Set environment variables based on CLI options
    if (options.logLevel) process.env.LOG_LEVEL = options.logLevel
    if (options.workspace) process.env.WORKSPACE_DIR = options.workspace
    if (options.dockerSocket) process.env.DOCKER_SOCKET = options.dockerSocket
    if (options.k8sNamespace) process.env.K8S_NAMESPACE = options.k8sNamespace
    if (options.dev) process.env.NODE_ENV = 'development'
    if (options.mock) process.env.MOCK_MODE = 'true'

    // Create configuration (reads from environment)
    const config = new Config()

    // Validate configuration mode
    if (options.validate) {
      logger.info('Configuration validation passed')
      console.log('✅ Configuration valid')
      process.exit(0)
    }

    // Create server
    const server = new ContainerKitMCPServer(config)

    // List tools mode
    if (options.listTools) {
      logger.info('Listing available tools')
      // We need to initialize to get tools, but don't start the server
      await server['deps'].initialize()
      await server['registry'].registerAll()

      const toolList = server['registry'].listTools()
      console.log('Available tools:')
      console.log('═'.repeat(60))

      if ('tools' in toolList && Array.isArray(toolList.tools)) {
        const toolsByCategory = toolList.tools.reduce((acc: Record<string, any[]>, tool: any) => {
          const category = tool.category || 'utility'
          if (!acc[category]) acc[category] = []
          acc[category].push(tool)
          return acc
        }, {})

        for (const [category, tools] of Object.entries(toolsByCategory)) {
          console.log(`\n📁 ${category.toUpperCase()}`)
          tools.forEach((tool: any) => {
            console.log(`  • ${tool.name.padEnd(25)} ${tool.description}`)
          })
        }

        console.log(`\nTotal: ${toolList.tools.length} tools available`)
      }

      await server.shutdown()
      process.exit(0)
    }

    // Health check mode
    if (options.healthCheck) {
      logger.info('Performing health check')
      await server['deps'].initialize()

      const health = await server.getHealth()

      console.log('🏥 Health Check Results')
      console.log('═'.repeat(40))
      console.log(`Status: ${health.status === 'healthy' ? '✅ Healthy' : '❌ Unhealthy'}`)
      console.log(`Uptime: ${Math.floor(health.uptime)}s`)
      console.log('\nServices:')

      for (const [service, status] of Object.entries(health.services)) {
        const icon = status ? '✅' : '❌'
        console.log(`  ${icon} ${service}`)
      }

      if (health.metrics) {
        console.log('\nMetrics:')
        for (const [metric, value] of Object.entries(health.metrics)) {
          console.log(`  📊 ${metric}: ${value}`)
        }
      }

      await server.shutdown()
      process.exit(health.status === 'healthy' ? 0 : 1)
    }

    // Normal server startup
    logger.info({
      config: {
        logLevel: config.logLevel,
        workspace: config.workspaceDir,
        mockMode: options.mock,
        devMode: options.dev
      }
    }, 'Starting Container Kit MCP Server')

    console.log('🚀 Starting Container Kit MCP Server...')
    console.log(`📦 Version: ${packageJson.version}`)
    console.log(`🏠 Workspace: ${config.workspaceDir}`)
    console.log(`📊 Log Level: ${config.logLevel}`)

    if (options.mock) {
      console.log('🤖 Running with mock AI sampler')
    }

    if (options.dev) {
      console.log('🔧 Development mode enabled')
    }

    await server.start()

    console.log('✅ Server started successfully')
    console.log('🔌 Listening on stdio transport')

    // Setup graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      logger.info({ signal }, 'Shutting down')
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`)

      try {
        await server.shutdown()
        console.log('✅ Shutdown complete')
        process.exit(0)
      } catch (error) {
        logger.error({ error }, 'Shutdown error')
        console.error('❌ Shutdown error:', error)
        process.exit(1)
      }
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))

  } catch (error) {
    logger.error({ error }, 'Server startup failed')
    console.error('❌ Server startup failed:', error)

    if (error instanceof Error) {
      console.error('\nError details:')
      console.error(`  Message: ${error.message}`)
      if (error.stack && options.dev) {
        console.error(`  Stack: ${error.stack}`)
      }
    }

    process.exit(1)
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception in CLI')
  console.error('❌ Uncaught exception:', error)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'Unhandled rejection in CLI')
  console.error('❌ Unhandled rejection:', reason)
  process.exit(1)
})

// Run the CLI
main()

