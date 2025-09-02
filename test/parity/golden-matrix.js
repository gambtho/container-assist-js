/**
 * Golden Test Matrix - Phase 8 Testing Framework
 * Defines comprehensive test cases for validating feature parity with Go implementation
 */

export const GOLDEN_TEST_MATRIX = {
  // Repository Analysis Tests
  analyze_repository: [
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
      name: 'dotnet-webapi',
      description: '.NET Core Web API application',
      input: { 
        repoPath: './test/fixtures/dotnet-webapi',
        sessionId: 'test-analyze-5'
      },
      goldenOutput: './test/golden/analyze/dotnet-webapi.json',
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
    }
  ],

  // Complete Workflow Tests
  start_workflow: [
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
export const TestPriority = {
  P0: 'critical',      // Must pass for production
  P1: 'high',         // Important functionality
  P2: 'medium',       // Nice to have
  P3: 'low'           // Edge cases
};

// Tool priority mapping
export const TOOL_PRIORITIES = {
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