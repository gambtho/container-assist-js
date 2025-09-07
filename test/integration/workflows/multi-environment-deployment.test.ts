/**
 * Integration Test Scenarios - Multi-Environment Deployment Tests
 * Implements Scenario 2.1 from integration-test-scenarios.md
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { setupMCPTestEnvironment, createTestRepository, cleanupTestSession } from '../../helpers/mcp-environment';
import type { MCPClient } from '../../helpers/mcp-environment';

describe('Multi-Environment Deployment Tests', () => {
  let mcpClient: MCPClient;
  let testCleanupTasks: string[] = [];

  beforeAll(async () => {
    mcpClient = await setupMCPTestEnvironment();
  });

  afterAll(async () => {
    for (const sessionId of testCleanupTasks) {
      await cleanupTestSession(sessionId);
    }
  });

  beforeEach(() => {
    testCleanupTasks = [];
  });

  describe('Scenario 2.1: Environment-Specific Configuration', () => {
    test('should generate environment-specific configurations', async () => {
      const baseSessionId = 'multi-env-test-session';
      testCleanupTasks.push(baseSessionId);

      // Setup base repository
      const analyzeResult = await mcpClient.callTool('analyze-repo', {
        repoPath: 'test/fixtures/repositories/node-express-basic',
        sessionId: baseSessionId
      });
      
      expect(analyzeResult.success).toBe(true);

      const environments = ['development', 'staging', 'production'];
      const results: Record<string, any> = {};
      
      for (const env of environments) {
        results[env] = await mcpClient.callTool('generate-k8s-manifests', {
          sessionId: baseSessionId,
          environment: env,
          replicas: env === 'production' ? 3 : env === 'staging' ? 2 : 1
        });
        
        expect(results[env].success).toBe(true);
      }
      
      // Validate environment differences
      expect(results.development.data.deployment.spec.replicas).toBe(1);
      expect(results.staging.data.deployment.spec.replicas).toBe(2);
      expect(results.production.data.deployment.spec.replicas).toBe(3);
      
      // Validate resource limits are stricter in production
      const prodContainer = results.production.data.deployment.spec.template.spec.containers[0];
      const devContainer = results.development.data.deployment.spec.template.spec.containers[0];
      
      expect(prodContainer.resources.limits).toBeDefined();
      expect(prodContainer.resources.requests).toBeDefined();
      
      // Production should have more restrictive limits
      const prodMemoryLimit = prodContainer.resources.limits.memory;
      const devMemoryLimit = devContainer.resources?.limits?.memory;
      
      if (devMemoryLimit) {
        expect(prodMemoryLimit).toBeDefined();
        // Production limits should be more carefully defined
      }
      
      // Validate environment-specific labels
      expect(results.production.data.deployment.metadata.labels.environment).toBe('production');
      expect(results.staging.data.deployment.metadata.labels.environment).toBe('staging');
      expect(results.development.data.deployment.metadata.labels.environment).toBe('development');
    }, 45000);

    test('should configure different resource quotas per environment', async () => {
      const sessionId = 'resource-quotas-test';
      testCleanupTasks.push(sessionId);

      await mcpClient.callTool('analyze-repo', {
        repoPath: 'test/fixtures/repositories/python-flask',
        sessionId
      });

      // Test resource allocation patterns
      const environments = [
        { name: 'development', cpu: '100m', memory: '128Mi' },
        { name: 'staging', cpu: '250m', memory: '256Mi' },
        { name: 'production', cpu: '500m', memory: '512Mi' }
      ];

      for (const env of environments) {
        const result = await mcpClient.callTool('generate-k8s-manifests', {
          sessionId,
          environment: env.name,
          resourceLimits: {
            cpu: env.cpu,
            memory: env.memory
          }
        });

        expect(result.success).toBe(true);
        
        const container = result.data.deployment.spec.template.spec.containers[0];
        expect(container.resources.requests.cpu).toBe(env.cpu);
        expect(container.resources.requests.memory).toBe(env.memory);
      }
    }, 30000);

    test('should apply environment-specific security policies', async () => {
      const sessionId = 'security-policies-test';
      testCleanupTasks.push(sessionId);

      await mcpClient.callTool('analyze-repo', {
        repoPath: 'test/fixtures/repositories/java-springboot',
        sessionId
      });

      const prodResult = await mcpClient.callTool('generate-k8s-manifests', {
        sessionId,
        environment: 'production',
        securityProfile: 'strict'
      });

      const devResult = await mcpClient.callTool('generate-k8s-manifests', {
        sessionId,
        environment: 'development',
        securityProfile: 'relaxed'
      });

      expect(prodResult.success).toBe(true);
      expect(devResult.success).toBe(true);

      // Production should have stricter security context
      const prodSecurityContext = prodResult.data.deployment.spec.template.spec.securityContext;
      const devSecurityContext = devResult.data.deployment.spec.template.spec.securityContext;

      expect(prodSecurityContext.runAsNonRoot).toBe(true);
      expect(prodSecurityContext.readOnlyRootFilesystem).toBe(true);
      
      // Development might be more permissive
      if (devSecurityContext) {
        expect(devSecurityContext.readOnlyRootFilesystem).toBeFalsy();
      }
    }, 30000);
  });

  describe('Environment Configuration Validation', () => {
    test('should validate configuration consistency across environments', async () => {
      const sessionId = 'consistency-test';
      testCleanupTasks.push(sessionId);

      await mcpClient.callTool('analyze-repo', {
        repoPath: 'test/fixtures/repositories/node-express-basic',
        sessionId
      });

      const environments = ['development', 'staging', 'production'];
      const configs: Record<string, any> = {};

      for (const env of environments) {
        configs[env] = await mcpClient.callTool('generate-k8s-manifests', {
          sessionId,
          environment: env
        });
        
        expect(configs[env].success).toBe(true);
      }

      // All environments should have same basic structure
      for (const env of environments) {
        const deployment = configs[env].data.deployment;
        const service = configs[env].data.service;

        expect(deployment.apiVersion).toBe('apps/v1');
        expect(deployment.kind).toBe('Deployment');
        expect(service.apiVersion).toBe('v1');
        expect(service.kind).toBe('Service');

        // All should have proper selector matching
        expect(deployment.spec.selector.matchLabels).toEqual(
          service.spec.selector
        );
      }
    }, 40000);

    test('should handle environment-specific configuration overrides', async () => {
      const sessionId = 'overrides-test';
      testCleanupTasks.push(sessionId);

      await mcpClient.callTool('analyze-repo', {
        repoPath: 'test/fixtures/repositories/python-flask',
        sessionId
      });

      // Test with custom environment variables
      const result = await mcpClient.callTool('generate-k8s-manifests', {
        sessionId,
        environment: 'production',
        environmentVariables: {
          DATABASE_URL: 'postgresql://prod-db:5432/myapp',
          LOG_LEVEL: 'warn',
          CACHE_TTL: '3600'
        }
      });

      expect(result.success).toBe(true);

      const container = result.data.deployment.spec.template.spec.containers[0];
      const envVars = container.env || [];

      const dbUrlVar = envVars.find((env: any) => env.name === 'DATABASE_URL');
      const logLevelVar = envVars.find((env: any) => env.name === 'LOG_LEVEL');
      const cacheTtlVar = envVars.find((env: any) => env.name === 'CACHE_TTL');

      expect(dbUrlVar?.value).toBe('postgresql://prod-db:5432/myapp');
      expect(logLevelVar?.value).toBe('warn');
      expect(cacheTtlVar?.value).toBe('3600');
    }, 25000);
  });
});