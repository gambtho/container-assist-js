import { describe, it, expect, beforeEach } from '@jest/globals';
import { createDockerfileSampler } from '../../dist/workflows/dockerfile-sampling.js';
import { createMockLogger } from '../helpers/mock-logger.js';

describe('Team Beta Sampling Integration', () => {
  let mockLogger: any;

  beforeEach(() => {
    // Enable mocks for integration testing
    process.env.USE_MOCKS = 'true';
    mockLogger = createMockLogger();
  });

  it('creates a working Dockerfile sampler', () => {
    const sampler = createDockerfileSampler(mockLogger);
    expect(sampler).toBeDefined();
  });

  it('generates and scores a Dockerfile', async () => {
    const sampler = createDockerfileSampler(mockLogger);
    
    const context = {
      sessionId: 'integration-test-123',
      repoPath: '/test/repo',
      packageManager: 'npm' as const,
      nodeVersion: '18',
      exposedPorts: [3000],
    };

    const result = await sampler.generateBestDockerfile(context);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toMatch(/^FROM /);
      expect(result.data.score).toBeGreaterThan(0);
      expect(result.data.metadata.strategy).toBeDefined();
    }
  }, 10000); // 10 second timeout for generation

  it('validates production vs development scoring', async () => {
    const prodSampler = createDockerfileSampler(mockLogger, { environment: 'production' });
    const devSampler = createDockerfileSampler(mockLogger, { environment: 'development' });
    
    const context = {
      sessionId: 'scoring-test-123',
      packageManager: 'npm' as const,
      nodeVersion: '18',
    };

    const prodResult = await prodSampler.generateBestDockerfile(context);
    const devResult = await devSampler.generateBestDockerfile(context);
    
    expect(prodResult.success && devResult.success).toBe(true);
    
    if (prodResult.success && devResult.success) {
      // Both should generate valid Dockerfiles
      expect(prodResult.data.content).toMatch(/^FROM /);
      expect(devResult.data.content).toMatch(/^FROM /);
      
      // Scores should be positive
      expect(prodResult.data.score).toBeGreaterThan(0);
      expect(devResult.data.score).toBeGreaterThan(0);
    }
  });

  it('scores user-provided Dockerfile', async () => {
    const sampler = createDockerfileSampler(mockLogger);
    
    const userDockerfile = `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
USER nodejs
EXPOSE 3000
CMD ["node", "index.js"]`;

    const result = await sampler.scoreDockerfile(userDockerfile);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.score).toBeGreaterThan(50); // Should be decent score
      expect(result.data.scoreBreakdown.security).toBeGreaterThan(0);
      expect(result.data.scoreBreakdown.bestPractices).toBeGreaterThan(0);
    }
  });
});