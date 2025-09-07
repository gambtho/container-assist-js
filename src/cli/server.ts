/**
 * Containerization Assist MCP Server - SDK-Native Entry Point
 * Uses direct SDK patterns with Zod schemas
 */

import { MCPServer } from '../mcp/server/mcp-server';
import { createLogger } from '../lib/logger';
import { config as applicationConfig } from '../config/index';
import process from 'node:process';

async function main(): Promise<void> {
  // Set MCP mode to ensure logs go to stderr, not stdout (prevents JSON-RPC corruption)
  process.env.MCP_MODE = 'true';

  const logger = createLogger({
    name: 'containerization-assist-server',
    level: applicationConfig.logging?.level ?? 'info',
  });

  try {
    logger.info('Starting SDK-Native MCP Server with Zod schemas');

    // Create and start the SDK-native server
    const server = new MCPServer(logger, {
      name: 'containerization-assist',
      version: '2.0.0',
    });
    await server.start();

    logger.info('MCP Server started successfully');

    // Handle graceful shutdown
    const shutdown = async (): Promise<void> => {
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

    process.on('SIGINT', () => {
      void shutdown();
    });
    process.on('SIGTERM', () => {
      void shutdown();
    });
    process.on('SIGQUIT', () => {
      void shutdown();
    });

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
