#!/usr/bin/env node

/**
 * Minimal MCP server example with Container Assist tools
 * This is the simplest possible working example
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Import Container Assist tools
import { 
  configureTools, 
  analyzeRepo,
  generateDockerfile,
  buildImage,
  registerTool 
} from '@thgamble/containerization-assist-mcp';

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

    // IMPORTANT: Configure tools with the server for AI sampling
    console.error('Configuring tools...');
    configureTools({ server });
    
    // Register the tools you want
    console.error('Registering tools...');
    registerTool(server, analyzeRepo);
    registerTool(server, generateDockerfile);
    registerTool(server, buildImage);
    
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