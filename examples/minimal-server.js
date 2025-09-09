#!/usr/bin/env node

/**
 * Minimal MCP server example with Container Assist tools
 * This is the simplest possible working example
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Import Container Assist tools
import { ContainerAssistServer } from '@thgamble/containerization-assist-mcp';

async function main() {
  console.error('Starting MCP server with Container Assist tools...');
  
  try {
    // Create the MCP server
    const server = new Server(
      {
        name: 'container-assist-example',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Create Container Assist instance and bind tools
    console.error('Setting up Container Assist tools...');
    const caServer = new ContainerAssistServer();
    
    // Register specific tools (or use bindAll for all tools)
    caServer.bindSampling({ server });
    caServer.registerTools(
      { server },
      { tools: ['analyze_repo', 'generate_dockerfile', 'build_image'] }
    );
    
    // Create stdio transport
    const transport = new StdioServerTransport();
    
    // Connect server to transport
    await server.connect(transport);
    
    console.error('✅ MCP server started successfully with Container Assist tools');
    console.error('Available tools: analyze_repo, generate_dockerfile, build_image');
    
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

// Run the server
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});