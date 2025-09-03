/**
 * Unified Workflow Integration Tests
 * Tests complete AI-powered containerization workflows across multiple languages
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, writeFile, rmdir } from 'fs/promises';
import { nanoid } from 'nanoid';

import { UniversalRepositoryAnalyzer } from '../../../src/infrastructure/ai/repository-analyzer.js';
import { executeWithRecovery } from '../../../src/infrastructure/ai/error-recovery.js';
import { generateDockerfileHandler } from '../../../src/application/tools/generate-dockerfile/generate-dockerfile.js';
import { generateKubernetesManifestsHandler } from '../../../src/application/tools/generate-k8s-manifests/generate-k8s-manifests.js';
import { MockMCPSampler } from '../../../src/infrastructure/ai/mock-sampler.js';
import { createLogger } from '../../utils/logger.js';
import { createMockSession, createMockContext } from '../../utils/mocks.js';

describe('Unified AI Workflow Integration', () => {
  let mockSampler: MockMCPSampler;
  let logger: any;
  let analyzer: UniversalRepositoryAnalyzer;
  let testDir: string;
  let mockContext: any;

  beforeEach(async () => {
    logger = createLogger();
    mockSampler = new MockMCPSampler(logger, { 
      deterministicMode: true,
      simulateLatency: false 
    });
    analyzer = new UniversalRepositoryAnalyzer(mockSampler, logger);
    
    // Create temporary test directory
    testDir = join(tmpdir(), `test-unified-${Date.now()}`);
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

  describe('Node.js Express Application Complete Workflow', () => {
    it('should complete full containerization workflow for Node.js Express app', async () => {
      // 1. Setup Node.js Express project
      await setupExpressProject(testDir);

      const sessionId = nanoid();
      
      // 2. Analyze repository using UniversalRepositoryAnalyzer
      const analysisResult = await analyzer.analyze(testDir);
      
      expect(analysisResult.success).toBe(true);
      expect(analysisResult.data.language).toBe('javascript');
      expect(analysisResult.data.framework).toBe('express');

      // 3. Create session with analysis result
      const session = createMockSession({
        id: sessionId,
        workflow_state: {
          analysis_result: analysisResult.data
        }
      });

      mockContext.sessionService.get.mockResolvedValue(session);
      mockContext.sessionService.updateAtomic.mockImplementation(async (id, updater) => {
        const updated = updater(session);
        Object.assign(session, updated);
        return session;
      });

      // 4. Generate Dockerfile with AI enhancement and error recovery
      const dockerfileResult = await generateDockerfileHandler.execute({
        sessionId,
        targetPath: join(testDir, 'Dockerfile'),
        optimization: 'balanced',
        multistage: true,
        securityHardening: true,
        includeHealthcheck: true
      }, mockContext);

      expect(dockerfileResult.success).toBe(true);
      expect(dockerfileResult.data.dockerfile).toContain('FROM node:');
      expect(dockerfileResult.data.dockerfile).toContain('USER ');
      expect(dockerfileResult.data.dockerfile).toContain('HEALTHCHECK');
      expect(dockerfileResult.data.stages.length).toBeGreaterThan(0);
      expect(dockerfileResult.data.optimizations).toContain('Multi-stage build');

      // 5. Generate K8s manifests using analysis data
      const k8sResult = await generateKubernetesManifestsHandler.execute({
        sessionId,
        appName: 'express-app',
        image: 'express-app:v1.0.0',
        port: 3000,
        environment: 'production',
        replicas: 3,
        autoscaling: true,
        targetPath: testDir
      }, mockContext);

      expect(k8sResult.success).toBe(true);
      expect(k8sResult.data.manifests.length).toBeGreaterThan(1);
      expect(k8sResult.data.manifests.some(m => m.kind === 'Deployment')).toBe(true);
      expect(k8sResult.data.manifests.some(m => m.kind === 'Service')).toBe(true);

      // 6. Verify session state contains all workflow results
      expect(session.workflow_state?.analysis_result).toBeDefined();
      expect(session.workflow_state?.dockerfile_result).toBeDefined();
    });

    it('should handle errors gracefully and recover across workflow steps', async () => {
      await setupExpressProject(testDir);
      
      const sessionId = nanoid();
      
      // Configure AI to fail initially, then succeed
      let callCount = 0;
      const originalSample = mockSampler.sample.bind(mockSampler);
      mockSampler.sample = jest.fn().mockImplementation(async (request) => {
        callCount++;
        if (callCount <= 2) {
          return {
            success: false,
            content: null,
            error: new Error('Temporary AI service unavailable')
          };
        }
        return originalSample(request);
      });

      // Should still complete workflow with error recovery
      const analysisResult = await analyzer.analyze(testDir);
      
      if (analysisResult.success) {
        const session = createMockSession({
          id: sessionId,
          workflow_state: { analysis_result: analysisResult.data }
        });
        
        mockContext.sessionService.get.mockResolvedValue(session);
        mockContext.sessionService.updateAtomic.mockResolvedValue(session);

        const dockerfileResult = await generateDockerfileHandler.execute({
          sessionId,
          targetPath: join(testDir, 'Dockerfile')
        }, mockContext);

        // Should succeed with fallback or retry
        expect(dockerfileResult.success).toBe(true);
      }

      // Verify retry attempts were made
      expect(callCount).toBeGreaterThan(2);
    });
  });

  describe('Python FastAPI Application Complete Workflow', () => {
    it('should complete full containerization workflow for Python FastAPI app', async () => {
      // Setup Python FastAPI project
      await setupFastAPIProject(testDir);

      const sessionId = nanoid();
      
      // Custom AI responses for Python
      mockSampler.addResponse('repository-analysis', JSON.stringify({
        language: 'python',
        languageVersion: '3.11',
        framework: 'fastapi',
        frameworkVersion: '0.104.0',
        buildSystem: { type: 'pip', buildFile: 'requirements.txt', buildCommand: 'pip install -r requirements.txt', testCommand: 'pytest' },
        dependencies: ['fastapi', 'uvicorn'],
        devDependencies: ['pytest', 'black'],
        entryPoint: 'main.py',
        suggestedPorts: [8000],
        dockerConfig: { baseImage: 'python:3.11-slim', multistage: true, nonRootUser: true }
      }));

      mockSampler.addResponse('dockerfile-generation', `
FROM python:3.11-slim AS builder
WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.11-slim
WORKDIR /app
RUN useradd -m -u 1001 appuser && chown -R appuser:appuser /app
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY --chown=appuser:appuser . .
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:8000/health || exit 1
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
      `.trim());

      // Analyze repository
      const analysisResult = await analyzer.analyze(testDir);
      expect(analysisResult.success).toBe(true);
      expect(analysisResult.data.language).toBe('python');
      expect(analysisResult.data.framework).toBe('fastapi');

      // Complete workflow
      const session = createMockSession({
        id: sessionId,
        workflow_state: { analysis_result: analysisResult.data }
      });

      mockContext.sessionService.get.mockResolvedValue(session);
      mockContext.sessionService.updateAtomic.mockResolvedValue(session);

      const dockerfileResult = await generateDockerfileHandler.execute({
        sessionId,
        targetPath: join(testDir, 'Dockerfile'),
        multistage: true
      }, mockContext);

      expect(dockerfileResult.success).toBe(true);
      expect(dockerfileResult.data.dockerfile).toContain('FROM python:3.11-slim');
      expect(dockerfileResult.data.dockerfile).toContain('uvicorn');
      expect(dockerfileResult.data.dockerfile).toContain('USER appuser');

      const k8sResult = await generateKubernetesManifestsHandler.execute({
        sessionId,
        appName: 'fastapi-app',
        image: 'fastapi-app:v1.0.0',
        port: 8000,
        environment: 'production',
        targetPath: testDir
      }, mockContext);

      expect(k8sResult.success).toBe(true);
    });
  });

  describe('Go Application Complete Workflow', () => {
    it('should complete full containerization workflow for Go Gin app', async () => {
      await setupGoProject(testDir);

      const sessionId = nanoid();

      // Custom AI responses for Go
      mockSampler.addResponse('repository-analysis', JSON.stringify({
        language: 'go',
        languageVersion: '1.21',
        framework: 'gin',
        buildSystem: { type: 'go', buildFile: 'go.mod', buildCommand: 'go build', testCommand: 'go test' },
        dependencies: ['github.com/gin-gonic/gin'],
        entryPoint: 'main.go',
        suggestedPorts: [8080],
        dockerConfig: { baseImage: 'golang:1.21-alpine', multistage: true, nonRootUser: true }
      }));

      const analysisResult = await analyzer.analyze(testDir);
      expect(analysisResult.success).toBe(true);
      expect(analysisResult.data.language).toBe('go');

      const session = createMockSession({
        id: sessionId,
        workflow_state: { analysis_result: analysisResult.data }
      });

      mockContext.sessionService.get.mockResolvedValue(session);
      mockContext.sessionService.updateAtomic.mockResolvedValue(session);

      const dockerfileResult = await generateDockerfileHandler.execute({
        sessionId,
        targetPath: join(testDir, 'Dockerfile'),
        multistage: true,
        optimizeSize: true
      }, mockContext);

      expect(dockerfileResult.success).toBe(true);
      expect(dockerfileResult.data.stages.length).toBeGreaterThan(1); // Multi-stage
    });
  });

  describe('Error Recovery Integration Across Workflow', () => {
    it('should recover from multiple failure points in workflow', async () => {
      await setupExpressProject(testDir);
      
      const sessionId = nanoid();
      
      // Simulate different types of failures at different stages
      let repositoryAnalysisAttempts = 0;
      let dockerfileAttempts = 0;
      
      const originalSample = mockSampler.sample.bind(mockSampler);
      mockSampler.sample = jest.fn().mockImplementation(async (request) => {
        if (request.templateId === 'repository-analysis') {
          repositoryAnalysisAttempts++;
          if (repositoryAnalysisAttempts === 1) {
            return { success: false, content: null, error: new Error('Network timeout') };
          }
        }
        
        if (request.templateId === 'dockerfile-generation') {
          dockerfileAttempts++;
          if (dockerfileAttempts === 1) {
            return { success: false, content: null, error: new Error('AI service unavailable') };
          }
        }
        
        return originalSample(request);
      });

      // Execute workflow with error recovery
      const analysisResult = await executeWithRecovery(
        () => analyzer.analyze(testDir),
        'Repository analysis with recovery',
        'general'
      );

      if (analysisResult.success) {
        const session = createMockSession({
          id: sessionId,
          workflow_state: { analysis_result: analysisResult.data }
        });

        mockContext.sessionService.get.mockResolvedValue(session);
        mockContext.sessionService.updateAtomic.mockResolvedValue(session);

        const dockerfileResult = await generateDockerfileHandler.execute({
          sessionId,
          targetPath: join(testDir, 'Dockerfile')
        }, mockContext);

        // Should succeed after retries
        expect(dockerfileResult.success).toBe(true);
      }

      // Verify both operations attempted retries
      expect(repositoryAnalysisAttempts).toBeGreaterThan(1);
      expect(dockerfileAttempts).toBeGreaterThan(1);
    });

    it('should provide meaningful error messages with suggestions', async () => {
      await setupExpressProject(testDir);
      
      // Configure persistent AI failure
      mockSampler.setErrorRate(1.0);
      
      const analysisResult = await executeWithRecovery(
        () => analyzer.analyze(testDir),
        'Repository analysis',
        'general'
      );

      expect(analysisResult.success).toBe(false);
      expect(analysisResult.error).toContain('Suggestions:');
      expect(analysisResult.error).toContain('after retries');
    });
  });

  describe('Language-Agnostic AI Prompt Integration', () => {
    it('should work consistently across different programming languages', async () => {
      const languages = [
        { setup: setupExpressProject, expected: 'javascript' },
        { setup: setupFastAPIProject, expected: 'python' },
        { setup: setupGoProject, expected: 'go' }
      ];

      for (const { setup, expected } of languages) {
        const langTestDir = join(testDir, expected);
        await mkdir(langTestDir);
        await setup(langTestDir);

        const result = await analyzer.analyze(langTestDir);
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.language).toBe(expected);
          expect(result.data.dockerConfig).toBeDefined();
          expect(result.data.suggestedPorts.length).toBeGreaterThan(0);
        }
      }
    });
  });
});

// Helper functions to set up test projects
async function setupExpressProject(dir: string) {
  await writeFile(join(dir, 'package.json'), JSON.stringify({
    name: 'express-app',
    version: '1.0.0',
    main: 'server.js',
    dependencies: { express: '^4.18.2', cors: '^2.8.5' },
    devDependencies: { jest: '^29.0.0', nodemon: '^2.0.20' },
    scripts: { start: 'node server.js', dev: 'nodemon server.js --port=3000' }
  }));

  await writeFile(join(dir, 'server.js'), `
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/health', (req, res) => res.json({ status: 'healthy' });
app.listen(port, () => console.log('Server running');
  `);

  await writeFile(join(dir, '.env'), 'PORT=3000');
}

async function setupFastAPIProject(dir: string) {
  await writeFile(join(dir, 'requirements.txt'), 'fastapi==0.104.1\nuvicorn[standard]==0.24.0');
  
  await writeFile(join(dir, 'main.py'), `
from fastapi import FastAPI
app = FastAPI()

@app.get("/health")
def health(): return {"status": "healthy"}
  `);
}

async function setupGoProject(dir: string) {
  await writeFile(join(dir, 'go.mod'), 'module test-app\ngo 1.21\nrequire github.com/gin-gonic/gin v1.9.1');
  
  await writeFile(join(dir, 'main.go'), `
package main
import "github.com/gin-gonic/gin"
func main() {
  r := gin.Default()
  r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "healthy"}) })
  r.Run(":8080")
}
  `);
}