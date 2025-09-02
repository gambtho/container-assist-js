#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createLogger } from './src/infrastructure/core/logger.js'
import { Config } from './src/service/config/config.js'
import { ToolRegistry } from './src/service/tools/registry.js'
import { Dependencies } from './src/service/dependencies.js'
import process from 'process'

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2)
  
  if (args.includes('--version')) {
    console.log('container-kit-mcp v1.0.0')
    process.exit(0)
  }

  if (args.includes('--help')) {
    console.log(`
Container Kit MCP Server - Java Application Containerization

Usage: container-kit-mcp [options]

Options:
  --version    Show version information
  --help       Show this help message
  --config     Path to .env configuration file
  --dev        Run in development mode with verbose logging

Environment Variables:
  WORKSPACE_DIR      Working directory for operations
  MCP_STORE_PATH     Path to session storage
  LOG_LEVEL          Logging level (debug, info, warn, error)
    `)
    process.exit(0)
  }

  try {
    // Initialize configuration
    const config = new Config()
    const logger = createLogger(config)
    
    logger.info('Starting Container Kit MCP Server', {
      version: '1.0.0',
      node: process.version,
      platform: process.platform
    })

    // Create MCP server with sampling capability
    const server = new Server(
      {
        name: 'container-kit',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          sampling: {}  // Enable MCP Sampling for AI integration
        }
      }
    )

    // Build dependencies with MCP server
    const dependencies = new Dependencies({
      config,
      logger,
      mcpServer: server
    })
    await dependencies.initialize()

    // Register tools
    const toolRegistry = new ToolRegistry(server, dependencies)
    await toolRegistry.registerAllTools()
    
    logger.info('Registered tools', {
      count: toolRegistry.getRegisteredTools().length,
      tools: toolRegistry.getRegisteredTools()
    })

    // Connect transport
    const transport = new StdioServerTransport()
    await server.connect(transport)
    
    logger.info('MCP server ready for connections')

    // Handle shutdown gracefully
    process.on('SIGINT', async () => {
      logger.info('Shutting down MCP server...')
      await dependencies.cleanup()
      process.exit(0)
    })

    process.on('SIGTERM', async () => {
      logger.info('Shutting down MCP server...')
      await dependencies.cleanup()
      process.exit(0)
    })

  } catch (error) {
    console.error('Failed to start MCP server:', error)
    process.exit(1)
  }
}

// Run the server
main().catch(error => {
  console.error('Unhandled error:', error)
  process.exit(1)
})