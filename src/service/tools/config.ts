// Tool configurations with Java application focus

export interface ToolSchema {
  type: string
  properties: Record<string, {
    type: string
    description?: string
  }>
  required?: string[]
}

export interface ToolConfig {
  name: string
  description: string
  category: 'workflow' | 'orchestration' | 'utility' | 'optimization'
  nextTool: string | null
  chainReason: string | null
  schema: ToolSchema
}

export const TOOL_CHAIN: ToolConfig[] = [
  // Repository Analysis
  {
    name: 'analyze_repository',
    description: 'Analyze Java repository to detect build system, framework, and dependencies',
    category: 'workflow',
    nextTool: 'resolve_base_images',
    chainReason: 'Repository analyzed successfully. Ready to resolve base images',
    schema: {
      type: 'object',
      properties: {
        repo_path: {
          type: 'string',
          description: 'Path to the Java repository to analyze'
        }
      },
      required: ['repo_path']
    }
  },

  // Base Image Resolution
  {
    name: 'resolve_base_images',
    description: 'Resolve optimal JDK/JRE base images based on Java version and framework',
    category: 'workflow',
    nextTool: 'generate_dockerfile',
    chainReason: 'Base images resolved. Ready to generate Dockerfile',
    schema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID for workflow state'
        }
      },
      required: ['session_id']
    }
  },

  // Dockerfile Generation
  {
    name: 'generate_dockerfile',
    description: 'Generate optimized multi-stage Dockerfile for Java application',
    category: 'workflow',
    nextTool: 'build_image',
    chainReason: 'Dockerfile generated. Ready to build container image',
    schema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID for workflow state'
        }
      },
      required: ['session_id']
    }
  },

  // Docker Build
  {
    name: 'build_image',
    description: 'Build Docker image from generated Dockerfile',
    category: 'workflow',
    nextTool: 'scan_image',
    chainReason: 'Image built successfully. Ready for security scanning',
    schema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID for workflow state'
        }
      },
      required: ['session_id']
    }
  },

  // Security Scanning
  {
    name: 'scan_image',
    description: 'Scan Docker image for security vulnerabilities',
    category: 'workflow',
    nextTool: 'tag_image',
    chainReason: 'Security scan complete. Ready to tag image',
    schema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID for workflow state'
        }
      },
      required: ['session_id']
    }
  },

  // Image Tagging
  {
    name: 'tag_image',
    description: 'Tag Docker image with version and metadata',
    category: 'workflow',
    nextTool: 'push_image',
    chainReason: 'Image tagged. Ready to push to registry',
    schema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID for workflow state'
        },
        tag: {
          type: 'string',
          description: 'Tag for the Docker image (e.g., v1.0.0, latest)'
        }
      },
      required: ['session_id', 'tag']
    }
  },

  // Registry Push
  {
    name: 'push_image',
    description: 'Push Docker image to container registry',
    category: 'workflow',
    nextTool: 'generate_k8s_manifests',
    chainReason: 'Image pushed to registry. Ready to generate Kubernetes manifests',
    schema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID for workflow state'
        },
        registry: {
          type: 'string',
          description: 'Container registry URL (optional)'
        }
      },
      required: ['session_id']
    }
  },

  // Kubernetes Manifest Generation
  {
    name: 'generate_k8s_manifests',
    description: 'Generate Kubernetes manifests with Spring Boot actuator support',
    category: 'workflow',
    nextTool: 'prepare_cluster',
    chainReason: 'Kubernetes manifests generated. Ready to prepare cluster',
    schema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID for workflow state'
        }
      },
      required: ['session_id']
    }
  },

  // Cluster Preparation
  {
    name: 'prepare_cluster',
    description: 'Prepare Kubernetes cluster for deployment',
    category: 'workflow',
    nextTool: 'deploy_application',
    chainReason: 'Cluster prepared. Ready to deploy application',
    schema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID for workflow state'
        }
      },
      required: ['session_id']
    }
  },

  // Application Deployment
  {
    name: 'deploy_application',
    description: 'Deploy Java application to Kubernetes',
    category: 'workflow',
    nextTool: 'verify_deployment',
    chainReason: 'Application deployed. Ready to verify deployment',
    schema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID for workflow state'
        }
      },
      required: ['session_id']
    }
  },

  // Deployment Verification
  {
    name: 'verify_deployment',
    description: 'Verify deployment health and Spring Boot actuator endpoints',
    category: 'workflow',
    nextTool: null,
    chainReason: 'Deployment verified successfully!',
    schema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID for workflow state'
        }
      },
      required: ['session_id']
    }
  },

  // Orchestration Tools
  {
    name: 'start_workflow',
    description: 'Start complete Java application containerization workflow',
    category: 'orchestration',
    nextTool: 'workflow_status',
    chainReason: 'Workflow started. Use workflow_status to check progress',
    schema: {
      type: 'object',
      properties: {
        repo_path: {
          type: 'string',
          description: 'Path to the Java repository'
        },
        automated: {
          type: 'boolean',
          description: 'Run complete workflow automatically'
        },
        deploy: {
          type: 'boolean',
          description: 'Deploy to Kubernetes (default: true)'
        },
        scan: {
          type: 'boolean',
          description: 'Run security scans (default: true)'
        }
      },
      required: ['repo_path']
    }
  },

  {
    name: 'workflow_status',
    description: 'Check the status of a running workflow',
    category: 'orchestration',
    nextTool: null,
    chainReason: null,
    schema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID to check status for'
        }
      },
      required: ['session_id']
    }
  },

  // Utility Tools
  {
    name: 'list_tools',
    description: 'List all available MCP tools',
    category: 'utility',
    nextTool: null,
    chainReason: null,
    schema: {
      type: 'object',
      properties: {}
    }
  },

  {
    name: 'ping',
    description: 'Test MCP server connectivity',
    category: 'utility',
    nextTool: null,
    chainReason: null,
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Optional message to echo back'
        }
      }
    }
  },

  {
    name: 'server_status',
    description: 'Get server status and configuration',
    category: 'utility',
    nextTool: null,
    chainReason: null,
    schema: {
      type: 'object',
      properties: {
        details: {
          type: 'boolean',
          description: 'Include detailed status information'
        }
      }
    }
  },

  // Java-Specific Tools
  {
    name: 'fix_dockerfile',
    description: 'Fix Dockerfile based on build errors',
    category: 'workflow',
    nextTool: 'build_image',
    chainReason: 'Dockerfile fixed. Ready to retry build',
    schema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID for workflow state'
        },
        error_message: {
          type: 'string',
          description: 'Error message from failed build'
        }
      },
      required: ['session_id', 'error_message']
    }
  },

  {
    name: 'optimize_jvm',
    description: 'Optimize JVM settings for container environment',
    category: 'optimization',
    nextTool: null,
    chainReason: null,
    schema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID for workflow state'
        },
        memory_limit: {
          type: 'string',
          description: 'Container memory limit (e.g., 1Gi)'
        },
        cpu_limit: {
          type: 'number',
          description: 'CPU core limit'
        }
      },
      required: ['session_id']
    }
  }
]

// Helper function to get tool by name
export function getToolConfig(name: string): ToolConfig | undefined {
  return TOOL_CHAIN.find(tool => tool.name === name)
}

// Helper function to get tools by category
export function getToolsByCategory(category: ToolConfig['category']): ToolConfig[] {
  return TOOL_CHAIN.filter(tool => tool.category === category)
}


