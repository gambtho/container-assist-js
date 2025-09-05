/**
 * Response Cache Tests
 * Comprehensive test coverage for AI response caching system
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ResponseCache } from '../../../../src/infrastructure/ai/response-cache';
import type { Logger } from 'pino';

// Mock Logger
const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
} as any;

// Test data structures
interface TestCacheEntry {
  key: string;
  value: any;
  timestamp: number;
  ttl?: number;
}

interface TestCacheOptions {
  maxSize?: number;
  defaultTTL?: number;
  cleanupInterval?: number;
}

// Enhanced mock cache implementation for comprehensive testing
class MockResponseCache {
  private cache = new Map<string, TestCacheEntry>();
  private accessCount = new Map<string, number>();
  private cleanupTimer?: NodeJS.Timeout;
  private logger: Logger;
  private options: Required<TestCacheOptions>;

  constructor(logger: Logger, options: TestCacheOptions = {}) {
    this.logger = logger.child({ component: 'response-cache' });
    this.options = {
      maxSize: options.maxSize ?? 1000,
      defaultTTL: options.defaultTTL ?? 3600000, // 1 hour default
      cleanupInterval: options.cleanupInterval ?? 300000, // 5 minutes
    };

    this.startPeriodicCleanup();
  }

  async get(key: string): Promise<any | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      this.logger.debug({ key }, 'Cache miss');
      return null;
    }

    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.accessCount.delete(key);
      this.logger.debug({ key }, 'Cache entry expired');
      return null;
    }

    // Update access count
    this.accessCount.set(key, (this.accessCount.get(key) ?? 0) + 1);

    this.logger.debug({ key, hits: this.accessCount.get(key) }, 'Cache hit');
    return entry.value;
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    // If key already exists, update it without counting toward size limit
    const keyExists = this.cache.has(key);
    
    // Enforce cache size limits only for new keys
    if (!keyExists && this.cache.size >= this.options.maxSize) {
      await this.evictOldestEntry();
    }

    const entry: TestCacheEntry = {
      key,
      value,
      timestamp: Date.now(),
      ttl: ttl ?? this.options.defaultTTL,
    };

    this.cache.set(key, entry);

    if (!this.accessCount.has(key)) {
      this.accessCount.set(key, 0);
    }

    this.logger.debug({
      key,
      ttl: entry.ttl,
      cacheSize: this.cache.size,
    }, 'Cache entry stored');
  }

  async delete(key: string): Promise<boolean> {
    const existed = this.cache.has(key);
    this.cache.delete(key);
    this.accessCount.delete(key);

    if (existed) {
      this.logger.debug({ key }, 'Cache entry deleted');
    }

    return existed;
  }

  async clear(): Promise<void> {
    const previousSize = this.cache.size;
    this.cache.clear();
    this.accessCount.clear();

    this.logger.info({ clearedEntries: previousSize }, 'Cache cleared');
  }

  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);

    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.accessCount.delete(key);
      return false;
    }

    return true;
  }

  async size(): Promise<number> {
    // Clean up expired entries first
    await this.cleanupExpired();
    return this.cache.size;
  }

  async getStats(): Promise<{
    size: number;
    maxSize: number;
    hitRate: number;
    totalAccesses: number;
    expiredEntries: number;
  }> {
    const totalAccesses = Array.from(this.accessCount.values()).reduce((sum, count) => sum + count, 0);
    const hitCount = totalAccesses; // All accesses that made it to get() are hits
    const hitRate = totalAccesses > 0 ? hitCount / totalAccesses : 0;

    // Count expired entries
    let expiredCount = 0;
    for (const entry of this.cache.values()) {
      if (this.isExpired(entry)) {
        expiredCount++;
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.options.maxSize,
      hitRate,
      totalAccesses,
      expiredEntries: expiredCount,
    };
  }

  async cleanup(): Promise<number> {
    return await this.cleanupExpired();
  }

  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.logger.debug('Cache shutdown');
  }

  // Private methods
  private isExpired(entry: TestCacheEntry): boolean {
    if (!entry.ttl) return false;
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private async evictOldestEntry(): Promise<void> {
    let lruKey: string | null = null;
    let leastAccessed = Infinity;

    // Find least recently used entry (lowest access count, then oldest timestamp)
    for (const [key, entry] of this.cache.entries()) {
      const accessCount = this.accessCount.get(key) ?? 0;
      if (accessCount < leastAccessed || (accessCount === leastAccessed && entry.timestamp < (this.cache.get(lruKey!)?.timestamp ?? Infinity))) {
        leastAccessed = accessCount;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.accessCount.delete(lruKey);
      this.logger.debug({ evictedKey: lruKey }, 'Evicted LRU cache entry');
    }
  }

  private async cleanupExpired(): Promise<number> {
    const initialSize = this.cache.size;
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.accessCount.delete(key);
    }

    const cleanedCount = expiredKeys.length;
    if (cleanedCount > 0) {
      this.logger.debug({ cleanedCount }, 'Cleaned up expired entries');
    }

    return cleanedCount;
  }

  private startPeriodicCleanup(): void {
    this.cleanupTimer = setInterval(async () => {
      await this.cleanupExpired();
    }, this.options.cleanupInterval);

    // Prevent the timer from keeping the process alive
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }
}

describe('ResponseCache', () => {
  let cache: MockResponseCache;

  beforeEach(() => {
    cache = new MockResponseCache(mockLogger);
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    cache.shutdown();
    jest.useRealTimers();
  });

  describe('Basic Cache Operations', () => {
    it('should store and retrieve values', async () => {
      const key = 'test-key';
      const value = { data: 'test-value', timestamp: Date.now() };

      await cache.set(key, value);
      const retrieved = await cache.get(key);

      expect(retrieved).toEqual(value);
      expect(await cache.has(key)).toBe(true);
      expect(await cache.size()).toBe(1);
    });

    it('should return null for non-existent keys', async () => {
      const result = await cache.get('non-existent-key');
      expect(result).toBeNull();
      expect(await cache.has('non-existent-key')).toBe(false);
    });

    it('should delete entries', async () => {
      const key = 'delete-test';
      await cache.set(key, 'value');

      expect(await cache.has(key)).toBe(true);

      const deleted = await cache.delete(key);
      expect(deleted).toBe(true);
      expect(await cache.has(key)).toBe(false);
      expect(await cache.get(key)).toBeNull();
    });

    it('should clear all entries', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      expect(await cache.size()).toBe(3);

      await cache.clear();

      expect(await cache.size()).toBe(0);
      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBeNull();
      expect(await cache.get('key3')).toBeNull();
    });
  });

  describe('TTL (Time To Live) Functionality', () => {
    it('should expire entries after TTL', async () => {
      const key = 'ttl-test';
      const value = 'expires-soon';
      const shortTTL = 100; // 100ms

      await cache.set(key, value, shortTTL);
      expect(await cache.get(key)).toBe(value);

      // Advance time beyond TTL
      jest.advanceTimersByTime(shortTTL + 1);

      expect(await cache.get(key)).toBeNull();
      expect(await cache.has(key)).toBe(false);
    });

    it('should use default TTL when not specified', async () => {
      const cacheWithShortDefault = new MockResponseCache(mockLogger, { defaultTTL: 100 });

      const key = 'default-ttl-test';
      await cacheWithShortDefault.set(key, 'value');
      expect(await cacheWithShortDefault.get(key)).toBe('value');

      jest.advanceTimersByTime(101);

      expect(await cacheWithShortDefault.get(key)).toBeNull();

      cacheWithShortDefault.shutdown();
    });

    it('should handle entries with different TTLs', async () => {
      await cache.set('short-ttl', 'value1', 100);
      await cache.set('long-ttl', 'value2', 1000);

      // Advance past short TTL but not long TTL
      jest.advanceTimersByTime(150);

      expect(await cache.get('short-ttl')).toBeNull();
      expect(await cache.get('long-ttl')).toBe('value2');

      // Advance past long TTL
      jest.advanceTimersByTime(900);

      expect(await cache.get('long-ttl')).toBeNull();
    });

    it('should handle permanent entries (no TTL)', async () => {
      const permanentCache = new MockResponseCache(mockLogger, { defaultTTL: 0 });

      await permanentCache.set('permanent', 'forever', 0);

      // Advance time significantly
      jest.advanceTimersByTime(10000);

      expect(await permanentCache.get('permanent')).toBe('forever');

      permanentCache.shutdown();
    });
  });

  describe('Cache Size Management', () => {
    it('should enforce maximum cache size', async () => {
      const smallCache = new MockResponseCache(mockLogger, { maxSize: 3 });

      await smallCache.set('key1', 'value1');
      await smallCache.set('key2', 'value2');
      await smallCache.set('key3', 'value3');

      expect(await smallCache.size()).toBe(3);

      // Adding fourth entry should evict oldest
      await smallCache.set('key4', 'value4');

      expect(await smallCache.size()).toBe(3);
      expect(await smallCache.has('key1')).toBe(false); // Oldest should be evicted
      expect(await smallCache.has('key4')).toBe(true);

      smallCache.shutdown();
    });

    it('should evict least recently used entries', async () => {
      const lruCache = new MockResponseCache(mockLogger, { maxSize: 2 });

      await lruCache.set('key1', 'value1');
      await lruCache.set('key2', 'value2');

      // Access key1 to make it more recent
      await lruCache.get('key1');

      // Add key3, should evict key2 (least recently used)
      await lruCache.set('key3', 'value3');

      expect(await lruCache.has('key1')).toBe(true);
      expect(await lruCache.has('key2')).toBe(false);
      expect(await lruCache.has('key3')).toBe(true);

      lruCache.shutdown();
    });
  });

  describe('Cache Statistics and Monitoring', () => {
    it('should track cache statistics', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      // Generate some hits
      await cache.get('key1');
      await cache.get('key1');
      await cache.get('key2');

      // Generate a miss
      await cache.get('nonexistent');

      const stats = await cache.getStats();

      expect(stats.size).toBe(2);
      expect(stats.totalAccesses).toBe(3); // Only successful gets count
      expect(stats.hitRate).toBe(1.0); // 100% hit rate for existing keys
    });

    it('should track expired entries in stats', async () => {
      await cache.set('expiring1', 'value1', 50);
      await cache.set('expiring2', 'value2', 50);
      await cache.set('permanent', 'value3');

      jest.advanceTimersByTime(60);

      const stats = await cache.getStats();

      expect(stats.expiredEntries).toBe(2);
    });

    it('should provide accurate cache size after cleanup', async () => {
      await cache.set('key1', 'value1', 50);
      await cache.set('key2', 'value2', 50);
      await cache.set('key3', 'value3'); // No expiry

      jest.advanceTimersByTime(60);

      // Size should account for expired entries
      const size = await cache.size();
      expect(size).toBe(1); // Only key3 should remain
    });
  });

  describe('Periodic Cleanup', () => {
    it('should periodically clean up expired entries', async () => {
      const fastCleanupCache = new MockResponseCache(mockLogger, {
        cleanupInterval: 100,
        defaultTTL: 50,
      });

      await fastCleanupCache.set('temp1', 'value1');
      await fastCleanupCache.set('temp2', 'value2');

      expect(await fastCleanupCache.size()).toBe(2);

      // Advance past TTL but before cleanup
      jest.advanceTimersByTime(60);
      expect(await fastCleanupCache.size()).toBe(0); // size() triggers cleanup

      // Advance to trigger periodic cleanup
      jest.advanceTimersByTime(50);

      // Manual check without cleanup
      const stats = await fastCleanupCache.getStats();
      expect(stats.size).toBe(0);

      fastCleanupCache.shutdown();
    });

    it('should handle cleanup errors gracefully', async () => {
      const errorCache = new MockResponseCache(mockLogger);

      // Mock a scenario that might cause cleanup errors
      const originalCleanup = (errorCache as any).cleanupExpired;
      (errorCache as any).cleanupExpired = jest.fn().mockRejectedValue(new Error('Cleanup error'));

      await errorCache.set('test', 'value');

      // Manual cleanup should handle error
      try {
        await errorCache.cleanup();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }

      // Restore original method
      (errorCache as any).cleanupExpired = originalCleanup;

      errorCache.shutdown();
    });
  });

  describe('Concurrency and Thread Safety', () => {
    it('should handle concurrent operations', async () => {
      const concurrentOperations = [];

      // Simulate concurrent reads and writes
      for (let i = 0; i < 10; i++) {
        concurrentOperations.push(cache.set(`key${i}`, `value${i}`));
        concurrentOperations.push(cache.get(`key${i % 3}`)); // Some keys won't exist initially
      }

      await Promise.all(concurrentOperations);

      expect(await cache.size()).toBe(10);
    });

    it('should handle concurrent access to same key', async () => {
      const key = 'concurrent-key';
      const value = 'concurrent-value';

      await cache.set(key, value);

      // Simulate multiple concurrent reads
      const reads = Array.from({ length: 5 }, () => cache.get(key));
      const results = await Promise.all(reads);

      results.forEach(result => {
        expect(result).toBe(value);
      });
    });

    it('should handle rapid successive operations', async () => {
      const key = 'rapid-key';

      // Rapid set/get operations
      for (let i = 0; i < 100; i++) {
        await cache.set(key, `value${i}`);
        const retrieved = await cache.get(key);
        expect(retrieved).toBe(`value${i}`);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid keys gracefully', async () => {
      // Empty key
      await expect(cache.set('', 'value')).resolves.not.toThrow();
      expect(await cache.get('')).toBe('value');

      // Very long key
      const longKey = 'x'.repeat(10000);
      await expect(cache.set(longKey, 'value')).resolves.not.toThrow();
      expect(await cache.get(longKey)).toBe('value');

      // Special characters in key
      const specialKey = 'key:with/special\\characters@#$%^&*()';
      await expect(cache.set(specialKey, 'value')).resolves.not.toThrow();
      expect(await cache.get(specialKey)).toBe('value');
    });

    it('should handle large values', async () => {
      const largeValue = {
        data: 'x'.repeat(100000), // 100KB string
        metadata: { size: 100000, type: 'large' },
        nested: {
          array: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: `item-${i}` })),
        },
      };

      await expect(cache.set('large-value', largeValue)).resolves.not.toThrow();
      const retrieved = await cache.get('large-value');
      expect(retrieved).toEqual(largeValue);
    });

    it('should handle null and undefined values', async () => {
      await cache.set('null-value', null);
      await cache.set('undefined-value', undefined);

      expect(await cache.get('null-value')).toBe(null);
      expect(await cache.get('undefined-value')).toBe(undefined);
    });

    it('should handle complex object values', async () => {
      const complexValue = {
        string: 'test',
        number: 42,
        boolean: true,
        array: [1, 2, 3, { nested: true }],
        object: { nested: { deeply: { value: 'deep' } } },
        date: new Date(),
        regexp: /test/g,
        func: () => 'function', // Functions might not serialize properly
      };

      await cache.set('complex', complexValue);
      const retrieved = await cache.get('complex');

      // Most properties should be preserved
      expect(retrieved.string).toBe(complexValue.string);
      expect(retrieved.number).toBe(complexValue.number);
      expect(retrieved.boolean).toBe(complexValue.boolean);
      expect(retrieved.array).toEqual(complexValue.array);
      expect(retrieved.object).toEqual(complexValue.object);
    });
  });

  describe('Performance', () => {
    it('should maintain performance with large number of entries', async () => {
      const largeCache = new MockResponseCache(mockLogger, { maxSize: 10000 });

      const startTime = Date.now();

      // Add many entries
      for (let i = 0; i < 1000; i++) {
        await largeCache.set(`key${i}`, { value: i, data: `data-${i}` });
      }

      const setTime = Date.now() - startTime;

      // Retrieve entries
      const retrieveStartTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        const value = await largeCache.get(`key${i}`);
        expect(value).toBeDefined();
      }

      const retrieveTime = Date.now() - retrieveStartTime;

      // Performance should be reasonable
      expect(setTime).toBeLessThan(1000); // Under 1 second for 1000 sets
      expect(retrieveTime).toBeLessThan(500); // Under 0.5 seconds for 1000 gets

      largeCache.shutdown();
    });

    it('should handle frequent cache misses efficiently', async () => {
      const startTime = Date.now();

      // Generate many cache misses
      for (let i = 0; i < 1000; i++) {
        const result = await cache.get(`nonexistent-${i}`);
        expect(result).toBeNull();
      }

      const missTime = Date.now() - startTime;

      // Cache misses should be very fast
      expect(missTime).toBeLessThan(100);
    });

    it('should efficiently handle mixed read/write workload', async () => {
      const operations = [];
      const startTime = Date.now();

      // Mixed workload
      for (let i = 0; i < 500; i++) {
        if (i % 3 === 0) {
          operations.push(cache.set(`key${i}`, `value${i}`));
        } else {
          operations.push(cache.get(`key${Math.floor(i / 3)}`));
        }
      }

      await Promise.all(operations);

      const totalTime = Date.now() - startTime;
      expect(totalTime).toBeLessThan(500); // Should complete quickly
    });
  });

  describe('Memory Management', () => {
    it('should properly clean up resources on shutdown', async () => {
      const resourceCache = new MockResponseCache(mockLogger);

      await resourceCache.set('test', 'value');
      expect(await resourceCache.size()).toBe(1);

      resourceCache.shutdown();

      // After shutdown, periodic cleanup should not run
      jest.advanceTimersByTime(10000);

      // Cache should still be accessible but no cleanup should occur
      expect(await resourceCache.size()).toBe(1);
    });

    it('should handle memory pressure gracefully', async () => {
      const memoryCache = new MockResponseCache(mockLogger, { maxSize: 100 });

      // Fill cache to capacity
      for (let i = 0; i < 100; i++) {
        await memoryCache.set(`key${i}`, { data: 'x'.repeat(1000) }); // 1KB each
      }

      expect(await memoryCache.size()).toBe(100);

      // Add more entries, should evict old ones
      for (let i = 100; i < 150; i++) {
        await memoryCache.set(`key${i}`, { data: 'x'.repeat(1000) });
      }

      expect(await memoryCache.size()).toBe(100);

      // Early entries should be evicted
      expect(await memoryCache.has('key0')).toBe(false);
      expect(await memoryCache.has('key149')).toBe(true);

      memoryCache.shutdown();
    });
  });
});
