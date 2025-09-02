#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createLogger } from './src/infrastructure/core/logger.js';
import { Config } from './src/service/config/config.js';
import { ToolRegistry } from './src/service/tools/registry.js';
import { Dependencies } from './src/service/dependencies.js';
import process from 'process';

interface ServerInfo {
  name: string;
  version: string;
  node: string;
  platform: NodeJS.Platform;
}

const SERVER_VERSION = '2.0.0';
const SERVER_NAME = 'container-kit-mcp';

function showHelp(): void {
  console.log(`
${SERVER_NAME} - Universal Application Containerization

Usage: ${SERVER_NAME} [options]

Options:
  --version    Show version information
  --help       Show this help message
  --config     Path to .env configuration file
  --dev        Run in development mode with verbose logging

Environment Variables:
  WORKSPACE_DIR      Working directory for operations
  MCP_STORE_PATH     Path to session storage
  LOG_LEVEL          Logging level (debug, info, warn, error)
  NODE_ENV           Environment (development, production, test)
  `);
}

async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);
  
  if (args.includes('--version')) {
    console.log(`${SERVER_NAME} v${SERVER_VERSION}`);
    process.exit(0);
  }

  if (args.includes('--help')) {
    showHelp();
    process.exit(0);
  }

  try {
    // Initialize configuration
    const config = new Config();
    const logger = createLogger(config);
    
    const serverInfo: ServerInfo = {
      name: SERVER_NAME,
      version: SERVER_VERSION,
      node: process.version,
      platform: process.platform
    };
    
    logger.info('Starting Container Kit MCP Server', serverInfo);

    // Create MCP server with sampling capability
    const server = new Server(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          sampling: {}  // Enable MCP Sampling for AI integration
        }
      }
    );

    // Build dependencies with MCP server
    const dependencies = new Dependencies({
      config,
      logger,
      mcpServer: server
    });
    await dependencies.initialize();

    // Register tools
    const toolRegistry = new ToolRegistry(server, dependencies);
    await toolRegistry.registerAllTools();
    
    const registeredTools = toolRegistry.getRegisteredTools();
    logger.info('Registered tools', {);
      count: registeredTools.length,
      tools: registeredTools
    });

    // Connect transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    logger.info('MCP server ready for connections');

    // Handle shutdown gracefully
    const shutdownHandler = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, shutting down MCP server...`);
      try {
        await dependencies.cleanup();
        logger.info('Shutdown completed successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', { error: (error as Error).message });
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdownHandler('SIGINT');
    process.on('SIGTERM', () => shutdownHandler('SIGTERM');

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught exception', { );
        error: error.message, 
        stack: error.stack 
      });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason: any) => {
      logger.error('Unhandled rejection', { reason });
      process.exit(1);
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Failed to start MCP server:', errorMessage);
    process.exit(1);
  }
}

// Run the server
main().catch((error: Error) => {
  console.error('Unhandled error:', error.message);
  process.exit(1);
});