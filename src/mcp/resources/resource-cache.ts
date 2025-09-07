/**
 * Optimized Resource Cache - Intelligent caching strategy with access patterns
 */

import type { Logger } from 'pino';
import { Result, Success, Failure } from '../../core/types';
import type { ResourceCache as IResourceCache } from './types';

interface CachedResource {
  value: unknown;
  expiresAt?: number;
  createdAt: number;
  lastModified: number;
  size: number;
  accessCount: number;
  lastAccessed: number;
}

interface AccessPattern {
  accessCount: number;
  lastAccess: number;
  averageInterval: number;
  totalAccesses: number;
}

interface CacheConfig {
  maxSize?: number;
  defaultTtl?: number;
  maxMemoryUsage?: number;
  enableAccessTracking?: boolean;
  enableValidityCheck?: boolean; // For testing - disable smart TTL extension
}

/**
 * LRU Cache with intelligent TTL calculation
 */
export class ResourceCache implements IResourceCache {
  private cache = new Map<string, CachedResource>();
  private accessPatterns = new Map<string, AccessPattern>();
  private cleanupInterval?: NodeJS.Timeout;
  private readonly logger: Logger;
  private readonly maxSize: number;
  private readonly maxMemoryUsage: number;
  private readonly enableAccessTracking: boolean;
  private readonly enableValidityCheck: boolean;
  private hitCount = 0;
  private requestCount = 0;

  constructor(
    private config: CacheConfig,
    logger: Logger,
  ) {
    this.logger = logger.child({ component: 'ResourceCache' });
    this.maxSize = config.maxSize || 100;
    this.maxMemoryUsage = config.maxMemoryUsage || 50 * 1024 * 1024; // 50MB
    this.enableAccessTracking = config.enableAccessTracking !== false;
    this.enableValidityCheck = config.enableValidityCheck !== false;

    // Start cleanup every 2 minutes for more frequent optimization
    this.cleanupInterval = setInterval(
      () => {
        this.performMaintenance().catch((error) => {
          this.logger.error({ error }, 'Failed to perform cache maintenance');
        });
      },
      2 * 60 * 1000,
    );
  }

  /**
   * Set cache entry with intelligent TTL
   */
  async set(key: string, value: unknown, ttl?: number): Promise<Result<void>> {
    try {
      const now = Date.now();
      const size = this.calculateSize(value);

      // Reject entries that are too large to fit even if cache is empty
      if (size > this.maxMemoryUsage) {
        return Failure(
          `Failed to set cache entry: Value size (${size} bytes) exceeds maximum memory limit (${this.maxMemoryUsage} bytes)`,
        );
      }

      const effectiveTtl = ttl ?? this.calculateOptimalTTL(key, { value, size, lastModified: now });

      // Check if we need to make space
      await this.ensureSpace(size);

      const entry: CachedResource = {
        value,
        createdAt: now,
        lastModified: now,
        size,
        accessCount: 0,
        lastAccessed: now,
      };

      if (effectiveTtl > 0) {
        entry.expiresAt = now + effectiveTtl;
      }

      this.cache.set(key, entry);

      this.logger.debug(
        {
          key,
          ttl: effectiveTtl,
          size,
          expiresAt: entry.expiresAt,
          cacheSize: this.cache.size,
        },
        'Optimized cache entry set',
      );

      return Success(undefined);
    } catch (error) {
      this.logger.error({ error, key }, 'Failed to set cache entry');
      return Failure(
        `Failed to set cache entry: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get cache entry with access tracking
   */
  async get(key: string): Promise<Result<unknown>> {
    try {
      this.requestCount++;

      const entry = this.cache.get(key);

      if (!entry) {
        this.logger.debug({ key }, 'Cache miss');
        return Success(null);
      }

      // Check expiration with staleness validation
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        // Check if resource is still valid before removing (if enabled)
        if (this.enableValidityCheck && (await this.isStillValid(key, entry))) {
          // Extend TTL for valid but expired entries
          const newTtl = this.calculateOptimalTTL(key, entry);
          entry.expiresAt = Date.now() + newTtl;
          this.logger.debug({ key, newTtl }, 'Extended TTL for valid expired entry');
        } else {
          this.cache.delete(key);
          this.logger.debug({ key, expiresAt: entry.expiresAt }, 'Cache entry expired and invalid');
          return Success(null);
        }
      }

      // Update access tracking
      if (this.enableAccessTracking) {
        this.trackAccess(key);
        entry.accessCount++;
        entry.lastAccessed = Date.now();
      }

      this.hitCount++;
      this.logger.debug({ key, accessCount: entry.accessCount }, 'Cache hit');
      return Success(entry.value);
    } catch (error) {
      this.logger.error({ error, key }, 'Failed to get cache entry');
      return Failure(
        `Failed to get cache entry: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Delete cache entry
   */
  async delete(key: string): Promise<Result<boolean>> {
    try {
      const deleted = this.cache.delete(key);
      this.accessPatterns.delete(key);

      this.logger.debug({ key, deleted }, 'Cache entry deleted');
      return Success(deleted);
    } catch (error) {
      this.logger.error({ error, key }, 'Failed to delete cache entry');
      return Failure(
        `Failed to delete cache entry: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<Result<void>> {
    try {
      const size = this.cache.size;
      this.cache.clear();
      this.accessPatterns.clear();
      this.hitCount = 0;
      this.requestCount = 0;

      this.logger.debug({ clearedCount: size }, 'Cache cleared');
      return Success(undefined);
    } catch (error) {
      this.logger.error({ error }, 'Failed to clear cache');
      return Failure(
        `Failed to clear cache: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Check if cache has key
   */
  async has(key: string): Promise<Result<boolean>> {
    try {
      const entry = this.cache.get(key);

      if (!entry) {
        return Success(false);
      }

      // Check expiration
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        if (!this.enableValidityCheck || !(await this.isStillValid(key, entry))) {
          this.cache.delete(key);
          return Success(false);
        }
      }

      return Success(true);
    } catch (error) {
      this.logger.error({ error, key }, 'Failed to check cache entry existence');
      return Failure(
        `Failed to check cache entry existence: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Invalidate entries matching a pattern with improved performance
   */
  async invalidate(
    pattern: string | { tags?: string[]; keyPattern?: string },
  ): Promise<Result<number>> {
    try {
      let invalidatedCount = 0;
      const patternStr = typeof pattern === 'string' ? pattern : pattern.keyPattern;

      if (patternStr) {
        // Use optimized pattern matching for common cases
        if (patternStr.endsWith('/*')) {
          // Prefix matching - more efficient
          const prefix = patternStr.slice(0, -2);
          for (const [key] of this.cache) {
            if (key.startsWith(prefix)) {
              this.cache.delete(key);
              this.accessPatterns.delete(key);
              invalidatedCount++;
            }
          }
        } else {
          // General regex matching
          const regex = new RegExp(patternStr);
          for (const [key] of this.cache) {
            if (regex.test(key)) {
              this.cache.delete(key);
              this.accessPatterns.delete(key);
              invalidatedCount++;
            }
          }
        }
      }

      this.logger.debug({ pattern, invalidatedCount }, 'Cache entries invalidated');
      return Success(invalidatedCount);
    } catch (error) {
      this.logger.error({ error, pattern }, 'Failed to invalidate cache entries');
      return Failure(
        `Failed to invalidate cache entries: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get all keys matching a pattern
   */
  keys(pattern?: string): string[] {
    const allKeys = Array.from(this.cache.keys());

    if (!pattern) {
      return allKeys;
    }

    // Optimize for common patterns
    if (pattern.endsWith('*') && !pattern.includes('?') && !pattern.includes('[')) {
      const prefix = pattern.slice(0, -1);
      return allKeys.filter((key) => key.startsWith(prefix));
    }

    const regex = new RegExp(
      pattern.replace(/\*/g, '.*').replace(/\?/g, '.').replace(/\[/g, '\\[').replace(/\]/g, '\\]'),
    );

    return allKeys.filter((key) => regex.test(key));
  }

  /**
   * Get enhanced cache statistics
   */
  getStats(): {
    size: number;
    hitRate: number;
    memoryUsage: number;
    averageAccessCount: number;
    topKeys: string[];
  } {
    let totalMemory = 0;
    let totalAccesses = 0;
    const keyAccessCounts: Array<{ key: string; count: number }> = [];

    for (const [key, entry] of this.cache.entries()) {
      totalMemory += entry.size;
      totalAccesses += entry.accessCount;
      keyAccessCounts.push({ key, count: entry.accessCount });
    }

    // Sort by access count to get top keys
    keyAccessCounts.sort((a, b) => b.count - a.count);
    const topKeys = keyAccessCounts.slice(0, 5).map((item) => item.key);

    return {
      size: this.cache.size,
      hitRate: this.requestCount > 0 ? this.hitCount / this.requestCount : 0,
      memoryUsage: totalMemory,
      averageAccessCount: this.cache.size > 0 ? totalAccesses / this.cache.size : 0,
      topKeys,
    };
  }

  /**
   * Calculate optimal TTL based on access patterns and content characteristics
   */
  private calculateOptimalTTL(
    key: string,
    entry: { value: unknown; size: number; lastModified: number },
  ): number {
    const defaultTtl = this.config.defaultTtl || 3600000; // 1 hour
    const pattern = this.accessPatterns.get(key);

    if (!pattern) {
      return defaultTtl;
    }

    let multiplier = 1.0;

    // Frequently accessed resources get longer TTL
    if (pattern.accessCount > 10) {
      multiplier *= 2.0; // 2 hours
    } else if (pattern.accessCount > 5) {
      multiplier *= 1.5; // 1.5 hours
    }

    // Large resources get shorter TTL to manage memory
    if (entry.size > 1024 * 1024) {
      // > 1MB
      multiplier *= 0.5; // 30 minutes
    }

    // Recently modified resources get shorter TTL for freshness
    const timeSinceModified = Date.now() - entry.lastModified;
    if (timeSinceModified < 300000) {
      // < 5 minutes
      multiplier *= 0.33; // 20 minutes
    }

    // Resources with regular access patterns get extended TTL
    if (pattern.averageInterval > 0 && pattern.totalAccesses > 3) {
      const predictedNextAccess = pattern.averageInterval * 1.5;
      const extendedTtl = Math.min(predictedNextAccess, defaultTtl * 3);
      if (extendedTtl > defaultTtl * multiplier) {
        return extendedTtl;
      }
    }

    return Math.floor(defaultTtl * multiplier);
  }

  /**
   * Track access patterns for intelligent caching
   */
  private trackAccess(key: string): void {
    const now = Date.now();
    let pattern = this.accessPatterns.get(key);

    if (!pattern) {
      pattern = {
        accessCount: 0,
        lastAccess: now,
        averageInterval: 0,
        totalAccesses: 0,
      };
    }

    // Update access pattern
    pattern.accessCount++;
    pattern.totalAccesses++;

    if (pattern.lastAccess > 0) {
      const interval = now - pattern.lastAccess;
      // Calculate moving average of access intervals
      pattern.averageInterval =
        pattern.averageInterval === 0 ? interval : pattern.averageInterval * 0.8 + interval * 0.2;
    }

    pattern.lastAccess = now;
    this.accessPatterns.set(key, pattern);
  }

  /**
   * Validate if cached resource is still valid
   */
  private async isStillValid(key: string, entry: CachedResource): Promise<boolean> {
    try {
      // For file-based resources, check modification time
      if (key.startsWith('file://')) {
        const fs = await import('fs/promises');
        const filePath = key.replace('file://', '');
        try {
          const stats = await fs.stat(filePath);
          return stats.mtime.getTime() <= entry.lastModified;
        } catch {
          // File doesn't exist anymore
          return false;
        }
      }

      // For other resources, assume they're still valid
      // In a full implementation, this could check external sources
      return true;
    } catch (error) {
      this.logger.debug({ error, key }, 'Failed to validate resource, assuming invalid');
      return false;
    }
  }

  /**
   * Calculate size of value in bytes
   */
  private calculateSize(value: unknown): number {
    if (typeof value === 'string') {
      return Buffer.byteLength(value, 'utf8');
    }

    if (Buffer.isBuffer(value)) {
      return value.length;
    }

    // Estimate object size
    try {
      return Buffer.byteLength(JSON.stringify(value), 'utf8');
    } catch {
      // Fallback estimation for complex objects
      return 1024; // 1KB estimate
    }
  }

  /**
   * Ensure there's space for new entry by evicting if necessary
   */
  private async ensureSpace(newEntrySize: number): Promise<void> {
    // Check size limit
    if (this.cache.size >= this.maxSize) {
      await this.evictLRU();
    }

    // Check memory limit
    const currentMemory = this.getCurrentMemoryUsage();
    if (currentMemory + newEntrySize > this.maxMemoryUsage) {
      await this.evictBySize(currentMemory + newEntrySize - this.maxMemoryUsage);
    }
  }

  /**
   * Get current memory usage
   */
  private getCurrentMemoryUsage(): number {
    let total = 0;
    for (const entry of this.cache.values()) {
      total += entry.size;
    }
    return total;
  }

  /**
   * Evict least recently used entries
   */
  private async evictLRU(): Promise<void> {
    const entries = Array.from(this.cache.entries());

    // Sort by last accessed time (oldest first)
    entries.sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

    // Remove oldest entries (25% of cache or at least 1)
    const toRemove = Math.max(1, Math.floor(entries.length * 0.25));

    for (let i = 0; i < toRemove && i < entries.length; i++) {
      const entry = entries[i];
      if (entry) {
        const [key] = entry;
        this.cache.delete(key);
        this.accessPatterns.delete(key);
      }
    }

    this.logger.debug({ evicted: toRemove }, 'Evicted LRU entries');
  }

  /**
   * Evict entries to free up specified amount of memory
   */
  private async evictBySize(targetFreeBytes: number): Promise<void> {
    const entries = Array.from(this.cache.entries());

    // Sort by value score (least valuable first)
    entries.sort(([, a], [, b]) => {
      const scoreA = this.calculateValueScore(a);
      const scoreB = this.calculateValueScore(b);
      return scoreA - scoreB;
    });

    let freedBytes = 0;
    let evicted = 0;

    for (const [key, entry] of entries) {
      if (freedBytes >= targetFreeBytes) break;

      this.cache.delete(key);
      this.accessPatterns.delete(key);
      freedBytes += entry.size;
      evicted++;
    }

    this.logger.debug({ evicted, freedBytes, targetFreeBytes }, 'Evicted entries by size');
  }

  /**
   * Calculate value score for eviction decisions
   */
  private calculateValueScore(entry: CachedResource): number {
    const now = Date.now();

    // Base score from access frequency
    let score = entry.accessCount;

    // Penalize old entries
    const age = now - entry.createdAt;
    score -= age / (1000 * 60 * 60); // Subtract hours

    // Penalize large entries
    score -= entry.size / (1024 * 1024); // Subtract MB

    // Bonus for recently accessed
    const timeSinceAccess = now - entry.lastAccessed;
    if (timeSinceAccess < 300000) {
      // < 5 minutes
      score += 10;
    }

    return score;
  }

  /**
   * Perform cache maintenance
   */
  private async performMaintenance(): Promise<void> {
    try {
      // Clean up expired entries
      const cleanupResult = await this.cleanupExpired();

      // Clean up old access patterns
      this.cleanupAccessPatterns();

      // Log cache statistics
      const stats = this.getStats();
      this.logger.debug(
        {
          ...stats,
          cleanedExpired: cleanupResult.ok ? cleanupResult.value : 0,
        },
        'Cache maintenance completed',
      );
    } catch (error) {
      this.logger.error({ error }, 'Cache maintenance failed');
    }
  }

  /**
   * Clean up expired cache entries
   */
  private async cleanupExpired(): Promise<Result<number>> {
    try {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [key, entry] of this.cache.entries()) {
        if (entry.expiresAt && now > entry.expiresAt) {
          // Double-check validity before removing (if enabled)
          if (!this.enableValidityCheck || !(await this.isStillValid(key, entry))) {
            this.cache.delete(key);
            this.accessPatterns.delete(key);
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        this.logger.debug({ cleanedCount }, 'Cleaned up expired cache entries');
      }

      return Success(cleanedCount);
    } catch (error) {
      this.logger.error({ error }, 'Failed to cleanup expired entries');
      return Failure(
        `Failed to cleanup expired entries: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Clean up old access patterns
   */
  private cleanupAccessPatterns(): void {
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    for (const [key, pattern] of this.accessPatterns.entries()) {
      if (now - pattern.lastAccess > maxAge) {
        this.accessPatterns.delete(key);
      }
    }
  }

  /**
   * Destroy the cache and cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      delete (this as any).cleanupInterval;
    }
    this.cache.clear();
    this.accessPatterns.clear();
    this.logger.debug('Resource cache destroyed');
  }
}
