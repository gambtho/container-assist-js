/**
 * End-to-End Workflow Integration Tests - Phase 8 Testing Framework
 * Tests complete workflow execution across different application types
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import path from 'path';
import { createTestServer } from '../simple-test-setup.js';

describe('End-to-End Workflow Integration', () => {
  let server;

  beforeAll(async () => {
    server = await createTestServer({
      features: { mockMode: true, aiEnabled: false }
    });
  });

  afterAll(async () => {
    if (server) {
      await server.shutdown();
    }
  });

  describe('Complete Application Workflows', () => {
    test('processes Java Spring Boot application end-to-end', async () => {
      const sessionId = 'e2e-java-test-1';
      const repoPath = './test/fixtures/java-spring-boot-maven';

      // Step 1: Analyze repository
      const analysisResult = await server.executeTool('analyze_repository', {
        repoPath,
        sessionId
      });

      expect(analysisResult.success).toBe(true);
      expect(analysisResult.data).toMatchObject({
        language: 'java',
        framework: expect.stringMatching(/spring/i),
        buildSystem: expect.objectContaining({
          type: 'maven'
        })
      });

      // Step 2: Generate Dockerfile
      const dockerfileResult = await server.executeTool('generate_dockerfile', {
        sessionId,
        baseImage: 'openjdk:17-slim',
        multistage: true
      });

      expect(dockerfileResult.success).toBe(true);
      expect(dockerfileResult.data.dockerfile).toContain('FROM');
      expect(dockerfileResult.data.dockerfile).toContain('EXPOSE');

      // Step 3: Build image
      const buildResult = await server.executeTool('build_image', {
        sessionId,
        tag: 'test-java-app:latest',
        context: repoPath
      });

      expect(buildResult.success).toBe(true);
      expect(buildResult.data).toHaveProperty('imageId');
      expect(buildResult.data).toHaveProperty('size');

      // Step 4: Generate Kubernetes manifests
      const k8sResult = await server.executeTool('generate_k8s_manifests', {
        sessionId,
        imageTag: 'test-java-app:latest',
        port: 8080,
        replicas: 3
      });

      expect(k8sResult.success).toBe(true);
      expect(k8sResult.data.manifests).toContain('apiVersion');
      expect(k8sResult.data.manifests).toContain('kind: Deployment');
      expect(k8sResult.data.manifests).toContain('kind: Service');

      // Verify workflow consistency
      expect(analysisResult.data.ports).toContain(8080);
      expect(dockerfileResult.data.dockerfile).toContain('8080');
      expect(k8sResult.data.manifests).toContain('8080');
    }, 60000);

    test('processes Node.js Express application end-to-end', async () => {
      const sessionId = 'e2e-node-test-1';
      const repoPath = './test/fixtures/node-express';

      // Complete workflow for Node.js application
      const analysisResult = await server.executeTool('analyze_repository', {
        repoPath,
        sessionId
      });

      expect(analysisResult.success).toBe(true);
      expect(analysisResult.data).toMatchObject({
        language: 'javascript',
        framework: expect.stringMatching(/express/i),
        ports: expect.arrayContaining([3000])
      });

      const dockerfileResult = await server.executeTool('generate_dockerfile', {
        sessionId,
        baseImage: 'node:18-alpine'
      });

      expect(dockerfileResult.success).toBe(true);
      expect(dockerfileResult.data.dockerfile).toContain('FROM node');

      const buildResult = await server.executeTool('build_image', {
        sessionId,
        tag: 'test-node-app:latest',
        context: repoPath
      });

      expect(buildResult.success).toBe(true);
      expect(buildResult.data).toHaveProperty('imageId');
    }, 60000);

    test('processes .NET Core Web API application end-to-end', async () => {
      const sessionId = 'e2e-dotnet-test-1';
      const repoPath = './test/fixtures/dotnet-webapi';

      const analysisResult = await server.executeTool('analyze_repository', {
        repoPath,
        sessionId
      });

      expect(analysisResult.success).toBe(true);
      expect(analysisResult.data).toMatchObject({
        language: 'csharp',
        framework: expect.stringMatching(/aspnet/i),
        ports: expect.arrayContaining([80])
      });

      const dockerfileResult = await server.executeTool('generate_dockerfile', {
        sessionId,
        baseImage: 'mcr.microsoft.com/dotnet/aspnet:8.0',
        multistage: true
      });

      expect(dockerfileResult.success).toBe(true);
      expect(dockerfileResult.data.dockerfile).toContain('mcr.microsoft.com/dotnet');

      const k8sResult = await server.executeTool('generate_k8s_manifests', {
        sessionId,
        imageTag: 'test-dotnet-app:latest',
        port: 80
      });

      expect(k8sResult.success).toBe(true);
      expect(k8sResult.data.manifests).toContain('targetPort: 80');
    }, 60000);
  });

  describe('Orchestrated Workflow Execution', () => {
    test('executes full containerization workflow', async () => {
      const sessionId = 'orchestrated-full-test-1';
      const repoPath = './test/fixtures/java-spring-boot-maven';

      // Start full workflow
      const workflowResult = await server.executeTool('start_workflow', {
        repoPath,
        sessionId,
        workflowType: 'full',
        targetEnvironment: 'production'
      });

      expect(workflowResult.success).toBe(true);
      expect(workflowResult.data).toMatchObject({
        workflowId: sessionId,
        status: 'running',
        workflowType: 'full'
      });

      // Check workflow status
      const statusResult = await server.executeTool('workflow_status', {
        sessionId
      });

      expect(statusResult.success).toBe(true);
      expect(statusResult.data).toMatchObject({
        status: expect.stringMatching(/completed|running|success/),
        progress: expect.any(Number)
      });

      if (statusResult.data.status === 'completed') {
        expect(statusResult.data.progress).toBe(100);
        expect(statusResult.data).toHaveProperty('artifacts');
        expect(statusResult.data.artifacts).toMatchObject({
          dockerfile: expect.any(String),
          image: expect.any(String),
          manifests: expect.any(String)
        });
      }
    }, 90000);

    test('executes build-only workflow', async () => {
      const sessionId = 'orchestrated-build-test-1';

      const workflowResult = await server.executeTool('start_workflow', {
        repoPath: './test/fixtures/java-spring-boot-maven',
        sessionId,
        workflowType: 'build-only',
        targetEnvironment: 'ci'
      });

      expect(workflowResult.success).toBe(true);
      expect(workflowResult.data.workflowType).toBe('build-only');

      const statusResult = await server.executeTool('workflow_status', {
        sessionId
      });

      expect(statusResult.success).toBe(true);
      
      // Build-only workflow should have fewer steps
      if (statusResult.data.completedSteps) {
        const expectedSteps = ['analyze_repository', 'generate_dockerfile', 'build_image'];
        for (const step of expectedSteps) {
          expect(statusResult.data.completedSteps).toContain(step);
        }
      }
    }, 60000);

    test('handles workflow failures gracefully', async () => {
      const sessionId = 'workflow-failure-test-1';
      
      // Use invalid repo path to potentially trigger failure
      const workflowResult = await server.executeTool('start_workflow', {
        repoPath: '/nonexistent/path',
        sessionId,
        workflowType: 'quick'
      });

      // Should either succeed with mock data or fail gracefully
      expect(workflowResult).toHaveProperty('success');
      expect(workflowResult).toHaveProperty('timestamp');

      if (!workflowResult.success) {
        expect(workflowResult.error).toHaveProperty('code');
        expect(workflowResult.error).toHaveProperty('message');
      }

      // Status should be queryable regardless
      const statusResult = await server.executeTool('workflow_status', {
        sessionId
      });

      expect(statusResult).toHaveProperty('success');
    });
  });

  describe('Multi-language Workflow Comparison', () => {
    test('different languages produce appropriate artifacts', async () => {
      const testCases = [
        {
          sessionId: 'lang-compare-java-1',
          repoPath: './test/fixtures/java-spring-boot-maven',
          expectedLanguage: 'java',
          expectedPort: 8080,
          expectedBaseImage: 'openjdk'
        },
        {
          sessionId: 'lang-compare-node-1', 
          repoPath: './test/fixtures/node-express',
          expectedLanguage: 'javascript',
          expectedPort: 3000,
          expectedBaseImage: 'node'
        },
        {
          sessionId: 'lang-compare-dotnet-1',
          repoPath: './test/fixtures/dotnet-webapi',
          expectedLanguage: 'csharp',
          expectedPort: 80,
          expectedBaseImage: 'dotnet'
        }
      ];

      for (const testCase of testCases) {
        // Analyze each repository
        const analysisResult = await server.executeTool('analyze_repository', {
          repoPath: testCase.repoPath,
          sessionId: testCase.sessionId
        });

        expect(analysisResult.success).toBe(true);
        expect(analysisResult.data.language).toBe(testCase.expectedLanguage);
        expect(analysisResult.data.ports).toContain(testCase.expectedPort);

        // Generate appropriate Dockerfile
        const dockerfileResult = await server.executeTool('generate_dockerfile', {
          sessionId: testCase.sessionId
        });

        expect(dockerfileResult.success).toBe(true);
        expect(dockerfileResult.data.dockerfile).toContain(testCase.expectedBaseImage);
        expect(dockerfileResult.data.dockerfile).toContain(`${testCase.expectedPort}`);

        // Generate K8s manifests
        const k8sResult = await server.executeTool('generate_k8s_manifests', {
          sessionId: testCase.sessionId,
          port: testCase.expectedPort
        });

        expect(k8sResult.success).toBe(true);
        expect(k8sResult.data.manifests).toContain(`${testCase.expectedPort}`);
      }
    }, 120000);
  });

  describe('Workflow State Management', () => {
    test('workflow state persists across tool calls', async () => {
      const sessionId = 'state-persistence-test-1';

      // Step 1: Analysis creates initial state
      const analysisResult = await server.executeTool('analyze_repository', {
        repoPath: './test/fixtures/java-spring-boot-maven',
        sessionId
      });

      expect(analysisResult.success).toBe(true);

      // Step 2: Dockerfile generation should use analysis results
      const dockerfileResult = await server.executeTool('generate_dockerfile', {
        sessionId  // No explicit language/framework - should use from analysis
      });

      expect(dockerfileResult.success).toBe(true);
      expect(dockerfileResult.data.dockerfile).toBeDefined();

      // Step 3: Check that workflow status shows progression
      const statusResult = await server.executeTool('workflow_status', {
        sessionId
      });

      expect(statusResult.success).toBe(true);
      
      if (statusResult.data.completedSteps) {
        expect(statusResult.data.completedSteps.length).toBeGreaterThan(0);
      }
    });

    test('multiple sessions remain isolated', async () => {
      const session1Id = 'isolation-test-1';
      const session2Id = 'isolation-test-2';

      // Create two different analysis sessions
      const analysis1 = await server.executeTool('analyze_repository', {
        repoPath: './test/fixtures/java-spring-boot-maven',
        sessionId: session1Id
      });

      const analysis2 = await server.executeTool('analyze_repository', {
        repoPath: './test/fixtures/node-express',
        sessionId: session2Id
      });

      expect(analysis1.success).toBe(true);
      expect(analysis2.success).toBe(true);
      expect(analysis1.data.language).toBe('java');
      expect(analysis2.data.language).toBe('javascript');

      // Check workflow status for both sessions
      const status1 = await server.executeTool('workflow_status', {
        sessionId: session1Id
      });

      const status2 = await server.executeTool('workflow_status', {
        sessionId: session2Id
      });

      expect(status1.success).toBe(true);
      expect(status2.success).toBe(true);
      
      // Sessions should be independent
      expect(status1.data).not.toEqual(status2.data);
    });
  });
});