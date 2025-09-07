/**
 * Integration Test Scenarios - Security Integration Tests
 * Implements Scenario 3.1 from integration-test-scenarios.md
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { setupMCPTestEnvironment, createTestRepository, cleanupTestSession } from '../../helpers/mcp-environment';
import type { MCPClient } from '../../helpers/mcp-environment';

describe('Security Integration Tests', () => {
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

  describe('Scenario 3.1: Vulnerability Scanning and Remediation', () => {
    test('should scan for vulnerabilities and provide remediation', async () => {
      const sessionId = 'security-scan-test';
      testCleanupTasks.push(sessionId);

      // Setup repository with known security issues
      const analyzeResult = await mcpClient.callTool('analyze-repo', {
        repoPath: 'test/fixtures/repositories/security-issues',
        sessionId
      });
      
      expect(analyzeResult.success).toBe(true);

      // Generate initial Dockerfile
      const dockerfileResult = await mcpClient.callTool('generate-dockerfile', {
        sessionId,
        includeSecurity: true
      });
      
      expect(dockerfileResult.success).toBe(true);
      expect(dockerfileResult.data.content).toBeDefined();

      // Run security scan
      const scanResult = await mcpClient.callTool('scan', {
        sessionId,
        scanType: 'vulnerability'
      });
      
      expect(scanResult.success).toBe(true);
      expect(scanResult.data.vulnerabilities).toBeDefined();
      expect(Array.isArray(scanResult.data.vulnerabilities)).toBe(true);
      expect(scanResult.data.recommendations).toBeDefined();

      // If vulnerabilities found, apply security fixes
      if (scanResult.data.vulnerabilities.length > 0) {
        const fixResult = await mcpClient.callTool('fix-dockerfile', {
          sessionId,
          fixes: scanResult.data.recommendations
        });
        
        expect(fixResult.success).toBe(true);
        
        // Verify fixes were applied
        const rescanResult = await mcpClient.callTool('scan', {
          sessionId,
          scanType: 'vulnerability'
        });
        
        expect(rescanResult.success).toBe(true);
        expect(rescanResult.data.vulnerabilities.length)
          .toBeLessThanOrEqual(scanResult.data.vulnerabilities.length);
      }
    }, 120000); // Security scans can take time

    test('should apply security best practices in Dockerfile generation', async () => {
      const sessionId = 'security-practices-test';
      testCleanupTasks.push(sessionId);

      await mcpClient.callTool('analyze-repo', {
        repoPath: 'test/fixtures/repositories/node-express-basic',
        sessionId
      });

      const dockerfileResult = await mcpClient.callTool('generate-dockerfile', {
        sessionId,
        securityProfile: 'strict'
      });

      expect(dockerfileResult.success).toBe(true);
      
      const dockerfileContent = dockerfileResult.data.content;

      // Check for security best practices
      expect(dockerfileContent).toContain('USER'); // Non-root user
      expect(dockerfileContent).not.toContain('USER root');
      expect(dockerfileContent).toContain('RUN chown'); // Proper ownership
      
      // Should use minimal base images
      expect(dockerfileContent).toMatch(/FROM.*alpine|FROM.*slim|FROM.*distroless/i);
      
      // Should avoid installing unnecessary packages
      expect(dockerfileContent).not.toContain('curl');
      expect(dockerfileContent).not.toContain('wget');
      expect(dockerfileContent).not.toContain('vim');
    }, 30000);

    test('should scan for secrets and sensitive data', async () => {
      const sessionId = 'secrets-scan-test';
      testCleanupTasks.push(sessionId);

      await mcpClient.callTool('analyze-repo', {
        repoPath: 'test/fixtures/repositories/with-secrets',
        sessionId
      });

      const scanResult = await mcpClient.callTool('scan', {
        sessionId,
        scanType: 'secrets'
      });

      expect(scanResult.success).toBe(true);
      expect(scanResult.data.secretsFound).toBeDefined();
      
      if (scanResult.data.secretsFound.length > 0) {
        const secrets = scanResult.data.secretsFound;
        
        // Verify detection of common secret patterns
        expect(secrets.some((s: any) => s.type === 'api-key')).toBe(true);
        
        // Should provide remediation suggestions
        expect(scanResult.data.recommendations).toBeDefined();
        expect(scanResult.data.recommendations.length).toBeGreaterThan(0);
      }
    }, 45000);
  });

  describe('Container Security Configuration', () => {
    test('should generate secure Kubernetes manifests', async () => {
      const sessionId = 'k8s-security-test';
      testCleanupTasks.push(sessionId);

      await mcpClient.callTool('analyze-repo', {
        repoPath: 'test/fixtures/repositories/python-flask',
        sessionId
      });

      const manifestResult = await mcpClient.callTool('generate-k8s-manifests', {
        sessionId,
        environment: 'production',
        securityProfile: 'strict'
      });

      expect(manifestResult.success).toBe(true);
      
      const deployment = manifestResult.data.deployment;
      const securityContext = deployment.spec.template.spec.securityContext;
      const containerSecurityContext = deployment.spec.template.spec.containers[0].securityContext;

      // Pod security context
      expect(securityContext.runAsNonRoot).toBe(true);
      expect(securityContext.fsGroup).toBeDefined();

      // Container security context
      expect(containerSecurityContext.allowPrivilegeEscalation).toBe(false);
      expect(containerSecurityContext.runAsNonRoot).toBe(true);
      expect(containerSecurityContext.readOnlyRootFilesystem).toBe(true);
      expect(containerSecurityContext.capabilities.drop).toContain('ALL');

      // Resource limits should be defined
      const resources = deployment.spec.template.spec.containers[0].resources;
      expect(resources.limits).toBeDefined();
      expect(resources.requests).toBeDefined();
    }, 30000);

    test('should implement network security policies', async () => {
      const sessionId = 'network-security-test';
      testCleanupTasks.push(sessionId);

      await mcpClient.callTool('analyze-repo', {
        repoPath: 'test/fixtures/repositories/java-springboot',
        sessionId
      });

      const manifestResult = await mcpClient.callTool('generate-k8s-manifests', {
        sessionId,
        environment: 'production',
        includeNetworkPolicies: true
      });

      expect(manifestResult.success).toBe(true);
      
      if (manifestResult.data.networkPolicy) {
        const networkPolicy = manifestResult.data.networkPolicy;
        
        expect(networkPolicy.spec.podSelector).toBeDefined();
        expect(networkPolicy.spec.policyTypes).toContain('Ingress');
        expect(networkPolicy.spec.ingress).toBeDefined();
      }
    }, 30000);

    test('should configure proper health checks and monitoring', async () => {
      const sessionId = 'monitoring-security-test';
      testCleanupTasks.push(sessionId);

      await mcpClient.callTool('analyze-repo', {
        repoPath: 'test/fixtures/repositories/node-express-basic',
        sessionId
      });

      const manifestResult = await mcpClient.callTool('generate-k8s-manifests', {
        sessionId,
        environment: 'production',
        includeMonitoring: true
      });

      expect(manifestResult.success).toBe(true);
      
      const container = manifestResult.data.deployment.spec.template.spec.containers[0];
      
      // Health checks should be configured
      expect(container.livenessProbe).toBeDefined();
      expect(container.readinessProbe).toBeDefined();
      
      // Probes should not expose sensitive endpoints
      const livenessPath = container.livenessProbe.httpGet?.path;
      const readinessPath = container.readinessProbe.httpGet?.path;
      
      if (livenessPath) {
        expect(livenessPath).not.toContain('/admin');
        expect(livenessPath).not.toContain('/debug');
      }
      
      if (readinessPath) {
        expect(readinessPath).not.toContain('/admin');
        expect(readinessPath).not.toContain('/debug');
      }
    }, 30000);
  });

  describe('Compliance and Audit Integration', () => {
    test('should generate compliance reports', async () => {
      const sessionId = 'compliance-test';
      testCleanupTasks.push(sessionId);

      await mcpClient.callTool('analyze-repo', {
        repoPath: 'test/fixtures/repositories/python-flask',
        sessionId
      });

      const complianceResult = await mcpClient.callTool('generate-compliance-report', {
        sessionId,
        standards: ['CIS', 'NIST']
      });

      if (complianceResult.success) {
        expect(complianceResult.data.report).toBeDefined();
        expect(complianceResult.data.complianceScore).toBeGreaterThanOrEqual(0);
        expect(complianceResult.data.complianceScore).toBeLessThanOrEqual(100);
        expect(complianceResult.data.findings).toBeDefined();
      }
    }, 60000);

    test('should validate image signature and provenance', async () => {
      const sessionId = 'provenance-test';
      testCleanupTasks.push(sessionId);

      await mcpClient.callTool('analyze-repo', {
        repoPath: 'test/fixtures/repositories/node-express-basic',
        sessionId
      });

      // Build with signing enabled
      const buildResult = await mcpClient.callTool('build-image', {
        sessionId,
        tag: 'test-signed:latest',
        sign: true
      });

      if (buildResult.success) {
        // Verify signature
        const verifyResult = await mcpClient.callTool('verify-image-signature', {
          sessionId,
          image: 'test-signed:latest'
        });

        if (verifyResult.success) {
          expect(verifyResult.data.signatureValid).toBe(true);
          expect(verifyResult.data.provenance).toBeDefined();
        }
      }
    }, 90000);
  });
});