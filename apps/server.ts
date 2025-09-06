/**
 * Containerization Assist MCP Server - New Architecture Entry Point
 * Simple entry point that starts the consolidated MCP server
 */

import { ContainerizationMCPServer } from '../src/mcp/server.js';
import { createLogger } from '../src/lib/logger.js';
import { config as applicationConfig } from '../src/config/index.js';
import process from 'node:process';

async function main() {
  const logger = createLogger({
    name: 'containerization-assist-server',
    level: applicationConfig.logging?.level ?? 'info'
  });

  try {
    logger.info('Starting Containerization Assist MCP Server');

    // Create and start the MCP server
    const server = new ContainerizationMCPServer();
    await server.start();

    logger.info('MCP Server started successfully');

    // Handle graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down server...');
      try {
        await server.stop();
        logger.info('Server shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error({ error }, 'Error during shutdown');
        process.exit(1);
      }
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('SIGQUIT', shutdown);

    // Keep the process alive
    process.stdin.resume();

  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}