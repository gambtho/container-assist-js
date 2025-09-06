import { describe, it, expect, beforeEach } from '@jest/globals';
import { createDockerfileSampler, DockerfileContext } from '../../../src/workflows/dockerfile-sampling.js';
import { createMockLogger } from '../../helpers/mock-logger.js';

describe('Dockerfile Generation (Functional)', () => {
  let dockerfileSampler: any;
  let mockLogger: any;
  let baseContext: DockerfileContext;

  beforeEach(() => {
    mockLogger = createMockLogger();
    dockerfileSampler = createDockerfileSampler(mockLogger);
    
    baseContext = {
      sessionId: 'test-session-123',
      repoPath: '/test/repo',
      packageManager: 'npm',
      nodeVersion: '18',
      exposedPorts: [3000],
    };
  });

  describe('generate', () => {
    it('generates the requested number of candidates', async () => {
      const result = await dockerfileSampler.generateMultipleDockerfiles(baseContext, 3);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(3);
        
        // Each candidate should have required properties
        for (const candidate of result.data) {
          expect(candidate.id).toBeDefined();
          expect(candidate.content).toMatch(/^FROM /);
          expect(candidate.metadata.strategy).toBeDefined();
          expect(candidate.metadata.confidence).toBeGreaterThan(0);
          expect(candidate.generatedAt).toBeInstanceOf(Date);
        }
      }
    });

    it('generates different strategies for multiple candidates', async () => {
      const result = await generator.generate(baseContext, 3);
      
      expect(result.success).toBe(true);
      if (result.success) {
        const strategies = result.data.map(c => c.metadata.strategy);
        const uniqueStrategies = new Set(strategies);
        
        expect(uniqueStrategies.size).toBeGreaterThan(1);
      }
    });

    it('generates valid Dockerfile content', async () => {
      const result = await generator.generate(baseContext, 1);
      
      expect(result.success).toBe(true);
      if (result.success) {
        const dockerfile = result.data[0].content;
        
        // Basic Dockerfile validation
        expect(dockerfile).toMatch(/^FROM /m);
        expect(dockerfile).toMatch(/WORKDIR/m);
        expect(dockerfile).toMatch(/COPY.*package.*json/m);
        expect(dockerfile).toMatch(/EXPOSE\s+3000/m);
        expect(dockerfile).toMatch(/CMD.*node/m);
      }
    });

    it('respects package manager preference', async () => {
      const yarnContext = { ...baseContext, packageManager: 'yarn' as const };
      const result = await generator.generate(yarnContext, 1);
      
      expect(result.success).toBe(true);
      if (result.success) {
        const dockerfile = result.data[0].content;
        expect(dockerfile).toMatch(/yarn/i);
      }
    });

    it('uses specified Node.js version', async () => {
      const nodeContext = { ...baseContext, nodeVersion: '20' };
      const result = await generator.generate(nodeContext, 1);
      
      expect(result.success).toBe(true);
      if (result.success) {
        const dockerfile = result.data[0].content;
        expect(dockerfile).toMatch(/node:20/i);
      }
    });

    it('handles generation errors gracefully', async () => {
      // Test with invalid context
      const invalidContext = {
        ...baseContext,
        sessionId: '', // Invalid session ID
      };
      
      const result = await generator.generate(invalidContext, 1);
      
      // Should either succeed with fallbacks or fail gracefully
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
      }
    });

    it('limits candidates to available strategies', async () => {
      const result = await generator.generate(baseContext, 10); // More than available strategies
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBeLessThanOrEqual(5); // Max strategies available
      }
    });
  });

  describe('validate', () => {
    it('validates correct Dockerfile content', async () => {
      const validDockerfile = `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
USER nodejs
EXPOSE 3000
CMD ["node", "index.js"]`;

      const candidate = {
        id: 'test-candidate',
        content: validDockerfile,
        metadata: {
          strategy: 'test',
          source: 'test',
          confidence: 1.0,
        },
        generatedAt: new Date(),
      };

      const result = await generator.validate(candidate);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(true);
      }
    });

    it('rejects Dockerfile without FROM instruction', async () => {
      const invalidDockerfile = `WORKDIR /app
RUN echo "No FROM instruction"`;

      const candidate = {
        id: 'test-candidate',
        content: invalidDockerfile,
        metadata: {
          strategy: 'test',
          source: 'test',
          confidence: 1.0,
        },
        generatedAt: new Date(),
      };

      const result = await generator.validate(candidate);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(false);
      }
    });

    it('handles validation errors gracefully', async () => {
      const candidate = {
        id: 'test-candidate',
        content: '', // Empty content
        metadata: {
          strategy: 'test',
          source: 'test',
          confidence: 1.0,
        },
        generatedAt: new Date(),
      };

      const result = await generator.validate(candidate);
      // Should handle gracefully - either succeed with false or fail with error message
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('deterministic behavior', () => {
    it('generates consistent results for identical contexts', async () => {
      const context1 = { ...baseContext };
      const context2 = { ...baseContext };
      
      const result1 = await generator.generate(context1, 2);
      const result2 = await generator.generate(context2, 2);
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      
      if (result1.success && result2.success) {
        // Should have same number of candidates
        expect(result1.data.length).toBe(result2.data.length);
        
        // Should use same strategies (order might differ, so check sets)
        const strategies1 = new Set(result1.data.map(c => c.metadata.strategy));
        const strategies2 = new Set(result2.data.map(c => c.metadata.strategy));
        
        expect(strategies1).toEqual(strategies2);
      }
    });

    it('generates different IDs for different generations', async () => {
      const result1 = await generator.generate(baseContext, 1);
      const result2 = await generator.generate(baseContext, 1);
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      
      if (result1.success && result2.success) {
        expect(result1.data[0].id).not.toBe(result2.data[0].id);
      }
    });
  });

  describe('metadata accuracy', () => {
    it('provides realistic build time estimates', async () => {
      const result = await generator.generate(baseContext, 5);
      
      expect(result.success).toBe(true);
      if (result.success) {
        for (const candidate of result.data) {
          expect(candidate.metadata.estimatedBuildTime).toBeGreaterThan(30); // At least 30 seconds
          expect(candidate.metadata.estimatedBuildTime).toBeLessThan(600); // Less than 10 minutes
        }
      }
    });

    it('provides realistic image size estimates', async () => {
      const result = await generator.generate(baseContext, 5);
      
      expect(result.success).toBe(true);
      if (result.success) {
        for (const candidate of result.data) {
          expect(candidate.metadata.estimatedSize).toBeGreaterThan(20); // At least 20MB
          expect(candidate.metadata.estimatedSize).toBeLessThan(500); // Less than 500MB
        }
      }
    });

    it('provides security ratings', async () => {
      const result = await generator.generate(baseContext, 5);
      
      expect(result.success).toBe(true);
      if (result.success) {
        for (const candidate of result.data) {
          expect(candidate.metadata.securityRating).toBeGreaterThanOrEqual(1);
          expect(candidate.metadata.securityRating).toBeLessThanOrEqual(10);
        }
      }
    });
  });
});