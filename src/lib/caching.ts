import { Result, Success, Failure } from '../types/core.js';
import type { Logger } from 'pino';
// Direct integration with Team Alpha's resource management
import { getTeamAlphaIntegration, ResourceManager } from '../infrastructure/team-alpha-integration.js';

// Enhanced caching interfaces for sampling
export interface CacheEntry<T> {
  key: string;
  data: T;
  metadata: {
    createdAt: Date;
    accessedAt: Date;
    accessCount: number;
    ttl: number;
    tags: string[];
    size: number; // in bytes
  };
}

export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  missRate: number;
  evictionCount: number;
}

export interface CacheConfig {
  maxSize: number; // max entries
  maxMemory: number; // max memory in bytes
  defaultTtl: number; // default TTL in ms
  cleanupInterval: number; // cleanup interval in ms
  enableCompression: boolean;
  enableMetrics: boolean;
}

// Advanced caching layer for sampling results
export class SamplingCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };
  private cleanupTimer: NodeJS.Timeout | null = null;
  private logger: Logger;
  private config: CacheConfig;

  private readonly DEFAULT_CONFIG: CacheConfig = {
    maxSize: 1000,
    maxMemory: 100 * 1024 * 1024, // 100MB
    defaultTtl: 3600000, // 1 hour
    cleanupInterval: 300000, // 5 minutes
    enableCompression: false, // Would need compression library
    enableMetrics: true,
  };

  constructor(logger: Logger, config: Partial<CacheConfig> = {}) {
    this.logger = logger;
    this.config = { ...this.DEFAULT_CONFIG, ...config };

    if (this.config.cleanupInterval > 0) {
      this.startCleanupTimer();
    }
  }

  // Hash-based caching with content addressing
  async set<T>(
    key: string,
    data: T,
    options: {
      ttl?: number;
      tags?: string[];
    } = {},
  ): Promise<Result<void>> {
    try {
      const serializedData = JSON.stringify(data);
      const size = Buffer.byteLength(serializedData, 'utf8');
      const ttl = options.ttl || this.config.defaultTtl;
      const now = new Date();

      // Check memory constraints
      if (this.getTotalMemoryUsage() + size > this.config.maxMemory) {
        await this.evictLeastRecentlyUsed();
      }

      // Check size constraints
      if (this.cache.size >= this.config.maxSize) {
        await this.evictLeastRecentlyUsed();
      }

      const entry: CacheEntry<T> = {
        key,
        data,
        metadata: {
          createdAt: now,
          accessedAt: now,
          accessCount: 0,
          ttl,
          tags: options.tags || [],
          size,
        },
      };

      this.cache.set(key, entry);

      this.logger.debug({ key, size, ttl }, 'Cache entry stored');
      return Success(undefined);

    } catch (error) {
      const errorMessage = `Cache set failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error({ key, error }, errorMessage);
      return Failure(errorMessage);
    }
  }

  async get<T>(key: string): Promise<Result<T | null>> {
    try {
      const entry = this.cache.get(key) as CacheEntry<T> | undefined;

      if (!entry) {
        this.stats.misses++;
        this.logger.debug({ key }, 'Cache miss');
        return Success(null);
      }

      // Check TTL expiration
      const now = Date.now();
      if (now - entry.metadata.createdAt.getTime() > entry.metadata.ttl) {
        this.cache.delete(key);
        this.stats.misses++;
        this.logger.debug({ key }, 'Cache miss (expired)');
        return Success(null);
      }

      // Update access metadata
      entry.metadata.accessedAt = new Date();
      entry.metadata.accessCount++;

      this.stats.hits++;
      this.logger.debug({ key, accessCount: entry.metadata.accessCount }, 'Cache hit');

      return Success(entry.data);

    } catch (error) {
      const errorMessage = `Cache get failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error({ key, error }, errorMessage);
      return Failure(errorMessage);
    }
  }

  // Invalidate entries by pattern or tags
  async invalidate(pattern: string | { tags?: string[]; keyPattern?: string }): Promise<Result<number>> {
    try {
      let invalidatedCount = 0;

      if (typeof pattern === 'string') {
        // Pattern-based invalidation
        const regex = new RegExp(pattern);
        const keysToDelete = Array.from(this.cache.keys()).filter(key => regex.test(key));

        for (const key of keysToDelete) {
          this.cache.delete(key);
          invalidatedCount++;
        }
      } else {
        // Tag-based or key pattern invalidation
        const entries = Array.from(this.cache.entries());

        for (const [key, entry] of entries) {
          let shouldDelete = false;

          // Check tag matching
          if (pattern.tags && pattern.tags.length > 0) {
            const hasMatchingTag = pattern.tags.some(tag =>
              entry.metadata.tags.includes(tag),
            );
            if (hasMatchingTag) shouldDelete = true;
          }

          // Check key pattern
          if (pattern.keyPattern) {
            const regex = new RegExp(pattern.keyPattern);
            if (regex.test(key)) shouldDelete = true;
          }

          if (shouldDelete) {
            this.cache.delete(key);
            invalidatedCount++;
          }
        }
      }

      this.logger.debug({ pattern, invalidatedCount }, 'Cache invalidation completed');
      return Success(invalidatedCount);

    } catch (error) {
      const errorMessage = `Cache invalidation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error({ pattern, error }, errorMessage);
      return Failure(errorMessage);
    }
  }

  // Clear entire cache
  async clear(): Promise<Result<void>> {
    try {
      const entriesCleared = this.cache.size;
      this.cache.clear();
      this.resetStats();

      this.logger.info({ entriesCleared }, 'Cache cleared');
      return Success(undefined);

    } catch (error) {
      const errorMessage = `Cache clear failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error({ error }, errorMessage);
      return Failure(errorMessage);
    }
  }

  // Get cache statistics
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;

    return {
      totalEntries: this.cache.size,
      totalSize: this.getTotalMemoryUsage(),
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
      missRate: totalRequests > 0 ? this.stats.misses / totalRequests : 0,
      evictionCount: this.stats.evictions,
    };
  }

  // Content-addressable caching for deterministic results
  generateContentHash(content: unknown): string {
    const contentStr = JSON.stringify(content, Object.keys(content).sort());

    // Simple hash function (in production, use crypto.createHash)
    let hash = 0;
    for (let i = 0; i < contentStr.length; i++) {
      const char = contentStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    return `content:${Math.abs(hash).toString(36)}`;
  }

  // Context-aware cache keys for sampling
  generateSamplingKey(context: {
    type: 'dockerfile' | 'k8s' | 'remediation';
    sessionId: string;
    parameters: Record<string, unknown>;
    candidateCount: number;
  }): string {
    const keyData = {
      type: context.type,
      sessionId: context.sessionId,
      params: context.parameters,
      count: context.candidateCount,
    };

    const contentHash = this.generateContentHash(keyData);
    return `sampling:${context.type}:${contentHash}`;
  }

  // Batch operations for performance
  async setBatch<T>(entries: Array<{
    key: string;
    data: T;
    options?: { ttl?: number; tags?: string[] };
  }>): Promise<Result<void>> {
    try {
      const results = await Promise.all(
        entries.map(entry => this.set(entry.key, entry.data, entry.options)),
      );

      const failures = results.filter(r => !r.success);
      if (failures.length > 0) {
        return Failure(`Batch set had ${failures.length} failures`);
      }

      return Success(undefined);

    } catch (error) {
      return Failure(`Batch set failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getBatch<T>(keys: string[]): Promise<Result<Map<string, T>>> {
    try {
      const results = new Map<string, T>();

      for (const key of keys) {
        const result = await this.get<T>(key);
        if (result.success && result.data !== null) {
          results.set(key, result.data);
        }
      }

      return Success(results);

    } catch (error) {
      return Failure(`Batch get failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Cleanup expired entries
  private async cleanup(): Promise<void> {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.metadata.createdAt.getTime() > entry.metadata.ttl) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug({ cleanedCount }, 'Cleaned up expired cache entries');
    }
  }

  private getTotalMemoryUsage(): number {
    return Array.from(this.cache.values())
      .reduce((total, entry) => total + entry.metadata.size, 0);
  }

  private async evictLeastRecentlyUsed(): Promise<void> {
    if (this.cache.size === 0) return;

    // Find least recently used entry
    let lruKey: string | null = null;
    let oldestAccess = new Date();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.metadata.accessedAt < oldestAccess) {
        oldestAccess = entry.metadata.accessedAt;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.stats.evictions++;
      this.logger.debug({ evictedKey: lruKey }, 'Evicted LRU cache entry');
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch(error => {
        this.logger.error({ error }, 'Cache cleanup failed');
      });
    }, this.config.cleanupInterval);
  }

  private resetStats(): void {
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  // Graceful shutdown
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
    this.logger.debug('Cache destroyed');
  }
}

// Factory for creating sampling-specific caches
export class SamplingCacheFactory {
  private static instances = new Map<string, SamplingCache>();

  static createCache(
    name: string,
    logger: Logger,
    config: Partial<CacheConfig> = {},
  ): SamplingCache {
    if (this.instances.has(name)) {
      return this.instances.get(name)!;
    }

    const cache = new SamplingCache(logger, config);
    this.instances.set(name, cache);

    logger.info({ name, config }, 'Created sampling cache');
    return cache;
  }

  static getCache(name: string): SamplingCache | null {
    return this.instances.get(name) || null;
  }

  static destroyCache(name: string): boolean {
    const cache = this.instances.get(name);
    if (cache) {
      cache.destroy();
      this.instances.delete(name);
      return true;
    }
    return false;
  }

  static destroyAllCaches(): void {
    for (const [name, cache] of this.instances.entries()) {
      cache.destroy();
    }
    this.instances.clear();
  }

  static getCacheNames(): string[] {
    return Array.from(this.instances.keys());
  }
}

// Cache-aware wrapper for resource management
export class CachedResourceManager implements ResourceManager {
  private cache: SamplingCache;
  private fallbackResourceManager: ResourceManager;
  private logger: Logger;

  constructor(logger: Logger, cacheConfig: Partial<CacheConfig> = {}) {
    this.logger = logger;
    this.cache = new SamplingCache(logger, cacheConfig);
    
    // Use Team Alpha's resource manager as fallback
    const teamAlphaIntegration = getTeamAlphaIntegration(logger);
    this.fallbackResourceManager = teamAlphaIntegration.getResourceManager();
  }

  async set(uri: string, content: unknown, ttl?: number): Promise<void> {
    // Set in both cache and fallback storage
    const cacheResult = await this.cache.set(uri, content, { ttl });
    if (!cacheResult.success) {
      this.logger.warn({ uri, error: cacheResult.error }, 'Cache set failed, using fallback');
    }

    // Always set in fallback for persistence
    await this.fallbackResourceManager.set(uri, content, ttl);
  }

  async get(uri: string): Promise<unknown | null> {
    // Try cache first
    const cacheResult = await this.cache.get(uri);
    if (cacheResult.success && cacheResult.data !== null) {
      return cacheResult.data;
    }

    // Fallback to resource manager
    const fallbackData = await this.fallbackResourceManager.get(uri);

    // Populate cache for future requests
    if (fallbackData !== null) {
      await this.cache.set(uri, fallbackData);
    }

    return fallbackData;
  }

  async invalidate(pattern: string): Promise<void> {
    await this.cache.invalidate(pattern);
    await this.fallbackResourceManager.invalidate(pattern);
  }

  async clear(): Promise<void> {
    await this.cache.clear();
    await this.fallbackResourceManager.clear();
  }

  getStats(): CacheStats {
    return this.cache.getStats();
  }

  destroy(): void {
    this.cache.destroy();
  }
}

// Utility functions
export const createCachedResourceManager = (
  logger: Logger,
  cacheConfig: Partial<CacheConfig> = {},
): CachedResourceManager => {
  return new CachedResourceManager(logger, cacheConfig);
};

export const createSamplingCache = (
  logger: Logger,
  config: Partial<CacheConfig> = {},
): SamplingCache => {
  return new SamplingCache(logger, config);
};

// Type exports
export type {
  CacheEntry,
  CacheStats,
  CacheConfig,
};
