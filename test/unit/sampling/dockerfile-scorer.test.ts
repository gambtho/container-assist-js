import { describe, it, expect, beforeEach } from '@jest/globals';
import { DockerfileScorer, ProductionDockerfileScorer, DevelopmentDockerfileScorer } from '../../../src/workflows/sampling/dockerfile/scorers.js';
import { Candidate } from '../../../src/lib/sampling.js';
import { createMockLogger } from '../../helpers/mock-logger.js';

describe('DockerfileScorer', () => {
  let scorer: DockerfileScorer;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = createMockLogger();
    scorer = new DockerfileScorer(mockLogger);
  });

  const createTestCandidate = (dockerfile: string, overrides: Partial<Candidate<string>> = {}): Candidate<string> => ({
    id: 'test-candidate',
    content: dockerfile,
    metadata: {
      strategy: 'test',
      source: 'test',
      confidence: 1.0,
      estimatedBuildTime: 120,
      estimatedSize: 80,
      securityRating: 8,
    },
    generatedAt: new Date(),
    ...overrides,
  });

  describe('scoring individual candidates', () => {
    it('scores a basic valid Dockerfile', async () => {
      const dockerfile = `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
COPY . .
USER nodejs
EXPOSE 3000
CMD ["node", "index.js"]`;

      const candidate = createTestCandidate(dockerfile);
      const result = await scorer.score([candidate]);

      expect(result.success).toBe(true);
      if (result.success) {
        const scored = result.data[0];
        expect(scored.score).toBeGreaterThan(0);
        expect(scored.scoreBreakdown).toHaveProperty('buildTime');
        expect(scored.scoreBreakdown).toHaveProperty('imageSize');
        expect(scored.scoreBreakdown).toHaveProperty('security');
        expect(scored.scoreBreakdown).toHaveProperty('bestPractices');
        expect(scored.scoreBreakdown).toHaveProperty('maintenance');
        expect(scored.scoreBreakdown).toHaveProperty('performance');
        expect(scored.rank).toBe(1);
      }
    });

    it('gives higher scores to security-focused Dockerfiles', async () => {
      const basicDockerfile = `FROM node:18
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "index.js"]`;

      const secureDockerfile = `FROM node:18-alpine
RUN apk update && apk upgrade
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY --chown=nextjs:nodejs . .
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node healthcheck.js
CMD ["node", "index.js"]`;

      const basicCandidate = createTestCandidate(basicDockerfile);
      const secureCandidate = createTestCandidate(secureDockerfile);

      const result = await scorer.score([basicCandidate, secureCandidate]);

      expect(result.success).toBe(true);
      if (result.success) {
        const [ranked1, ranked2] = result.data.sort((a, b) => b.score - a.score);
        expect(ranked1.content).toBe(secureDockerfile);
        expect(ranked1.score).toBeGreaterThan(ranked2.score);
      }
    });

    it('scores build time correctly', async () => {
      const fastBuild = createTestCandidate('FROM node:18-alpine', {
        metadata: {
          strategy: 'fast',
          source: 'test',
          confidence: 1.0,
          estimatedBuildTime: 60, // 1 minute - should score highly
        }
      });

      const slowBuild = createTestCandidate('FROM node:18-alpine', {
        metadata: {
          strategy: 'slow',
          source: 'test',
          confidence: 1.0,
          estimatedBuildTime: 360, // 6 minutes - should score lower
        }
      });

      const fastResult = await scorer.score([fastBuild]);
      const slowResult = await scorer.score([slowBuild]);

      expect(fastResult.success && slowResult.success).toBe(true);
      if (fastResult.success && slowResult.success) {
        expect(fastResult.data[0].scoreBreakdown.buildTime)
          .toBeGreaterThan(slowResult.data[0].scoreBreakdown.buildTime);
      }
    });

    it('scores image size correctly', async () => {
      const smallImage = createTestCandidate('FROM node:18-alpine', {
        metadata: {
          strategy: 'small',
          source: 'test',
          confidence: 1.0,
          estimatedSize: 40, // 40MB - should score highly
        }
      });

      const largeImage = createTestCandidate('FROM node:18-alpine', {
        metadata: {
          strategy: 'large',
          source: 'test',
          confidence: 1.0,
          estimatedSize: 250, // 250MB - should score lower
        }
      });

      const smallResult = await scorer.score([smallImage]);
      const largeResult = await scorer.score([largeImage]);

      expect(smallResult.success && largeResult.success).toBe(true);
      if (smallResult.success && largeResult.success) {
        expect(smallResult.data[0].scoreBreakdown.imageSize)
          .toBeGreaterThan(largeResult.data[0].scoreBreakdown.imageSize);
      }
    });
  });

  describe('deterministic scoring', () => {
    it('produces identical scores for identical candidates', async () => {
      const dockerfile = `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]`;

      const candidate1 = createTestCandidate(dockerfile);
      const candidate2 = createTestCandidate(dockerfile);

      const result1 = await scorer.score([candidate1]);
      const result2 = await scorer.score([candidate2]);

      expect(result1.success && result2.success).toBe(true);
      if (result1.success && result2.success) {
        expect(result1.data[0].score).toBe(result2.data[0].score);
        expect(result1.data[0].scoreBreakdown).toEqual(result2.data[0].scoreBreakdown);
      }
    });

    it('maintains consistent ranking for multiple candidates', async () => {
      const candidates = [
        createTestCandidate(`FROM node:18\nCOPY . .\nCMD ["node", "index.js"]`),
        createTestCandidate(`FROM node:18-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nUSER nodejs\nCMD ["node", "index.js"]`),
        createTestCandidate(`FROM node:18-slim\nWORKDIR /app\nCOPY . .\nRUN npm install\nCMD ["node", "index.js"]`),
      ];

      const result1 = await scorer.score([...candidates]);
      const result2 = await scorer.score([...candidates]);

      expect(result1.success && result2.success).toBe(true);
      if (result1.success && result2.success) {
        const ranks1 = result1.data.map(c => c.rank);
        const ranks2 = result2.data.map(c => c.rank);
        expect(ranks1).toEqual(ranks2);
      }
    });
  });

  describe('score breakdown validation', () => {
    it('provides scores for all criteria', async () => {
      const candidate = createTestCandidate(`FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]`);

      const result = await scorer.score([candidate]);

      expect(result.success).toBe(true);
      if (result.success) {
        const breakdown = result.data[0].scoreBreakdown;
        const requiredCriteria = ['buildTime', 'imageSize', 'security', 'bestPractices', 'maintenance', 'performance'];
        
        for (const criterion of requiredCriteria) {
          expect(breakdown).toHaveProperty(criterion);
          expect(breakdown[criterion]).toBeGreaterThanOrEqual(0);
          expect(breakdown[criterion]).toBeLessThanOrEqual(100);
        }
      }
    });

    it('calculates final score as weighted average', async () => {
      const candidate = createTestCandidate(`FROM node:18-alpine`);
      const result = await scorer.score([candidate]);

      expect(result.success).toBe(true);
      if (result.success) {
        const scored = result.data[0];
        const weights = scorer.weights;
        
        let expectedScore = 0;
        let totalWeight = 0;
        
        for (const [criterion, score] of Object.entries(scored.scoreBreakdown)) {
          const weight = weights[criterion] || 0;
          expectedScore += score * weight;
          totalWeight += weight;
        }
        
        expectedScore = totalWeight > 0 ? expectedScore / totalWeight : 0;
        expect(scored.score).toBeCloseTo(expectedScore, 2);
      }
    });
  });

  describe('weight customization', () => {
    it('allows weight updates', () => {
      const newWeights = {
        security: 0.5,
        performance: 0.3,
        buildTime: 0.2,
      };

      scorer.updateWeights(newWeights);
      const weights = scorer.weights;

      expect(weights.security).toBe(0.5);
      expect(weights.performance).toBe(0.3);
      expect(weights.buildTime).toBe(0.2);
    });

    it('affects final scores after weight updates', async () => {
      const candidate = createTestCandidate(`FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
USER nodejs
EXPOSE 3000
CMD ["node", "index.js"]`);

      // Score with default weights
      const defaultResult = await scorer.score([candidate]);

      // Update weights to emphasize security
      scorer.updateWeights({ security: 0.8, buildTime: 0.1, imageSize: 0.1 });
      const securityFocusedResult = await scorer.score([candidate]);

      expect(defaultResult.success && securityFocusedResult.success).toBe(true);
      if (defaultResult.success && securityFocusedResult.success) {
        // Scores should be different due to weight changes
        expect(defaultResult.data[0].score).not.toBe(securityFocusedResult.data[0].score);
      }
    });
  });
});

describe('ProductionDockerfileScorer', () => {
  it('emphasizes security and performance', () => {
    const mockLogger = createMockLogger();
    const prodScorer = new ProductionDockerfileScorer(mockLogger);
    const weights = prodScorer.weights;

    expect(weights.security).toBeGreaterThan(0.3); // Should be high
    expect(weights.buildTime).toBeLessThan(0.2); // Should be lower than security
  });
});

describe('DevelopmentDockerfileScorer', () => {
  it('emphasizes build time and maintenance', () => {
    const mockLogger = createMockLogger();
    const devScorer = new DevelopmentDockerfileScorer(mockLogger);
    const weights = devScorer.weights;

    expect(weights.buildTime).toBeGreaterThan(0.25); // Should be high
    expect(weights.maintenance).toBeGreaterThan(0.15); // Should be higher than default
  });
});