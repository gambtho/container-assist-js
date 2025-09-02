/**
 * Golden Test Matrix - Testing Framework
 * Defines comprehensive test cases for validating feature parity with Go implementation
 */

import { z } from 'zod';

export interface GoldenTestCase {
  name: string;
  description: string;
  input: Record<string, unknown>;
  goldenOutput: string;
  assertions: string[];
  skipExactMatch?: boolean;
  customValidator?: string;
}

// Export JSON schemas for MCP registration
export function exportJsonSchema(schema: z.ZodSchema): unknown {
  // Convert Zod schema to JSON Schema (simplified implementation)
  return {
    type: 'object',
    properties: {},
    additionalProperties: true
  };
}

export const GOLDEN_TEST_MATRIX: Record<string, GoldenTestCase[]> = {
  // Repository Analysis Tests
  analyze_repository: [
    {
      name: 'mcp-server-architecture',
      description: 'MCP Server Architecture Validation',
      input: { 
        repoPath: './test/fixtures/mcp-server-architecture',
        sessionId: 'test-analyze-mcp-server'
      },
      goldenOutput: './test/golden/analyze/mcp-server-architecture.json',
      assertions: ['architecture.consolidated', 'architecture.teams.alpha.status', 'architecture.teams.bravo.status', 'architecture.teams.charlie.status', 'architecture.testCoverage.threshold'],
      skipExactMatch: true
    },
    {
      name: 'spring-boot-maven',
      description: 'Java Spring Boot project with Maven',
      input: { 
        repoPath: './test/fixtures/java-spring-boot-maven',
        sessionId: 'test-analyze-1'
      },
      goldenOutput: './test/golden/analyze/spring-boot-maven.json',
      assertions: ['language', 'framework', 'buildSystem', 'port'],
      skipExactMatch: true
    },
    {
      name: 'quarkus-gradle',
      description: 'Java Quarkus project with Gradle',
      input: { 
        repoPath: './test/fixtures/java-quarkus',
        sessionId: 'test-analyze-2'
      },
      goldenOutput: './test/golden/analyze/quarkus-gradle.json',
      assertions: ['language', 'framework', 'buildSystem', 'port'],
      skipExactMatch: true
    },
    {
      name: 'node-express',
      description: 'Node.js Express application',
      input: { 
        repoPath: './test/fixtures/node-express',
        sessionId: 'test-analyze-3'
      },
      goldenOutput: './test/golden/analyze/node-express.json',
      assertions: ['language', 'framework', 'packageManager', 'port'],
      skipExactMatch: true
    },
    {
      name: 'python-flask',
      description: 'Python Flask application',
      input: { 
        repoPath: './test/fixtures/python-flask',
        sessionId: 'test-analyze-4'
      },
      goldenOutput: './test/golden/analyze/python-flask.json',
      assertions: ['language', 'framework', 'pythonVersion', 'port'],
      skipExactMatch: true
    },
    {
      name: 'dotnet-webapi',
      description: '.NET Core Web API application',
      input: { 
        repoPath: './test/fixtures/dotnet-webapi',
        sessionId: 'test-analyze-5'
      },
      goldenOutput: './test/golden/analyze/dotnet-webapi.json',
      assertions: ['language', 'framework', 'dotnetVersion', 'port'],
      skipExactMatch: true
    },
    {
      name: 'dotnet-mvc',
      description: 'ASP.NET MVC application',
      input: { 
        repoPath: './test/fixtures/dotnet-mvc',
        sessionId: 'test-analyze-6'
      },
      goldenOutput: './test/golden/analyze/dotnet-mvc.json',
      assertions: ['language', 'framework', 'dotnetVersion', 'port'],
      skipExactMatch: true
    }
  ],

  // Dockerfile Generation Tests
  generate_dockerfile: [
    {
      name: 'spring-boot-multistage',
      description: 'Spring Boot with multi-stage build',
      input: { 
        sessionId: 'test-dockerfile-1',
        requirements: {
          baseImage: 'openjdk:17-slim',
          multistage: true,
          port: 8080
        }
      },
      goldenOutput: './test/golden/dockerfiles/spring-boot.Dockerfile',
      assertions: ['FROM openjdk', 'COPY --from=builder', 'EXPOSE 8080', 'USER'],
      skipExactMatch: true,
      customValidator: 'dockerfileValidator'
    },
    {
      name: 'node-production',
      description: 'Node.js production Dockerfile',
      input: { 
        sessionId: 'test-dockerfile-2',
        requirements: {
          baseImage: 'node:18-alpine',
          port: 3000,
          healthCheck: true
        }
      },
      goldenOutput: './test/golden/dockerfiles/node-express.Dockerfile',
      assertions: ['FROM node', 'npm ci --only=production', 'HEALTHCHECK', 'USER node'],
      skipExactMatch: true,
      customValidator: 'dockerfileValidator'
    },
    {
      name: 'dotnet-webapi-multistage',
      description: '.NET Core Web API with multi-stage build',
      input: { 
        sessionId: 'test-dockerfile-3',
        requirements: {
          baseImage: 'mcr.microsoft.com/dotnet/aspnet:8.0',
          multistage: true,
          port: 80
        }
      },
      goldenOutput: './test/golden/dockerfiles/dotnet-webapi.Dockerfile',
      assertions: ['FROM mcr.microsoft.com/dotnet/sdk', 'FROM mcr.microsoft.com/dotnet/aspnet', 'dotnet publish', 'EXPOSE 80'],
      skipExactMatch: true,
      customValidator: 'dockerfileValidator'
    },
    {
      name: 'dotnet-mvc-production',
      description: 'ASP.NET MVC production Dockerfile',
      input: { 
        sessionId: 'test-dockerfile-4',
        requirements: {
          baseImage: 'mcr.microsoft.com/dotnet/aspnet:8.0',
          port: 5000,
          healthCheck: true
        }
      },
      goldenOutput: './test/golden/dockerfiles/dotnet-mvc.Dockerfile',
      assertions: ['FROM mcr.microsoft.com/dotnet/aspnet', 'dotnet publish', 'HEALTHCHECK', 'EXPOSE 5000'],
      skipExactMatch: true,
      customValidator: 'dockerfileValidator'
    }
  ],

  // Docker Build Tests
  build_image: [
    {
      name: 'successful-build',
      description: 'Successful image build',
      input: { 
        context: './test/fixtures/java-spring-boot-maven',
        tag: 'test-spring:latest',
        sessionId: 'test-build-1'
      },
      goldenOutput: './test/golden/build/success.json',
      assertions: ['imageId', 'size', 'layers'],
      skipExactMatch: true
    },
    {
      name: 'build-with-errors',
      description: 'Build with recoverable errors',
      input: { 
        context: './test/fixtures/broken-dockerfile',
        tag: 'test-broken:latest',
        sessionId: 'test-build-2'
      },
      goldenOutput: './test/golden/build/error-recovery.json',
      assertions: ['error', 'retryAttempts', 'finalStatus'],
      skipExactMatch: true
    }
  ],

  // Image Scanning Tests
  scan_image: [
    {
      name: 'trivy-scan-results',
      description: 'Trivy security scan results',
      input: {
        imageTag: 'test-spring:latest',
        sessionId: 'test-scan-1',
        scannerType: 'trivy'
      },
      goldenOutput: './test/golden/scan/trivy-results.json',
      assertions: ['vulnerabilities', 'summary', 'scannerUsed'],
      skipExactMatch: true
    }
  ],

  // Kubernetes Generation Tests
  generate_k8s_manifests: [
    {
      name: 'basic-deployment',
      description: 'Basic Kubernetes deployment',
      input: { 
        sessionId: 'test-k8s-1',
        imageTag: 'myapp:v1.0.0',
        port: 8080,
        replicas: 3
      },
      goldenOutput: './test/golden/k8s-manifests/basic-deployment.yaml',
      assertions: ['apiVersion: apps/v1', 'kind: Deployment', 'replicas: 3'],
      skipExactMatch: true,
      customValidator: 'k8sValidator'
    },
    {
      name: 'with-ingress',
      description: 'Deployment with ingress',
      input: { 
        sessionId: 'test-k8s-2',
        imageTag: 'webapp:v1.0.0',
        port: 80,
        ingress: {
          enabled: true,
          host: 'myapp.example.com'
        }
      },
      goldenOutput: './test/golden/k8s-manifests/with-ingress.yaml',
      assertions: ['kind: Ingress', 'host: myapp.example.com', 'kind: Service'],
      skipExactMatch: true,
      customValidator: 'k8sValidator'
    }
  ],

  // Complete Workflow Tests
  start_workflow: [
    {
      name: 'mcp-server-architecture-validation',
      description: 'MCP Server architecture validation workflow',
      input: { 
        repoPath: './test/fixtures/mcp-server-architecture',
        targetEnvironment: 'test',
        sessionId: 'test-mcp-server-validation',
        workflowType: 'validation'
      },
      goldenOutput: './test/golden/workflow/mcp-server-complete.json',
      assertions: ['teamValidation.alpha.status', 'teamValidation.bravo.status', 'teamValidation.charlie.status', 'teamValidation.delta.status', 'results.overallTestCoverage'],
      skipExactMatch: true
    },
    {
      name: 'complete-java-workflow',
      description: 'End-to-end Java application workflow',
      input: { 
        repoPath: './test/fixtures/java-spring-boot-maven',
        targetEnvironment: 'development',
        sessionId: 'test-workflow-1',
        workflowType: 'full'
      },
      goldenOutput: './test/golden/workflow/java-complete.json',
      assertions: ['steps', 'status', 'artifacts'],
      skipExactMatch: true
    },
    {
      name: 'build-only-workflow',
      description: 'Build-only workflow for CI/CD',
      input: {
        repoPath: './test/fixtures/java-spring-boot-maven',
        targetEnvironment: 'ci',
        sessionId: 'test-workflow-2',
        workflowType: 'build-only'
      },
      goldenOutput: './test/golden/workflow/build-only.json',
      assertions: ['steps', 'status', 'buildArtifacts'],
      skipExactMatch: true
    }
  ],

  // Utility Tools Tests
  list_tools: [
    {
      name: 'all-tools-listed',
      description: 'All 15 tools should be listed',
      input: {},
      goldenOutput: './test/golden/utility/tool-list.json',
      assertions: ['tools', 'count'],
      skipExactMatch: true
    }
  ],

  ping: [
    {
      name: 'server-ping',
      description: 'Server health check',
      input: {},
      goldenOutput: './test/golden/utility/ping.json',
      assertions: ['status', 'timestamp'],
      skipExactMatch: true
    }
  ],

  server_status: [
    {
      name: 'server-status',
      description: 'Server status information',
      input: {},
      goldenOutput: './test/golden/utility/server-status.json',
      assertions: ['status', 'version', 'uptime'],
      skipExactMatch: true
    }
  ]
};

// Tool category mapping for test organization
export const TOOL_CATEGORIES = {
  workflow: [
    'analyze_repository',
    'generate_dockerfile', 
    'build_image',
    'scan_image',
    'tag_image',
    'push_image',
    'generate_k8s_manifests',
    'prepare_cluster',
    'deploy_application',
    'verify_deployment'
  ],
  orchestration: [
    'start_workflow',
    'workflow_status'
  ],
  utility: [
    'list_tools',
    'ping', 
    'server_status'
  ]
};

// Expected tool count for validation
export const EXPECTED_TOOL_COUNT = 15;

// Test execution priorities
export enum TestPriority {
  P0 = 'critical',      // Must pass for production
  P1 = 'high',         // Important functionality
  P2 = 'medium',       // Nice to have
  P3 = 'low'           // Edge cases
}

// Tool priority mapping
export const TOOL_PRIORITIES: Record<string, TestPriority> = {
  // P0 - Critical for basic functionality
  analyze_repository: TestPriority.P0,
  generate_dockerfile: TestPriority.P0,
  start_workflow: TestPriority.P0,
  workflow_status: TestPriority.P0,
  list_tools: TestPriority.P0,
  ping: TestPriority.P0,
  
  // P1 - Important for complete workflows  
  build_image: TestPriority.P1,
  generate_k8s_manifests: TestPriority.P1,
  deploy_application: TestPriority.P1,
  verify_deployment: TestPriority.P1,
  server_status: TestPriority.P1,
  
  // P2 - Enhanced functionality
  scan_image: TestPriority.P2,
  tag_image: TestPriority.P2,
  push_image: TestPriority.P2,
  prepare_cluster: TestPriority.P2
};