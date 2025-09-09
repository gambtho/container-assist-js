/**
 * Example: Integration with MCP SDK
 * Shows how to register Container Assist tools with an MCP server
 */

import { Server } from '@modelcontextprotocol/sdk';
import { 
  configureTools,
  registerAllTools, 
  registerTool,
  tools 
} from '@thgamble/containerization-assist-mcp';

/**
 * Example 1: Register all tools with default names
 */
async function registerAllToolsExample() {
  console.log('=== Register All Tools Example ===\n');
  
  const server = new Server({
    name: 'my-mcp-server',
    version: '1.0.0'
  });
  
  // IMPORTANT: Configure tools with your server for AI sampling support
  configureTools({ server });
  
  // Register all Container Assist tools at once
  registerAllTools(server);
  
  console.log('All tools registered successfully!\n');
  console.log('Tools now have access to AI sampling through your server\n');
  
  // Start the server
  await server.start();
}

/**
 * Example 2: Register specific tools with custom names
 */
async function registerCustomToolsExample() {
  console.log('=== Custom Tool Registration Example ===\n');
  
  const server = new Server({
    name: 'my-custom-server',
    version: '1.0.0'
  });
  
  // Configure tools first
  configureTools({ server });
  
  // Register specific tools with custom names
  registerTool(server, tools.analyzeRepo, 'analyze_repository');
  registerTool(server, tools.buildImage, 'docker_build');
  registerTool(server, tools.deployApplication, 'k8s_deploy');
  
  console.log('Custom tools registered:');
  console.log('- analyze_repository (was: analyze_repo)');
  console.log('- docker_build (was: build_image)');
  console.log('- k8s_deploy (was: deploy_application)\n');
  
  await server.start();
}

/**
 * Example 3: Register tools with name mapping
 */
async function registerWithMappingExample() {
  console.log('=== Name Mapping Example ===\n');
  
  const server = new Server({
    name: 'mapped-server',
    version: '1.0.0'
  });
  
  // Define custom names for all tools
  const nameMapping = {
    analyzeRepo: 'project_analyze',
    generateDockerfile: 'dockerfile_create',
    buildImage: 'image_build',
    scanImage: 'security_scan',
    deployApplication: 'app_deploy',
    verifyDeployment: 'deployment_check'
  };
  
  // Register all tools with custom names
  registerAllTools(server, nameMapping);
  
  console.log('Tools registered with custom names:');
  Object.entries(nameMapping).forEach(([original, custom]) => {
    console.log(`- ${custom} (was: ${original})`);
  });
  console.log('');
  
  await server.start();
}

// Run examples (choose one)
if (import.meta.url === `file://${process.argv[1]}`) {
  const example = process.argv[2] || 'all';
  
  switch (example) {
    case 'all':
      await registerAllToolsExample();
      break;
    case 'custom':
      await registerCustomToolsExample();
      break;
    case 'mapping':
      await registerWithMappingExample();
      break;
    default:
      console.log('Usage: tsx mcp-integration.ts [all|custom|mapping]');
  }
}

export { 
  registerAllToolsExample, 
  registerCustomToolsExample, 
  registerWithMappingExample 
};