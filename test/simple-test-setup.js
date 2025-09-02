/**
 * Simple Test Setup - Testing Framework
 * Provides basic utilities for testing with existing JavaScript infrastructure
 */

import { createPinoLogger } from '../src/shared/logger.js';

// Mock server for testing that doesn't rely on TypeScript files
export class TestMCPServer {
  constructor(config = {}) {
    this.config = config;
    this.logger = createPinoLogger({ logLevel: 'error' }); // Reduce noise in tests
    this.sessions = new Map(); // Store session state for tool chaining
    this.setupTools();
  }

  // Session state management
  getSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        createdAt: new Date().toISOString(),
        analysis: null,
        dockerfile: null,
        buildResult: null,
        scanResult: null,
        k8sManifests: null,
        workflowStatus: 'initialized',
        completedSteps: [],
        artifacts: {}
      });
    }
    return this.sessions.get(sessionId);
  }

  updateSession(sessionId, updates) {
    const session = this.getSession(sessionId);
    Object.assign(session, updates);
    return session;
  }

  setupTools() {
    // Register mock implementations of all 15 tools
    this.tools = new Map();
    
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
    const { repoPath, sessionId } = params || {};
    
    // Determine language based on repo path
    let language = 'java';
    let framework = 'spring-boot';
    let buildSystem = { type: 'maven' };
    let ports = [8080];
    let packageManager = 'maven';
    
    if (repoPath && repoPath.includes('node-express')) {
      language = 'javascript';
      framework = 'express';
      buildSystem = { type: 'npm' };
      packageManager = 'npm';
      ports = [3000];
    } else if (repoPath && repoPath.includes('python-flask')) {
      language = 'python';
      framework = 'flask';
      buildSystem = { type: 'pip' };
      packageManager = 'pip';
      ports = [5000];
    } else if (repoPath && repoPath.includes('dotnet')) {
      language = 'csharp';
      framework = 'aspnet-core';
      buildSystem = { type: 'dotnet' };
      packageManager = 'dotnet';
      ports = [80];
    }

    const analysisData = {
      language,
      framework,
      buildSystem,
      packageManager,
      ports,
      required_ports: ports,
      dependencies: ['test-dependency-1', 'test-dependency-2'],
      hasTests: true,
      hasDockerfile: false,
      confidence: 0.95,
      repoPath
    };

    // Store analysis results in session if sessionId provided
    if (sessionId) {
      this.updateSession(sessionId, {
        analysis: analysisData,
        workflowStatus: 'analyzing',
        completedSteps: ['analyze_repository']
      });
    }

    return {
      success: true,
      data: analysisData,
      timestamp: new Date().toISOString()
    };
  }

  async mockGenerateDockerfile(params) {
    const { sessionId } = params || {};
    let dockerfileContent = '';
    let language = 'java'; // default
    let port = 8080;

    // Get analysis results from session if available
    if (sessionId) {
      const session = this.getSession(sessionId);
      if (session.analysis) {
        language = session.analysis.language;
        port = session.analysis.ports[0] || port;
      }
    }

    // Generate language-specific Dockerfile
    switch (language) {
      case 'javascript':
        dockerfileContent = `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:${port}/health || exit 1
EXPOSE ${port}
CMD ["node", "server.js"]`;
        break;
      
      case 'python':
        dockerfileContent = `FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN adduser --disabled-password appuser
USER appuser
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:${port}/health || exit 1
EXPOSE ${port}
CMD ["python", "app.py"]`;
        break;
      
      case 'csharp':
        dockerfileContent = `FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /app
COPY *.csproj .
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o out

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
RUN groupadd -r appuser && useradd -r -g appuser appuser
COPY --from=build /app/out .
RUN chown -R appuser:appuser /app
USER appuser
HEALTHCHECK --interval=30s --timeout=10s CMD curl -f http://localhost/health || exit 1
EXPOSE ${port}
ENTRYPOINT ["dotnet", "TestWebApi.dll"]`;
        break;
      
      case 'java':
      default:
        dockerfileContent = `FROM openjdk:17-slim
WORKDIR /app
COPY target/*.jar app.jar
USER appuser
EXPOSE ${port}
ENTRYPOINT ["java", "-jar", "app.jar"]`;
        break;
    }

    const dockerfileData = {
      dockerfile: dockerfileContent,
      content: dockerfileContent,
      path: 'Dockerfile',
      language
    };

    // Store Dockerfile results in session
    if (sessionId) {
      const session = this.getSession(sessionId);
      this.updateSession(sessionId, {
        dockerfile: dockerfileData,
        workflowStatus: 'dockerfile-generated',
        completedSteps: [...session.completedSteps, 'generate_dockerfile'].filter((v, i, a) => a.indexOf(v) === i),
        artifacts: { ...session.artifacts, dockerfile: 'Dockerfile' }
      });
    }

    return {
      success: true,
      data: dockerfileData,
      timestamp: new Date().toISOString()
    };
  }

  async mockBuildImage(params) {
    const { sessionId, tag } = params || {};
    const imageTag = tag || 'test:latest';
    
    const buildData = {
      imageId: `sha256:${Math.random().toString(36).substring(7)}1234567890`,
      size: 245678901,
      layers: ['layer1', 'layer2', 'layer3'],
      tags: [imageTag]
    };

    // Store build results in session
    if (sessionId) {
      const session = this.getSession(sessionId);
      this.updateSession(sessionId, {
        buildResult: buildData,
        workflowStatus: 'image-built',
        completedSteps: [...session.completedSteps, 'build_image'].filter((v, i, a) => a.indexOf(v) === i),
        artifacts: { ...session.artifacts, image: imageTag }
      });
    }

    return {
      success: true,
      data: buildData,
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
    const { sessionId, port } = params || {};
    let containerPort = port || 8080;
    let imageTag = 'test:latest';
    
    // Get session-specific analysis data if available
    if (sessionId) {
      const session = this.getSession(sessionId);
      if (session.analysis) {
        containerPort = session.analysis.ports[0] || containerPort;
      }
      if (session.buildResult) {
        imageTag = session.buildResult.tags[0] || imageTag;
      }
    }
    
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
        image: ${imageTag}
        ports:
        - containerPort: ${containerPort}
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
    targetPort: ${containerPort}
  type: ClusterIP`;

    // Store K8s results in session
    if (sessionId) {
      const session = this.getSession(sessionId);
      this.updateSession(sessionId, {
        k8sManifests: { manifests: manifestContent, files: ['deployment.yaml', 'service.yaml'] },
        workflowStatus: 'k8s-generated',
        completedSteps: [...session.completedSteps, 'generate_k8s_manifests'].filter((v, i, a) => a.indexOf(v) === i),
        artifacts: { ...session.artifacts, manifests: 'k8s-manifests.yaml' }
      });
    }

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
    const { sessionId, workflowType, workflow_type } = params || {};
    const finalWorkflowType = workflowType || workflow_type || 'full';
    const finalSessionId = sessionId || 'mock-workflow-123';
    
    // Determine workflow steps based on type
    let workflowSteps = ['analyze_repository', 'generate_dockerfile', 'build_image'];
    if (finalWorkflowType === 'full') {
      workflowSteps = ['analyze_repository', 'generate_dockerfile', 'build_image', 'scan_image', 'generate_k8s_manifests'];
    } else if (finalWorkflowType === 'build-only') {
      workflowSteps = ['analyze_repository', 'generate_dockerfile', 'build_image'];
    }
    
    // Initialize workflow session if sessionId provided and simulate execution
    if (sessionId) {
      this.updateSession(sessionId, {
        workflowStatus: 'completed', // Simulate immediate completion for testing
        completedSteps: workflowSteps, // Simulate all steps completed
        artifacts: {
          dockerfile: 'Dockerfile',
          image: `${sessionId}:latest`,
          manifests: finalWorkflowType === 'full' ? 'k8s-manifests.yaml' : undefined
        },
        workflowType: finalWorkflowType,
        startTime: new Date().toISOString()
      });
    }
    
    return {
      success: true,
      data: {
        workflowId: finalSessionId,
        sessionId: finalSessionId,
        status: 'running',
        startTime: new Date().toISOString(),
        workflowType: finalWorkflowType,
        workflow_type: finalWorkflowType,
        steps: workflowSteps
      },
      timestamp: new Date().toISOString()
    };
  }

  async mockWorkflowStatus(params) {
    const { sessionId } = params || {};
    
    // Return session-specific data if sessionId provided
    if (sessionId) {
      const session = this.getSession(sessionId);
      const progress = Math.min(session.completedSteps.length * 20, 100); // 20% per step, max 100%
      
      // Include session-specific analysis data to ensure isolation
      const sessionSpecificData = {
        sessionId, // Include the session ID to ensure uniqueness
        language: session.analysis?.language,
        framework: session.analysis?.framework,
        detectedPorts: session.analysis?.ports
      };
      
      return {
        success: true,
        data: {
          status: session.workflowStatus || 'completed',
          progress,
          currentStep: progress < 100 ? 'in_progress' : null,
          completedSteps: session.completedSteps || [],
          failedSteps: [],
          duration: session.completedSteps.length * 15000, // 15 seconds per step
          artifacts: session.artifacts || {},
          sessionInfo: sessionSpecificData // Include session-specific info
        },
        timestamp: new Date().toISOString()
      };
    }
    
    // Fallback to default data if no sessionId
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
    this.logger.info('Test server shutdown');
  }
}

// Factory function for creating test server
export async function createTestServer(config = {}) {
  return new TestMCPServer(config);
}