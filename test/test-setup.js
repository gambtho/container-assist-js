/**
 * Enhanced Test Setup - Phase 8 Testing Framework
 * Provides utilities and mocks for testing the JavaScript MCP implementation
 */

import { Dependencies } from '../src/service/dependencies.js';
import { SessionStoreFactory } from '../src/infrastructure/persistence/store-factory.js';
import { MockMCPSampler } from '../src/infrastructure/ai/mock-sampler.js';
import { createLogger } from '../src/shared/logger.js';
import { ToolRegistry } from '../src/service/tools/enhanced-registry.js';

// Mock server for testing
export class TestMCPServer {
  constructor(dependencies) {
    this.deps = dependencies;
    this.registry = new ToolRegistry(dependencies.logger);
    this.setupTools();
  }

  setupTools() {
    // Import and register all tool handlers
    // This is a simplified version for testing
    this.tools = new Map();
    
    // Register mock implementations of all 15 tools
    const toolDefinitions = [
      { name: 'analyze_repository', category: 'workflow' },
      { name: 'generate_dockerfile', category: 'workflow' },
      { name: 'build_image', category: 'workflow' },
      { name: 'scan_image', category: 'workflow' },
      { name: 'tag_image', category: 'workflow' },
      { name: 'push_image', category: 'workflow' },
      { name: 'generate_k8s_manifests', category: 'workflow' },
      { name: 'prepare_cluster', category: 'workflow' },
      { name: 'deploy_application', category: 'workflow' },
      { name: 'verify_deployment', category: 'workflow' },
      { name: 'start_workflow', category: 'orchestration' },
      { name: 'workflow_status', category: 'orchestration' },
      { name: 'list_tools', category: 'utility' },
      { name: 'ping', category: 'utility' },
      { name: 'server_status', category: 'utility' }
    ];

    for (const tool of toolDefinitions) {
      this.tools.set(tool.name, {
        name: tool.name,
        category: tool.category,
        description: `Mock ${tool.name} tool for testing`,
        handler: this.createMockHandler(tool.name)
      });
    }
  }

  createMockHandler(toolName) {
    return async (params) => {
      // Create realistic mock responses based on tool type
      switch (toolName) {
        case 'analyze_repository':
          return this.mockAnalyzeRepository(params);
        case 'generate_dockerfile':
          return this.mockGenerateDockerfile(params);
        case 'build_image':
          return this.mockBuildImage(params);
        case 'scan_image':
          return this.mockScanImage(params);
        case 'generate_k8s_manifests':
          return this.mockGenerateK8sManifests(params);
        case 'start_workflow':
          return this.mockStartWorkflow(params);
        case 'workflow_status':
          return this.mockWorkflowStatus(params);
        case 'list_tools':
          return this.mockListTools();
        case 'ping':
          return this.mockPing();
        case 'server_status':
          return this.mockServerStatus();
        default:
          return {
            success: true,
            data: { message: `Mock response from ${toolName}` },
            timestamp: new Date().toISOString()
          };
      }
    };
  }

  async mockAnalyzeRepository(params) {
    const { repoPath } = params;
    
    // Determine language based on repo path
    let language = 'java';
    let framework = 'spring-boot';
    let buildSystem = { type: 'maven' };
    let ports = [8080];
    
    if (repoPath && repoPath.includes('node-express')) {
      language = 'javascript';
      framework = 'express';
      buildSystem = { type: 'npm' };
      ports = [3000];
    } else if (repoPath && repoPath.includes('python-flask')) {
      language = 'python';
      framework = 'flask';
      buildSystem = { type: 'pip' };
      ports = [5000];
    } else if (repoPath && repoPath.includes('dotnet')) {
      language = 'csharp';
      framework = 'aspnet-core';
      buildSystem = { type: 'dotnet' };
      ports = [80];
    }

    return {
      success: true,
      data: {
        language,
        framework,
        buildSystem,
        ports,
        required_ports: ports,
        dependencies: ['test-dependency-1', 'test-dependency-2'],
        hasTests: true,
        hasDockerfile: false,
        confidence: 0.95
      },
      timestamp: new Date().toISOString()
    };
  }

  async mockGenerateDockerfile(params) {
    const dockerfileContent = `FROM openjdk:17-slim
WORKDIR /app
COPY target/*.jar app.jar
USER appuser
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]`;

    return {
      success: true,
      data: {
        dockerfile: dockerfileContent,
        content: dockerfileContent,
        path: 'Dockerfile'
      },
      timestamp: new Date().toISOString()
    };
  }

  async mockBuildImage(params) {
    return {
      success: true,
      data: {
        imageId: 'sha256:abcd1234567890',
        size: 245678901,
        layers: ['layer1', 'layer2', 'layer3'],
        tags: [params.tag || 'test:latest']
      },
      timestamp: new Date().toISOString()
    };
  }

  async mockScanImage(params) {
    return {
      success: true,
      data: {
        status: 'completed',
        vulnerabilities: [
          { severity: 'medium', package: 'test-package', version: '1.0.0' }
        ],
        summary: {
          critical: 0,
          high: 1,
          medium: 2,
          low: 5
        },
        scannerUsed: 'trivy'
      },
      timestamp: new Date().toISOString()
    };
  }

  async mockGenerateK8sManifests(params) {
    const manifestContent = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
  labels:
    app: test-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: test-app
  template:
    metadata:
      labels:
        app: test-app
    spec:
      containers:
      - name: app
        image: test:latest
        ports:
        - containerPort: 8080
        resources:
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: test-app-service
spec:
  selector:
    app: test-app
  ports:
  - port: 80
    targetPort: 8080
  type: ClusterIP`;

    return {
      success: true,
      data: {
        manifests: manifestContent,
        content: manifestContent,
        files: ['deployment.yaml', 'service.yaml']
      },
      timestamp: new Date().toISOString()
    };
  }

  async mockStartWorkflow(params) {
    return {
      success: true,
      data: {
        workflowId: params.sessionId || 'mock-workflow-123',
        sessionId: params.sessionId || 'mock-workflow-123',
        status: 'running',
        startTime: new Date().toISOString(),
        workflowType: params.workflowType || 'full',
        steps: ['analyze_repository', 'generate_dockerfile', 'build_image']
      },
      timestamp: new Date().toISOString()
    };
  }

  async mockWorkflowStatus(params) {
    return {
      success: true,
      data: {
        status: 'completed',
        progress: 100,
        currentStep: null,
        completedSteps: ['analyze_repository', 'generate_dockerfile', 'build_image'],
        failedSteps: [],
        duration: 45000,
        artifacts: {
          dockerfile: 'Dockerfile',
          image: 'test:latest',
          manifests: 'k8s-manifests.yaml'
        }
      },
      timestamp: new Date().toISOString()
    };
  }

  async mockListTools() {
    const tools = Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      category: tool.category
    }));

    return {
      success: true,
      data: {
        tools,
        count: tools.length
      },
      timestamp: new Date().toISOString()
    };
  }

  async mockPing() {
    return {
      success: true,
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        server: 'test-mcp-server'
      },
      timestamp: new Date().toISOString()
    };
  }

  async mockServerStatus() {
    return {
      success: true,
      data: {
        status: 'healthy',
        version: '1.0.0-test',
        uptime: 12345,
        memory: process.memoryUsage(),
        nodejs: process.version
      },
      timestamp: new Date().toISOString()
    };
  }

  async executeTool(toolName, params) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        success: false,
        error: {
          code: 'tool_not_found',
          message: `Tool ${toolName} not found`
        },
        timestamp: new Date().toISOString()
      };
    }

    try {
      const result = await tool.handler(params);
      return result;
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'tool_execution_error',
          message: error.message
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  async shutdown() {
    // Cleanup resources
    if (this.deps && this.deps.sessionService) {
      await this.deps.sessionService.close();
    }
  }
}

// Factory function for creating test server
export async function createTestServer(config = {}) {
  const logger = createLogger({ level: 'error' }); // Reduce noise in tests
  
  const dependencies = new Dependencies({
    workspaceDir: config.workspaceDir || '/tmp/test-workspace',
    session: {
      store: 'memory',
      ttl: 3600,
      maxSessions: 100
    },
    features: {
      aiEnabled: config.features?.aiEnabled ?? false,
      mockMode: config.features?.mockMode ?? true
    },
    ...config
  });

  await dependencies.initialize();
  
  return new TestMCPServer(dependencies);
}

// Jest globals setup
export function setupJestGlobals() {
  // Set longer timeout for integration tests
  jest.setTimeout(30000);
  
  // Global test configuration
  global.testConfig = {
    timeout: 30000,
    retries: 2
  };
}