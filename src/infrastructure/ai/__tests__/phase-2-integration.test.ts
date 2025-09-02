/**
 * Phase 2 Integration Test
 * Tests the integrated Phase 2 components working together
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { Logger } from 'pino';
import { AIRequestBuilder } from '../../ai-request-builder';
import { AIResponseCache } from '../response-cache';
import { ErrorContextFactory } from '../error-context';
import { JSONRepairStrategy, SimplificationStrategy } from '../recovery-strategies';
import { EnhancedErrorRecovery } from '../enhanced-error-recovery';
import type { AIRequest } from '../../ai-request-builder';

// Mock logger
const mockLogger: Logger = {
  child: jest.fn(() => mockLogger),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
} as any;

// Mock sampler for testing
interface MockSamplerResponse {
  text: string;
  tokenCount?: number;
}

interface MockSampler {
  sample: (request: AIRequest) => Promise<MockSamplerResponse | { error: string }>;
}

describe('Phase 2 Integration Test', () => {
  let cache: AIResponseCache;
  let mockSampler: MockSampler;

  beforeEach(() => {
    cache = new AIResponseCache(mockLogger, {
      defaultTtlMs: 60000,
      maxSize: 10,
      enableDetailedLogging: false
    });

    mockSampler = {
      sample: jest.fn().mockResolvedValue({
        text: 'Generated response',
        tokenCount: 100
      })
    };
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('AI Request Builder Integration', () => {
    it('should build optimized requests with context', () => {
      const analysis = {
        language: 'python',
        language_version: '3.9',
        framework: 'fastapi',
        dependencies: [
          { name: 'fastapi', type: 'runtime' as const, version: '0.68.0' },
          { name: 'pytest', type: 'dev' as const, version: '6.2.4' }
        ],
        ports: [8000],
        entry_points: ['main.py'],
        build_system: { type: 'pip', build_file: 'requirements.txt' }
      };

      const request = AIRequestBuilder.for('dockerfile-generation')
        .withContext(analysis)
        .withDockerContext({
          optimization: 'balanced',
          multistage: true,
          securityHardening: true
        })
        .withSampling(0.2, 1500)
        .build();

      expect(request.prompt).toContain('python 3.9');
      expect(request.prompt).toContain('fastapi');
      expect(request.prompt).toContain('balanced optimization');
      expect(request.temperature).toBe(0.2);
      expect(request.maxTokens).toBe(1500);
      expect(request.context?.language).toBe('python');
      expect(request.context?.port).toBe(8000);
    });

    it('should handle retry scenarios with parameter adjustment', () => {
      const originalRequest = AIRequestBuilder.for('dockerfile-generation')
        .withVariables({ language: 'python' })
        .withSampling(0.2, 1000)
        .build();

      const retryRequest = AIRequestBuilder.for('dockerfile-generation')
        .withVariables({ language: 'python' })
        .forRetry(2, ['JSON parsing failed'])
        .build();

      // Retry should have different sampling parameters
      expect(retryRequest.temperature).not.toBe(originalRequest.temperature);
      expect(retryRequest.context?._samplingContext?.isRetry).toBe(true);
      expect(retryRequest.context?._samplingContext?.attemptNumber).toBe(2);
    });
  });

  describe('Response Cache Integration', () => {
    it('should cache and retrieve identical requests', async () => {
      const request = AIRequestBuilder.for('dockerfile-generation')
        .withVariables({ language: 'python', port: 8000 })
        .build();

      const response = { dockerfile: 'FROM python:3.9\nWORKDIR /app' };

      // Cache miss initially
      const cached1 = await cache.get(request);
      expect(cached1).toBeNull();

      // Set cache
      await cache.set(request, response, true, 150);

      // Cache hit
      const cached2 = await cache.get(request);
      expect(cached2).toEqual(response);

      // Verify stats
      const stats = cache.getStats();
      expect(stats.hitCount).toBe(1);
      expect(stats.missCount).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should generate different keys for different requests', async () => {
      const request1 = AIRequestBuilder.for('dockerfile-generation')
        .withVariables({ language: 'python' })
        .build();

      const request2 = AIRequestBuilder.for('dockerfile-generation')
        .withVariables({ language: 'node' })
        .build();

      await cache.set(request1, 'python response', true);
      await cache.set(request2, 'node response', true);

      expect(await cache.get(request1)).toBe('python response');
      expect(await cache.get(request2)).toBe('node response');
    });
  });

  describe('Error Recovery Integration', () => {
    it('should create and update error context correctly', () => {
      const request: AIRequest = {
        prompt: 'Generate Dockerfile',
        temperature: 0.2,
        maxTokens: 1500
      };

      const variables = { language: 'python', framework: 'fastapi' };
      const error = new Error('JSON parsing failed: unexpected token');

      // Create initial context
      const context = ErrorContextFactory.createInitial(
        'dockerfile-generation',
        variables,
        request,
        error
      );

      expect(context.attempt).toBe(1);
      expect(context.templateId).toBe('dockerfile-generation');
      expect(context.previousErrors).toEqual(['JSON parsing failed: unexpected token']);
      expect(context.patterns).toHaveLength(1);
      expect(context.patterns![0].type).toBe('json_syntax');

      // Update for failure
      const newError = new Error('Schema validation failed');
      const updatedContext = ErrorContextFactory.updateForFailure(
        context,
        newError,
        'json_repair',
        { partial: 'data' }
      );

      expect(updatedContext.attempt).toBe(2);
      expect(updatedContext.strategiesUsed).toEqual(['json_repair']);
      expect(updatedContext.partialResult).toEqual({ partial: 'data' });
    });

    it('should select appropriate recovery strategies', () => {
      const jsonRepair = new JSONRepairStrategy();
      const simplification = new SimplificationStrategy();

      // JSON parsing error should trigger JSON repair
      const jsonError = new Error('Unexpected token in JSON');
      const jsonContext = ErrorContextFactory.createInitial(
        'test',
        {},
        { prompt: 'test' },
        jsonError
      );

      expect(jsonRepair.canHandle(jsonError, jsonContext)).toBe(true);
      expect(simplification.canHandle(jsonError, jsonContext)).toBe(false);

      // Complex request timeout should trigger simplification
      const timeoutError = new Error('Request timed out');
      const complexContext = ErrorContextFactory.createInitial(
        'test',
        { var1: 'a', var2: 'b', var3: 'c', var4: 'd', var5: 'e', var6: 'f' },
        { prompt: 'very long prompt ' + 'x'.repeat(1000) },
        timeoutError
      );
      complexContext.attempt = 2; // Second attempt

      expect(simplification.canHandle(timeoutError, complexContext)).toBe(true);
    });
  });

  describe('End-to-End Integration', () => {
    it('should integrate all Phase 2 components in a realistic scenario', async () => {
      const recovery = new EnhancedErrorRecovery(mockLogger, {
        maxAttempts: 3,
        enableDetailedLogging: false
      });

      // Mock executor that fails first then succeeds
      let callCount = 0;
      const executor = jest.fn().mockImplementation(async (request: AIRequest) => {
        callCount++;

        if (callCount === 1) {
          // First call fails with JSON error
          throw new Error('JSON parsing failed: unexpected token at position 10');
        } else {
          // Second call succeeds
          return {
            dockerfile:
              'FROM python:3.9\nWORKDIR /app\nCOPY . .\nRUN pip install -r requirements.txt\nEXPOSE 8000\nCMD ["python", "main.py"]'
          };
        }
      });

      // Create original request
      const originalRequest = AIRequestBuilder.for('dockerfile-generation')
        .withVariables({ language: 'python', framework: 'fastapi' })
        .build();

      // Execute with recovery
      const result = await recovery.recoverWithContext(
        originalRequest,
        new Error('JSON parsing failed: unexpected token at position 10'),
        'dockerfile-generation',
        { language: 'python', framework: 'fastapi' },
        executor
      );

      // Should succeed after recovery
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.attempts.length).toBeGreaterThan(0);
      expect(result.attempts[result.attempts.length - 1].success).toBe(true);
      expect(executor).toHaveBeenCalledTimes(3); // Original + 2 recovery attempts
    });

    it('should demonstrate performance optimization benefits', async () => {
      // Create requests that would benefit from caching
      const baseRequest = AIRequestBuilder.for('dockerfile-generation')
        .withVariables({ language: 'python', framework: 'fastapi' })
        .withSampling(0.2, 1500);

      const request1 = baseRequest.build();
      const request2 = baseRequest.build(); // Identical request

      const response = { dockerfile: 'FROM python:3.9...' };

      // First request - cache miss
      await cache.set(request1, response, true, 150);

      // Second request - cache hit
      const cachedResponse = await cache.get(request2);

      expect(cachedResponse).toEqual(response);

      const stats = cache.getStats();
      expect(stats.hitCount).toBe(1);
      expect(stats.hitRate).toBe(1.0); // 100% hit rate for this test

      // Demonstrate token savings
      expect(stats.totalEntries).toBe(1);
      expect(stats.memoryUsageBytes).toBeGreaterThan(0);
    });
  });

  describe('Performance and Memory Management', () => {
    it('should handle memory pressure with LRU eviction', async () => {
      const smallCache = new AIResponseCache(mockLogger, {
        maxSize: 3,
        defaultTtlMs: 60000
      });

      try {
        // Fill cache to capacity
        for (let i = 0; i < 3; i++) {
          const request = AIRequestBuilder.for('dockerfile-generation')
            .withVariables({ language: `lang${i}` })
            .build();

          await smallCache.set(request, `response${i}`, true);
        }

        let stats = smallCache.getStats();
        expect(stats.totalEntries).toBe(3);

        // Access first entry to make it recently used
        const firstRequest = AIRequestBuilder.for('dockerfile-generation')
          .withVariables({ language: 'lang0' })
          .build();

        await smallCache.get(firstRequest);

        // Add new entry - should evict LRU (lang1)
        const newRequest = AIRequestBuilder.for('dockerfile-generation')
          .withVariables({ language: 'new' })
          .build();

        await smallCache.set(newRequest, 'new response', true);

        stats = smallCache.getStats();
        expect(stats.totalEntries).toBe(3); // Still at capacity
        expect(stats.lruEvictions).toBe(1); // One eviction

        // Check that we still have 3 entries (capacity maintained)
        expect(stats.totalEntries).toBe(3);
        expect(stats.lruEvictions).toBe(1);

        // New entry should be cached
        const newCached = await smallCache.get(newRequest);
        expect(newCached).toBe('new response');
      } finally {
        smallCache.destroy();
      }
    });
  });
});
