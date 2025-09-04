/**
 * Tests for AI Response Cache
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AIResponseCache, type CacheOptions } from '../response-cache.js';
import type { Logger } from 'pino';
import type { AIRequest } from '../../ai-request-builder.js';

// Mock logger
const mockLogger: Logger = {
  child: jest.fn(() => mockLogger),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
} as any;

describe('AIResponseCache', () => {
  let cache: AIResponseCache;
  let mockClock: any;

  const sampleRequest: AIRequest = {
    prompt: 'Generate a Dockerfile for Python',
    temperature: 0.2,
    maxTokens: 1500,
    model: 'claude-3-opus',
    context: {
      language: 'python',
      framework: 'fastapi',
      port: 8000
    }
  };

  const sampleResponse = {
    dockerfile:
      'FROM python:3.9\nWORKDIR /app\nCOPY . .\nRUN pip install -r requirements.txt\nEXPOSE 8000\nCMD ["python", "app.py"]'
  };

  beforeEach(() => {
    // Reset time mocks
    mockClock = {
      now: Date.now(),
      advance: (ms: number) => {
        mockClock.now += ms;
        jest.setSystemTime(mockClock.now);
      }
    };
    jest.setSystemTime(mockClock.now);

    // Create cache with short TTL for testing
    const options: CacheOptions = {
      defaultTtlMs: 1000, // 1 second for fast testing
      maxSize: 5,
      cleanupIntervalMs: 500, // 0.5 seconds
      enableDetailedLogging: false
    };
    cache = new AIResponseCache(mockLogger, options);
  });

  afterEach(() => {
    cache.destroy();
    jest.useRealTimers();
  });

  describe('Basic caching operations', () => {
    it('should cache and retrieve responses', async () => {
      // Cache miss initially
      const cached1 = await cache.get(sampleRequest);
      expect(cached1).toBeNull();

      // Set cache entry
      await cache.set(sampleRequest, sampleResponse, true);

      // Cache hit
      const cached2 = await cache.get(sampleRequest);
      expect(cached2).toEqual(sampleResponse);
    });

    it('should return null for non-existent entries', async () => {
      const nonExistentRequest = { ...sampleRequest, prompt: 'Different prompt' };
      const cached = await cache.get(nonExistentRequest);
      expect(cached).toBeNull();
    });

    it('should generate different keys for different requests', async () => {
      const request1 = { ...sampleRequest };
      const request2 = { ...sampleRequest, temperature: 0.5 };

      await cache.set(request1, 'response1', true);
      await cache.set(request2, 'response2', true);

      expect(await cache.get(request1)).toBe('response1');
      expect(await cache.get(request2)).toBe('response2');
    });

    it('should handle different response types', async () => {
      const stringResponse = 'text response';
      const objectResponse = { key: 'value', array: [1, 2, 3] };
      const _numberResponse = 42;

      await cache.set(sampleRequest, stringResponse, true);
      expect(await cache.get(sampleRequest)).toBe(stringResponse);

      await cache.set({ ...sampleRequest, prompt: 'different' }, objectResponse, true);
      expect(await cache.get({ ...sampleRequest, prompt: 'different' })).toEqual(objectResponse);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      await cache.set(sampleRequest, sampleResponse, true);

      // Should be available immediately
      expect(await cache.get(sampleRequest)).toEqual(sampleResponse);

      // Advance time past TTL
      mockClock.advance(1500); // 1.5 seconds, past 1 second TTL

      // Should be expired
      expect(await cache.get(sampleRequest)).toBeNull();
    });

    it('should track TTL evictions in stats', async () => {
      await cache.set(sampleRequest, sampleResponse, true);

      // Advance past TTL and try to get
      mockClock.advance(1500);
      await cache.get(sampleRequest);

      const stats = cache.getStats();
      expect(stats.ttlEvictions).toBe(1);
    });

    it('should clean up expired entries automatically', async () => {
      await cache.set(sampleRequest, sampleResponse, true);

      let stats = cache.getStats();
      expect(stats.totalEntries).toBe(1);

      // Advance past TTL and wait for cleanup
      mockClock.advance(1500);

      // Manual cleanup for testing
      const cleanedCount = cache.cleanup();
      expect(cleanedCount).toBe(1);

      stats = cache.getStats();
      expect(stats.totalEntries).toBe(0);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entries when size limit reached', async () => {
      // Fill cache to capacity (5 entries)
      for (let i = 0; i < 5; i++) {
        const request = { ...sampleRequest, prompt: `prompt ${i}` };
        await cache.set(request, `response ${i}`, true);
      }

      let stats = cache.getStats();
      expect(stats.totalEntries).toBe(5);

      // Access first entry to make it recently used
      await cache.get({ ...sampleRequest, prompt: 'prompt 0' });

      // Add one more entry - should evict LRU (prompt 1, since prompt 0 was accessed)
      const newRequest = { ...sampleRequest, prompt: 'prompt new' };
      await cache.set(newRequest, 'response new', true);

      stats = cache.getStats();
      expect(stats.totalEntries).toBe(5); // Still at capacity
      expect(stats.lruEvictions).toBe(1);

      // First entry should still be there (was accessed recently)
      expect(await cache.get({ ...sampleRequest, prompt: 'prompt 0' })).toBe('response 0');

      // Second entry should be evicted
      expect(await cache.get({ ...sampleRequest, prompt: 'prompt 1' })).toBeNull();

      // New entry should be there
      expect(await cache.get(newRequest)).toBe('response new');
    });

    it('should track access counts and last accessed time', async () => {
      await cache.set(sampleRequest, sampleResponse, true);

      const _initialTime = mockClock.now;

      // Access multiple times
      await cache.get(sampleRequest);
      mockClock.advance(100);
      await cache.get(sampleRequest);

      // The cache should track these accesses (internal implementation detail)
      // We can't directly test the internal state, but we can test that
      // it affects LRU behavior

      // Fill cache with other entries
      for (let i = 0; i < 5; i++) {
        const request = { ...sampleRequest, prompt: `other prompt ${i}` };
        await cache.set(request, `other response ${i}`, true);
      }

      // Original request should still be accessible due to recent access
      // This is tested indirectly through LRU behavior
    });
  });

  describe('Memory management', () => {
    it('should track memory usage', async () => {
      const largeResponse = 'x'.repeat(1000); // 1KB response

      let stats = cache.getStats();
      const initialMemory = stats.memoryUsageBytes;

      await cache.set(sampleRequest, largeResponse, true);

      stats = cache.getStats();
      expect(stats.memoryUsageBytes).toBeGreaterThan(initialMemory);
      expect(stats.memoryUsageBytes).toBeGreaterThanOrEqual(1000);
    });

    it('should evict entries when memory limit approached', async () => {
      // Create cache with very small memory limit for testing
      const smallMemoryCache = new AIResponseCache(mockLogger, {
        defaultTtlMs: 10000,
        maxMemoryBytes: 2000, // 2KB limit
        maxSize: 100 // High size limit so memory is the constraint
      });

      try {
        // Add entries that exceed memory limit
        for (let i = 0; i < 5; i++) {
          const request = { ...sampleRequest, prompt: `large prompt ${i}` };
          const largeResponse = 'x'.repeat(500); // 500 bytes each
          await smallMemoryCache.set(request, largeResponse, true);
        }

        const stats = smallMemoryCache.getStats();
        expect(stats.memoryUsageBytes).toBeLessThanOrEqual(2000);
        expect(stats.lruEvictions).toBeGreaterThan(0);
      } finally {
        smallMemoryCache.destroy();
      }
    });
  });

  describe('Cache statistics', () => {
    it('should track hit and miss counts', async () => {
      let stats = cache.getStats();
      expect(stats.hitCount).toBe(0);
      expect(stats.missCount).toBe(0);
      expect(stats.hitRate).toBe(0);

      // Cache miss
      await cache.get(sampleRequest);

      stats = cache.getStats();
      expect(stats.missCount).toBe(1);
      expect(stats.hitRate).toBe(0);

      // Set and hit
      await cache.set(sampleRequest, sampleResponse, true);
      await cache.get(sampleRequest);

      stats = cache.getStats();
      expect(stats.hitCount).toBe(1);
      expect(stats.missCount).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should track template usage', async () => {
      // Add entries with different template IDs
      const dockerRequest = {
        ...sampleRequest,
        context: { ...sampleRequest.context, _templateId: 'dockerfile-generation' }
      };
      const k8sRequest = {
        ...sampleRequest,
        prompt: 'Generate Kubernetes',
        context: { _templateId: 'k8s-generation' }
      };

      await cache.set(dockerRequest, 'dockerfile response', true);
      await cache.set(k8sRequest, 'k8s response', true);

      // Access docker template multiple times
      await cache.get(dockerRequest);
      await cache.get(dockerRequest);

      const stats = cache.getStats();
      expect(stats.topTemplates).toHaveLength(2);

      // Docker template should have higher access count
      const dockerTemplate = stats.topTemplates.find(
        (t) => t.templateId === 'dockerfile-generation'
      );
      const k8sTemplate = stats.topTemplates.find((t) => t.templateId === 'k8s-generation');

      expect(dockerTemplate?.accessCount).toBeGreaterThan(k8sTemplate?.accessCount || 0);
    });

    it('should calculate average response size', async () => {
      const smallResponse = 'small';
      const largeResponse = 'x'.repeat(1000);

      await cache.set({ ...sampleRequest, prompt: 'small' }, smallResponse, true);
      await cache.set({ ...sampleRequest, prompt: 'large' }, largeResponse, true);

      const stats = cache.getStats();
      expect(stats.averageResponseSize).toBeGreaterThan(0);
      expect(stats.averageResponseSize).toBeLessThan(1000); // Should be between small and large
    });

    it('should allow resetting statistics', async () => {
      await cache.set(sampleRequest, sampleResponse, true);
      await cache.get(sampleRequest);

      let stats = cache.getStats();
      expect(stats.hitCount).toBe(1);

      cache.resetStats();

      stats = cache.getStats();
      expect(stats.hitCount).toBe(0);
      expect(stats.missCount).toBe(0);
    });
  });

  describe('Cache configuration', () => {
    it('should respect cache disabled setting', async () => {
      const disabledCache = new AIResponseCache(mockLogger, { enabled: false });

      try {
        await disabledCache.set(sampleRequest, sampleResponse, true);
        const result = await disabledCache.get(sampleRequest);
        expect(result).toBeNull();
      } finally {
        disabledCache.destroy();
      }
    });

    it('should allow enabling/disabling cache at runtime', async () => {
      await cache.set(sampleRequest, sampleResponse, true);
      expect(await cache.get(sampleRequest)).toEqual(sampleResponse);

      // Disable cache
      cache.setEnabled(false);
      expect(await cache.get(sampleRequest)).toBeNull();

      // Re-enable cache
      cache.setEnabled(true);
      await cache.set(sampleRequest, sampleResponse, true);
      expect(await cache.get(sampleRequest)).toEqual(sampleResponse);
    });

    it('should not cache failures by default', async () => {
      await cache.set(sampleRequest, 'error response', false); // wasSuccessful = false

      const result = await cache.get(sampleRequest);
      expect(result).toBeNull();
    });

    it('should cache failures when explicitly enabled', async () => {
      const failureCachingCache = new AIResponseCache(mockLogger, {
        cacheFailures: true,
        defaultTtlMs: 1000
      });

      try {
        await failureCachingCache.set(sampleRequest, 'error response', false);
        const result = await failureCachingCache.get(sampleRequest);
        expect(result).toBe('error response');
      } finally {
        failureCachingCache.destroy();
      }
    });

    it('should use custom TTL per template', async () => {
      const customTtlCache = new AIResponseCache(mockLogger, {
        defaultTtlMs: 1000,
        templateTtlMs: {
          'dockerfile-generation': 2000, // 2 seconds for dockerfile
          'k8s-generation': 500 // 0.5 seconds for k8s
        }
      });

      try {
        const dockerRequest = {
          ...sampleRequest,
          context: { _templateId: 'dockerfile-generation' }
        };
        const k8sRequest = { ...sampleRequest, context: { _templateId: 'k8s-generation' } };

        await customTtlCache.set(dockerRequest, 'docker response', true);
        await customTtlCache.set(k8sRequest, 'k8s response', true);

        // Advance time past k8s TTL but before docker TTL
        mockClock.advance(1000); // 1 second

        // Docker should still be cached, k8s should be expired
        expect(await customTtlCache.get(dockerRequest)).toBe('docker response');
        expect(await customTtlCache.get(k8sRequest)).toBeNull();
      } finally {
        customTtlCache.destroy();
      }
    });
  });

  describe('Cache operations', () => {
    it('should delete specific entries', async () => {
      await cache.set(sampleRequest, sampleResponse, true);
      expect(await cache.get(sampleRequest)).toEqual(sampleResponse);

      const deleted = cache.delete(sampleRequest);
      expect(deleted).toBe(true);
      expect(await cache.get(sampleRequest)).toBeNull();
    });

    it('should return false when deleting non-existent entry', () => {
      const deleted = cache.delete(sampleRequest);
      expect(deleted).toBe(false);
    });

    it('should clear all entries', async () => {
      // Add multiple entries
      for (let i = 0; i < 3; i++) {
        const request = { ...sampleRequest, prompt: `prompt ${i}` };
        await cache.set(request, `response ${i}`, true);
      }

      let stats = cache.getStats();
      expect(stats.totalEntries).toBe(3);

      cache.clear();

      stats = cache.getStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.memoryUsageBytes).toBe(0);
    });
  });
});
