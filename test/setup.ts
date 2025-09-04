/**
 * Unified Test Setup - Container Kit MCP Server
 * Consolidates all test configuration, mocks, and utilities
 */

import { createPinoLogger } from '../src/infrastructure/core/logger.js';
import { nanoid } from 'nanoid';
import type { Logger } from 'pino';

console.log('Setting up tests for Container Kit MCP TypeScript implementation');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
process.env.SILENT_TESTS = 'true';

// Jest configuration
if (typeof jest !== 'undefined') {
  jest.setTimeout(30000);
}

// Global test utilities
(global as any).testTimeout = 30000;
(global as any).testConfig = {
  timeout: 30000,
  retries: 2
};

// Mock console methods to reduce noise in tests unless explicitly needed
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

// Only show test progress logs, not verbose component logs
console.log = (...args: any[]) => {
  const message = args.join(' ');
  if (message.includes('✓') || message.includes('⚠') || message.includes('ℹ') || 
      message.includes('Docker') || message.includes('PASS') || message.includes('FAIL')) {
    originalLog(...args);
  }
};

console.warn = (...args: any[]) => {
  const message = args.join(' ');
  if (message.includes('Docker') || message.includes('Trivy') || message.includes('Test')) {
    originalWarn(...args);
  }
};

// Always show errors
console.error = originalError;

// Test utilities
export class TestMCPServer {
  private tools = new Map();
  private sessions = new Map();
  private logger: Logger;
  
  constructor(config: any = {}) {
    this.logger = createPinoLogger({ level: 'error' }); // Reduce noise in tests
    this.setupTools();
  }

  // Session state management for stateful tool testing
  getSession(sessionId: string) {
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

  updateSession(sessionId: string, updates: any) {
    const session = this.getSession(sessionId);
    Object.assign(session, updates);
    return session;
  }

  private setupTools() {
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

  private createMockHandler(toolName: string) {
    return async (params: any) => {
      // Create realistic mock responses
      switch (toolName) {
        case 'analyze_repository':
          return this.mockAnalyzeRepository(params);
        case 'generate_dockerfile':
          return this.mockGenerateDockerfile(params);
        case 'build_image':
          return this.mockBuildImage(params);
        case 'ping':
          return {
            success: true,
            data: {
              status: 'ok',
              timestamp: new Date().toISOString(),
              server: 'test-mcp-server'
            },
            timestamp: new Date().toISOString()
          };
        default:
          return {
            success: true,
            data: { message: `Mock response from ${toolName}` },
            timestamp: new Date().toISOString()
          };
      }
    };
  }

  private async mockAnalyzeRepository(params: any) {
    const { repoPath, sessionId } = params || {};
    
    // Determine language based on repo path
    let language = 'java';
    let framework = 'spring-boot';
    let ports = [8080];
    
    if (repoPath?.includes('node-express')) {
      language = 'javascript';
      framework = 'express';
      ports = [3000];
    }

    const analysisData = {
      language,
      framework,
      ports,
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

  private async mockGenerateDockerfile(params: any) {
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

  private async mockBuildImage(params: any) {
    return {
      success: true,
      data: {
        imageId: `sha256:${nanoid()}1234567890`,
        size: 245678901,
        layers: ['layer1', 'layer2', 'layer3'],
        tags: [params?.tag || 'test:latest']
      },
      timestamp: new Date().toISOString()
    };
  }

  async executeTool(toolName: string, params: any) {
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
    } catch (error: any) {
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
    this.logger.info('Test server shutdown');
  }
}

// Factory function for creating test server
export async function createTestServer(config: any = {}) {
  return new TestMCPServer(config);
}

// Mock factories for common test objects
export function createMockSession(overrides: any = {}) {
  const now = new Date().toISOString();
  return {
    id: nanoid(),
    workspaceDir: '/tmp/test-workspace',
    createdAt: now,
    updatedAt: now,
    status: 'active',
    workflow: null,
    ...overrides
  };
}

// Export empty object to make this a module
export {};