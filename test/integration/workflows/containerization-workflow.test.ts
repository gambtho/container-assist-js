/**
 * Integration Test Scenarios - Complete Containerization Workflows
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { setupMCPTestEnvironment, createTestRepository, cleanupTestSession } from '../../helpers/mcp-environment';
import type { MCPClient } from '../../helpers/mcp-environment';

describe('Complete Containerization Workflow Tests', () => {
  let mcpClient: MCPClient;
  let testCleanupTasks: string[] = [];

  beforeAll(async () => {
    mcpClient = await setupMCPTestEnvironment();
  });

  afterAll(async () => {
    // Cleanup all test sessions
    for (const sessionId of testCleanupTasks) {
      await cleanupTestSession(sessionId);
    }
  });

  beforeEach(() => {
    testCleanupTasks = [];
  });

  afterEach(async () => {
    // Cleanup sessions created in this test
    for (const sessionId of testCleanupTasks) {
      await cleanupTestSession(sessionId);
    }
    testCleanupTasks = [];
  });

  describe('Scenario 1.1: Node.js Express Application', () => {
    test('should complete full containerization workflow', async () => {
      const sessionId = 'nodejs-express-integration-test';
      testCleanupTasks.push(sessionId);

      // 1. Repository Analysis
      const analyzeResult = await mcpClient.callTool('analyze-repo', {
        repoPath: 'test/fixtures/repositories/node-express-basic',
        sessionId
      });
      
      expect(analyzeResult.success).toBe(true);
      expect(analyzeResult.data.language).toBe('javascript');
      expect(analyzeResult.data.framework).toBe('express');
      expect(analyzeResult.data.packageManager).toBe('npm');
      
      // 2. Dockerfile Generation  
      const dockerfileResult = await mcpClient.callTool('generate-dockerfile', {
        sessionId,
        strategy: 'production-optimized'
      });
      
      expect(dockerfileResult.success).toBe(true);
      expect(dockerfileResult.data.content).toContain('FROM node:');
      expect(dockerfileResult.data.content).toContain('EXPOSE 3000');
      expect(dockerfileResult.data.content).toContain('CMD');
      
      // 3. Image Build
      const buildResult = await mcpClient.callTool('build-image', {
        sessionId,
        tag: 'test-node-express:integration'
      });
      
      expect(buildResult.success).toBe(true);
      expect(buildResult.data.imageId).toBeDefined();
      
      // 4. K8s Manifest Generation
      const manifestResult = await mcpClient.callTool('generate-k8s-manifests', {
        sessionId,
        environment: 'development'
      });
      
      expect(manifestResult.success).toBe(true);
      expect(manifestResult.data.deployment).toBeDefined();
      expect(manifestResult.data.service).toBeDefined();
      
      // 5. Deployment Validation
      const deployResult = await mcpClient.callTool('verify-deployment', {
        sessionId,
        namespace: 'test-integration',
        dryRun: true // Don't actually deploy in tests
      });
      
      expect(deployResult.success).toBe(true);
      
      // Validate generated artifacts quality
      expect(dockerfileResult.data.content).toContain('USER appuser'); // Security best practice
      expect(manifestResult.data.deployment.spec.template.spec.containers[0].resources).toBeDefined();
      expect(manifestResult.data.deployment.spec.template.spec.containers[0].livenessProbe).toBeDefined();
    }, 60000); // 60 second timeout for full workflow
  });

  describe('Scenario 1.2: Python Flask Application', () => {
    test('should complete Python Flask containerization workflow', async () => {
      const sessionId = 'python-flask-integration-test';
      testCleanupTasks.push(sessionId);

      // Repository Analysis
      const analyzeResult = await mcpClient.callTool('analyze-repo', {
        repoPath: 'test/fixtures/repositories/python-flask',
        sessionId
      });
      
      expect(analyzeResult.success).toBe(true);
      expect(analyzeResult.data.language).toBe('python');
      expect(analyzeResult.data.framework).toBe('flask');
      
      // Dockerfile Generation with Python-specific optimizations
      const dockerfileResult = await mcpClient.callTool('generate-dockerfile', {
        sessionId,
        strategy: 'production-optimized'
      });
      
      expect(dockerfileResult.success).toBe(true);
      expect(dockerfileResult.data.content).toContain('FROM python:');
      expect(dockerfileResult.data.content).toContain('requirements.txt');
      expect(dockerfileResult.data.content).toContain('EXPOSE 5000');
      
      // Build and validate
      const buildResult = await mcpClient.callTool('build-image', {
        sessionId,
        tag: 'test-python-flask:integration'
      });
      
      expect(buildResult.success).toBe(true);
      
      // K8s manifests with Python-specific configurations
      const manifestResult = await mcpClient.callTool('generate-k8s-manifests', {
        sessionId,
        environment: 'development'
      });
      
      expect(manifestResult.success).toBe(true);
      expect(manifestResult.data.service.spec.ports[0].port).toBe(5000);
    }, 60000);
  });

  describe('Scenario 1.3: Java Spring Boot Application', () => {
    test('should complete Java Spring Boot containerization workflow', async () => {
      const sessionId = 'java-springboot-integration-test';
      testCleanupTasks.push(sessionId);

      // Repository Analysis
      const analyzeResult = await mcpClient.callTool('analyze-repo', {
        repoPath: 'test/fixtures/repositories/java-springboot',
        sessionId
      });
      
      expect(analyzeResult.success).toBe(true);
      expect(analyzeResult.data.language).toBe('java');
      expect(analyzeResult.data.framework).toBe('spring-boot');
      expect(['maven', 'gradle']).toContain(analyzeResult.data.buildSystem);
      
      // Dockerfile with JVM optimizations
      const dockerfileResult = await mcpClient.callTool('generate-dockerfile', {
        sessionId,
        strategy: 'production-optimized'
      });
      
      expect(dockerfileResult.success).toBe(true);
      expect(dockerfileResult.data.content).toContain('FROM openjdk:');
      expect(dockerfileResult.data.content).toContain('EXPOSE 8080');
      expect(dockerfileResult.data.content).toContain('-Xmx'); // JVM memory settings
      
      // Build validation
      const buildResult = await mcpClient.callTool('build-image', {
        sessionId,
        tag: 'test-java-springboot:integration'
      });
      
      expect(buildResult.success).toBe(true);
      
      // K8s with Spring Boot actuator endpoints
      const manifestResult = await mcpClient.callTool('generate-k8s-manifests', {
        sessionId,
        environment: 'development'
      });
      
      expect(manifestResult.success).toBe(true);
      expect(manifestResult.data.service.spec.ports[0].port).toBe(8080);
      
      // Verify actuator health check endpoint
      const healthProbe = manifestResult.data.deployment.spec.template.spec.containers[0].livenessProbe;
      expect(healthProbe.httpGet.path).toContain('/actuator/health');
    }, 90000); // Java builds can take longer
  });
});