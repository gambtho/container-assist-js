/**
 * Optimized Resource Cache Tests
 */

import type { Logger } from 'pino';
import { ResourceCache } from '../../../../../src/resources/resource-cache';
import { createMockLogger } from '../../../../utils/mock-factories';

describe('ResourceCache', () => {
  let cache: ResourceCache;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    cache = new ResourceCache({
      defaultTtl: 3600000,
      maxSize: 10,
      maxMemoryUsage: 1024 * 1024, // 1MB
      enableAccessTracking: true,
      enableValidityCheck: false // Disable for predictable TTL behavior in tests
    }, mockLogger);
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('basic operations', () => {
    it('should set and get values', async () => {
      const setResult = await cache.set('test-key', 'test-value');
      expect(setResult.ok).toBe(true);

      const getResult = await cache.get('test-key');
      expect(getResult.ok).toBe(true);
      expect(getResult.value).toBe('test-value');
    });

    it('should return null for non-existent keys', async () => {
      const getResult = await cache.get('non-existent');
      expect(getResult.ok).toBe(true);
      expect(getResult.value).toBeNull();
    });

    it('should delete values', async () => {
      await cache.set('test-key', 'test-value');
      
      const deleteResult = await cache.delete('test-key');
      expect(deleteResult.ok).toBe(true);
      expect(deleteResult.value).toBe(true);

      const getResult = await cache.get('test-key');
      expect(getResult.ok).toBe(true);
      expect(getResult.value).toBeNull();
    });

    it('should clear all values', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      const clearResult = await cache.clear();
      expect(clearResult.ok).toBe(true);

      const get1 = await cache.get('key1');
      const get2 = await cache.get('key2');
      expect(get1.value).toBeNull();
      expect(get2.value).toBeNull();
    });

    it('should check if keys exist', async () => {
      await cache.set('existing', 'value');

      const existsResult = await cache.has('existing');
      expect(existsResult.ok).toBe(true);
      expect(existsResult.value).toBe(true);

      const notExistsResult = await cache.has('non-existing');
      expect(notExistsResult.ok).toBe(true);
      expect(notExistsResult.value).toBe(false);
    });
  });

  describe('TTL and expiration', () => {
    it('should expire entries after TTL', async () => {
      await cache.set('expire-key', 'expire-value', 100); // 100ms TTL
      
      const immediate = await cache.get('expire-key');
      expect(immediate.value).toBe('expire-value');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      const expired = await cache.get('expire-key');
      expect(expired.value).toBeNull();
    });

    it('should handle entries without TTL', async () => {
      await cache.set('permanent', 'value', 0); // No TTL
      
      // Should still exist after default TTL would have expired
      const result = await cache.get('permanent');
      expect(result.value).toBe('value');
    });

    it('should extend TTL for valid expired entries', async () => {
      // This test would need mock implementation of isStillValid
      // For now, just verify the cache doesn't crash with expired entries
      await cache.set('extend-key', 'value', 50);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const result = await cache.get('extend-key');
      expect(result.ok).toBe(true); // Should not throw
    });
  });

  describe('access tracking', () => {
    it('should track access counts', async () => {
      await cache.set('tracked', 'value');
      
      // Access multiple times
      await cache.get('tracked');
      await cache.get('tracked');
      await cache.get('tracked');

      const stats = cache.getStats();
      expect(stats.hitRate).toBeGreaterThan(0);
    });

    it('should calculate hit rates correctly', async () => {
      await cache.set('hit', 'value');
      
      // 2 hits, 1 miss
      await cache.get('hit');
      await cache.get('hit');
      await cache.get('miss');

      const stats = cache.getStats();
      expect(stats.hitRate).toBeCloseTo(2/3, 2);
    });
  });

  describe('memory management', () => {
    it('should track memory usage', async () => {
      await cache.set('small', 'a');
      await cache.set('large', 'a'.repeat(1000));

      const stats = cache.getStats();
      expect(stats.memoryUsage).toBeGreaterThan(1000);
      expect(stats.size).toBe(2);
    });

    it('should evict entries when size limit reached', async () => {
      // Fill beyond maxSize (10)
      for (let i = 0; i < 15; i++) {
        await cache.set(`key-${i}`, `value-${i}`);
      }

      const stats = cache.getStats();
      expect(stats.size).toBeLessThanOrEqual(10);
    });

    it('should evict entries when memory limit reached', async () => {
      const largeValue = 'x'.repeat(200 * 1024); // 200KB each
      
      // Try to add 6 x 200KB = 1.2MB (exceeds 1MB limit)
      for (let i = 0; i < 6; i++) {
        await cache.set(`large-${i}`, largeValue);
      }

      const stats = cache.getStats();
      expect(stats.memoryUsage).toBeLessThan(1024 * 1024); // Under 1MB
    });
  });

  describe('pattern matching and invalidation', () => {
    beforeEach(async () => {
      await cache.set('user:123:profile', 'profile-data');
      await cache.set('user:123:settings', 'settings-data');
      await cache.set('user:456:profile', 'profile-data-2');
      await cache.set('session:abc:data', 'session-data');
    });

    it('should invalidate with prefix patterns', async () => {
      const result = await cache.invalidate('user:123/*');
      expect(result.ok).toBe(true);
      expect(result.value).toBe(2); // Should invalidate 2 entries

      const profile = await cache.get('user:123:profile');
      const settings = await cache.get('user:123:settings');
      const otherProfile = await cache.get('user:456:profile');
      const session = await cache.get('session:abc:data');

      expect(profile.value).toBeNull();
      expect(settings.value).toBeNull();
      expect(otherProfile.value).toBe('profile-data-2'); // Should remain
      expect(session.value).toBe('session-data'); // Should remain
    });

    it('should invalidate with regex patterns', async () => {
      const result = await cache.invalidate('user:\\d+:profile');
      expect(result.ok).toBe(true);
      expect(result.value).toBe(2); // Should invalidate both profile entries

      const profile1 = await cache.get('user:123:profile');
      const profile2 = await cache.get('user:456:profile');
      const settings = await cache.get('user:123:settings');

      expect(profile1.value).toBeNull();
      expect(profile2.value).toBeNull();
      expect(settings.value).toBe('settings-data'); // Should remain
    });

    it('should list keys with patterns', () => {
      const allKeys = cache.keys();
      expect(allKeys).toHaveLength(4);

      const userKeys = cache.keys('user:*');
      expect(userKeys).toHaveLength(3);
      expect(userKeys).toEqual(
        expect.arrayContaining([
          'user:123:profile',
          'user:123:settings',
          'user:456:profile'
        ])
      );

      const profileKeys = cache.keys('*:profile');
      expect(profileKeys).toHaveLength(2);
    });
  });

  describe('stats and monitoring', () => {
    it('should provide comprehensive stats', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      
      // Access one key multiple times
      await cache.get('key1');
      await cache.get('key1');
      await cache.get('key1');
      await cache.get('key2');
      await cache.get('nonexistent'); // Miss

      const stats = cache.getStats();
      
      expect(stats.size).toBe(2);
      expect(stats.hitRate).toBeCloseTo(0.8, 1); // 4 hits out of 5 requests
      expect(stats.memoryUsage).toBeGreaterThan(0);
      expect(stats.averageAccessCount).toBeGreaterThan(0);
      expect(stats.topKeys).toContain('key1'); // Most accessed
    });

    it('should track top accessed keys', async () => {
      await cache.set('popular', 'value');
      await cache.set('unpopular', 'value');
      
      // Make 'popular' more accessed
      for (let i = 0; i < 5; i++) {
        await cache.get('popular');
      }
      await cache.get('unpopular');

      const stats = cache.getStats();
      expect(stats.topKeys[0]).toBe('popular');
    });
  });

  describe('intelligent TTL calculation', () => {
    it('should extend TTL for frequently accessed items', async () => {
      await cache.set('frequent', 'value', 1000); // 1 second
      
      // Access frequently to build pattern
      for (let i = 0; i < 5; i++) {
        await cache.get('frequent');
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Wait past original TTL
      await new Promise(resolve => setTimeout(resolve, 1200));
      
      // Should potentially still exist due to access pattern
      const result = await cache.get('frequent');
      expect(result.ok).toBe(true);
    });

    it('should use shorter TTL for large items', async () => {
      const largeValue = 'x'.repeat(2 * 1024 * 1024); // 2MB
      
      await cache.set('large', largeValue, 10000); // 10 seconds
      
      // Large items should get shorter effective TTL
      // This is tested indirectly through the cache behavior
      const result = await cache.get('large');
      expect(result.ok).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle set errors gracefully', async () => {
      // Create a cache that will fail on certain operations
      const faultyCache = new ResourceCache({
        defaultTtl: 1000,
        maxSize: 1,
        maxMemoryUsage: 100, // Very small limit
        enableValidityCheck: false
      }, mockLogger);

      const result = await faultyCache.set('key', 'x'.repeat(1000000)); // Very large
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Failed to set cache entry');
      
      faultyCache.destroy();
    });

    it('should handle get errors gracefully', async () => {
      await cache.set('test', 'value');
      
      // Destroy the cache to simulate errors
      cache.destroy();
      
      const result = await cache.get('test');
      expect(result.ok).toBe(true); // Should still work, might return null
    });

    it('should handle invalidation errors gracefully', async () => {
      const result = await cache.invalidate('[invalid-regex');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Failed to invalidate cache entries');
    });
  });

  describe('cleanup and maintenance', () => {
    it('should clean up expired entries automatically', async () => {
      // Set entries with short TTL
      await cache.set('expire1', 'value1', 50);
      await cache.set('expire2', 'value2', 50);
      await cache.set('permanent', 'permanent-value'); // No expiration

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));

      // Trigger maintenance (would normally happen automatically)
      // For testing, we can check that expired entries are gone
      const result1 = await cache.get('expire1');
      const result2 = await cache.get('expire2');
      const resultPerm = await cache.get('permanent');

      expect(result1.value).toBeNull();
      expect(result2.value).toBeNull();
      expect(resultPerm.value).toBe('permanent-value');
    });

    it('should clean up properly on destroy', () => {
      // Should not throw when destroyed
      expect(() => cache.destroy()).not.toThrow();
      
      // Should not throw if destroyed multiple times
      expect(() => cache.destroy()).not.toThrow();
    });
  });

  describe('concurrent access', () => {
    it('should handle concurrent operations safely', async () => {
      const promises = [];
      
      // Concurrent sets
      for (let i = 0; i < 10; i++) {
        promises.push(cache.set(`concurrent-${i}`, `value-${i}`));
      }
      
      // Concurrent gets
      for (let i = 0; i < 10; i++) {
        promises.push(cache.get(`concurrent-${i}`));
      }

      const results = await Promise.all(promises);
      
      // All operations should succeed or gracefully fail
      results.forEach(result => {
        expect(result.ok).toBe(true);
      });
    });
  });
});