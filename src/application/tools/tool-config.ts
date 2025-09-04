/**
 * Tool Configuration for Dependency Injection
 * Provides metadata for available MCP tools
 */

export interface ToolConfig {
  name: string;
  description: string;
  category: string;
}

/**
 * Get tool configuration by name
 */
export function getToolConfig(toolName: string): ToolConfig {
  const configs: Record<string, ToolConfig> = {
    // Analysis tools
    analyze_repository: {
      name: 'analyze_repository',
      description: 'Analyze repository structure and dependencies',
      category: 'workflow',
    },

    // Build tools
    build_image: {
      name: 'build_image',
      description: 'Build Docker image from Dockerfile',
      category: 'workflow',
    },

    scan_image: {
      name: 'scan_image',
      description: 'Scan Docker image for vulnerabilities',
      category: 'workflow',
    },

    tag_image: {
      name: 'tag_image',
      description: 'Tag Docker image with new tag',
      category: 'workflow',
    },

    push_image: {
      name: 'push_image',
      description: 'Push Docker image to registry',
      category: 'workflow',
    },

    generate_dockerfile: {
      name: 'generate_dockerfile',
      description: 'Generate Dockerfile from repository analysis',
      category: 'workflow',
    },

    // Deploy tools
    generate_k8s_manifests: {
      name: 'generate_k8s_manifests',
      description: 'Generate Kubernetes manifests',
      category: 'workflow',
    },

    deploy_application: {
      name: 'deploy_application',
      description: 'Deploy application to Kubernetes cluster',
      category: 'workflow',
    },

    // Ops tools
    ping: {
      name: 'ping',
      description: 'Health check for the server',
      category: 'utility',
    },

    list_tools: {
      name: 'list_tools',
      description: 'List all available tools',
      category: 'utility',
    },

    server_status: {
      name: 'server_status',
      description: 'Get server status and health',
      category: 'utility',
    },
  };

  const config = configs[toolName];
  if (!config) {
    throw new Error(`No configuration found for tool: ${toolName}`);
  }

  return config;
}
