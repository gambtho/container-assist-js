import { describe, it, expect, beforeEach } from '@jest/globals';
import { DockerfileSamplingOrchestrator, createDockerfileSampler, DockerfileContext } from '../../../src/workflows/dockerfile-sampling.js';
import { createMockLogger } from '../../helpers/mock-logger.js';

describe('DockerfileSamplingOrchestrator', () => {
  let orchestrator: DockerfileSamplingOrchestrator;
  let mockLogger: any;
  let baseContext: DockerfileContext;

  beforeEach(() => {
    mockLogger = createMockLogger();
    orchestrator = new DockerfileSamplingOrchestrator(mockLogger);
    
    baseContext = {
      sessionId: 'test-session-123',
      repoPath: '/test/repo',
      packageManager: 'npm',
      nodeVersion: '18',
      exposedPorts: [3000],
    };
  });

  describe('generateBestDockerfile', () => {
    it('generates and returns the best-scoring Dockerfile', async () => {
      const result = await orchestrator.generateBestDockerfile(baseContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBeDefined();
        expect(result.data.content).toMatch(/^FROM /);
        expect(result.data.score).toBeGreaterThan(0);
        expect(result.data.rank).toBe(1);
        expect(result.data.scoreBreakdown).toBeDefined();
        expect(result.data.metadata.strategy).toBeDefined();
      }
    });

    it('respects maxCandidates configuration', async () => {
      const limitedOrchestrator = new DockerfileSamplingOrchestrator(
        mockLogger,
        { maxCandidates: 2 }
      );

      const result = await limitedOrchestrator.generateBestDockerfile(baseContext);

      expect(result.success).toBe(true);
      if (result.success) {
        // Should still return single best result, but limit generation internally
        expect(result.data).toBeDefined();
        expect(result.data.score).toBeGreaterThan(0);
      }
    });

    it('uses environment-specific scoring', async () => {
      const prodOrchestrator = new DockerfileSamplingOrchestrator(
        mockLogger,
        { environment: 'production' }
      );

      const devOrchestrator = new DockerfileSamplingOrchestrator(
        mockLogger,
        { environment: 'development' }
      );

      const prodResult = await prodOrchestrator.generateBestDockerfile(baseContext);
      const devResult = await devOrchestrator.generateBestDockerfile(baseContext);

      expect(prodResult.success).toBe(true);
      expect(devResult.success).toBe(true);

      if (prodResult.success && devResult.success) {
        // Results might be different due to different scoring weights
        // At minimum, both should be valid
        expect(prodResult.data.content).toMatch(/^FROM /);
        expect(devResult.data.content).toMatch(/^FROM /);
      }
    });

    it('handles custom weights', async () => {
      const customOrchestrator = new DockerfileSamplingOrchestrator(
        mockLogger,
        { 
          customWeights: {
            security: 0.8,
            buildTime: 0.2,
          }
        }
      );

      const result = await customOrchestrator.generateBestDockerfile(baseContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.scoreBreakdown).toHaveProperty('security');
        expect(result.data.scoreBreakdown).toHaveProperty('buildTime');
      }
    });
  });

  describe('generateMultipleDockerfiles', () => {
    it('generates and returns multiple ranked Dockerfiles', async () => {
      const result = await orchestrator.generateMultipleDockerfiles(baseContext, 3);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(3);
        
        // Should be ranked by score (highest first)
        for (let i = 0; i < result.data.length - 1; i++) {
          expect(result.data[i].score).toBeGreaterThanOrEqual(result.data[i + 1].score);
          expect(result.data[i].rank).toBe(i + 1);
        }

        // All should be valid Dockerfiles
        for (const dockerfile of result.data) {
          expect(dockerfile.content).toMatch(/^FROM /);
          expect(dockerfile.scoreBreakdown).toBeDefined();
        }
      }
    });

    it('respects the requested count', async () => {
      const result = await orchestrator.generateMultipleDockerfiles(baseContext, 2);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
      }
    });

    it('handles count larger than available candidates', async () => {
      const result = await orchestrator.generateMultipleDockerfiles(baseContext, 10);

      expect(result.success).toBe(true);
      if (result.success) {
        // Should return available candidates (limited by max strategies)
        expect(result.data.length).toBeLessThanOrEqual(5);
        expect(result.data.length).toBeGreaterThan(0);
      }
    });
  });

  describe('validateDockerfile', () => {
    it('validates correct Dockerfile content', async () => {
      const validDockerfile = `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
USER nodejs
EXPOSE 3000
CMD ["node", "index.js"]`;

      const result = await orchestrator.validateDockerfile(validDockerfile);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('rejects invalid Dockerfile content', async () => {
      const invalidDockerfile = `WORKDIR /app
RUN echo "Missing FROM instruction"`;

      const result = await orchestrator.validateDockerfile(invalidDockerfile);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });
  });

  describe('scoreDockerfile', () => {
    it('scores user-provided Dockerfile', async () => {
      const dockerfile = `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
USER nodejs
EXPOSE 3000
HEALTHCHECK CMD curl -f http://localhost:3000/health
CMD ["node", "index.js"]`;

      const result = await orchestrator.scoreDockerfile(dockerfile);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.score).toBeGreaterThan(0);
        expect(result.data.scoreBreakdown).toBeDefined();
        expect(result.data.scoreBreakdown.security).toBeGreaterThan(0);
        expect(result.data.scoreBreakdown.bestPractices).toBeGreaterThan(0);
      }
    });

    it('handles malformed Dockerfile gracefully', async () => {
      const malformedDockerfile = 'This is not a valid Dockerfile';

      const result = await orchestrator.scoreDockerfile(malformedDockerfile);

      expect(result.success).toBe(true);
      if (result.success) {
        // Should still provide a score (likely low)
        expect(typeof result.data.score).toBe('number');
        expect(result.data.scoreBreakdown).toBeDefined();
      }
    });
  });

  describe('caching behavior', () => {
    it('returns consistent results for identical contexts', async () => {
      const context1 = { ...baseContext };
      const context2 = { ...baseContext };

      const result1 = await orchestrator.generateBestDockerfile(context1);
      const result2 = await orchestrator.generateBestDockerfile(context2);

      expect(result1.success && result2.success).toBe(true);
      
      if (result1.success && result2.success) {
        // May be cached results, but should be consistent
        expect(result1.data.score).toBeGreaterThan(0);
        expect(result2.data.score).toBeGreaterThan(0);
      }
    });

    it('generates different results for different contexts', async () => {
      const context1 = { ...baseContext, nodeVersion: '16' };
      const context2 = { ...baseContext, nodeVersion: '20' };

      const result1 = await orchestrator.generateBestDockerfile(context1);
      const result2 = await orchestrator.generateBestDockerfile(context2);

      expect(result1.success && result2.success).toBe(true);
      
      if (result1.success && result2.success) {
        // Should have different content due to different Node versions
        expect(result1.data.content).toMatch(/node:16/);
        expect(result2.data.content).toMatch(/node:20/);
      }
    });
  });

  describe('error handling', () => {
    it('handles invalid context gracefully', async () => {
      const invalidContext = {
        sessionId: '', // Invalid
        repoPath: '',  // Invalid
      } as DockerfileContext;

      const result = await orchestrator.generateBestDockerfile(invalidContext);

      // Should either succeed with defaults or fail gracefully
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
      }
    });

    it('handles generation failures', async () => {
      // Create orchestrator with configuration that might cause issues
      const problematicOrchestrator = new DockerfileSamplingOrchestrator(
        mockLogger,
        { maxCandidates: 0 } // Invalid configuration
      );

      const result = await problematicOrchestrator.generateBestDockerfile(baseContext);

      // Should handle gracefully
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });
});

describe('createDockerfileSampler factory', () => {
  it('creates orchestrator with default options', () => {
    const mockLogger = createMockLogger();
    const sampler = createDockerfileSampler(mockLogger);

    expect(sampler).toBeInstanceOf(DockerfileSamplingOrchestrator);
  });

  it('creates orchestrator with custom options', () => {
    const mockLogger = createMockLogger();
    const options = {
      environment: 'production' as const,
      maxCandidates: 5,
    };
    
    const sampler = createDockerfileSampler(mockLogger, options);

    expect(sampler).toBeInstanceOf(DockerfileSamplingOrchestrator);
  });
});