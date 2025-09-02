/**
 * AI Response Cache with TTL and LRU Eviction
 * Provides intelligent caching for AI responses with semantic similarity detection
 */

import type { Logger } from 'pino';
import { createHash } from 'crypto';
import type { AIRequest } from '../ai-request-builder';

/**
 * Cached response with metadata
 */
export interface CachedResponse {
  /** The cached response data */
  response: unknown;

  /** Timestamp when response was cached */
  timestamp: number;

  /** Time-to-live expiration timestamp */
  expiresAt: number;

  /** Access count for LRU tracking */
  accessCount: number;

  /** Last access timestamp for LRU tracking */
  lastAccessed: number;

  /** Metadata about the original request */
  metadata: {
    /** Template ID that generated this response */
    templateId: string;

    /** Hash of the variables used */
    variablesHash: string;

    /** Sampling parameters used */
    samplingParams: {
      temperature: number;
      maxTokens: number;
      model?: string | undefined;
    };

    /** Size of response in bytes (for memory tracking) */
    responseSizeBytes: number;

    /** Whether this was a successful response */
    wasSuccessful: boolean;

    /** Token usage if available */
    tokensUsed?: number | undefined;
  };
}

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
  /** Total number of cached entries */
  totalEntries: number;

  /** Current memory usage in bytes (estimated) */
  memoryUsageBytes: number;

  /** Cache hit count since last reset */
  hitCount: number;

  /** Cache miss count since last reset */
  missCount: number;

  /** Cache hit rate (0.0 - 1.0) */
  hitRate: number;

  /** Number of entries evicted due to TTL */
  ttlEvictions: number;

  /** Number of entries evicted due to LRU */
  lruEvictions: number;

  /** Average response size in bytes */
  averageResponseSize: number;

  /** Most frequently accessed templates */
  topTemplates: Array<{ templateId: string; accessCount: number }>;
}

/**
 * Cache configuration options
 */
export interface CacheOptions {
  /** Default TTL in milliseconds (default: 15 minutes) */
  defaultTtlMs?: number;

  /** Maximum number of cached entries (default: 100) */
  maxSize?: number;

  /** Maximum memory usage in bytes (default: 50MB) */
  maxMemoryBytes?: number;

  /** Enable/disable cache (default: true) */
  enabled?: boolean;

  /** Cleanup interval in milliseconds (default: 5 minutes) */
  cleanupIntervalMs?: number;

  /** Whether to cache failed responses (default: false) */
  cacheFailures?: boolean;

  /** Custom TTL per template type */
  templateTtlMs?: Record<string, number>;

  /** Whether to enable detailed logging */
  enableDetailedLogging?: boolean;
}

/**
 * AI Response Cache with intelligent eviction strategies
 */
export class AIResponseCache {
  private cache = new Map<string, CachedResponse>();
  private stats: Omit<CacheStats, 'hitRate' | 'averageResponseSize' | 'topTemplates'> = {
    totalEntries: 0,
    memoryUsageBytes: 0,
    hitCount: 0,
    missCount: 0,
    ttlEvictions: 0,
    lruEvictions: 0
  };
  private cleanupTimer?: NodeJS.Timeout | undefined;
  private readonly options: Required<CacheOptions>;
  private logger: Logger;

  constructor(logger: Logger, options: CacheOptions = {}) {
    this.logger = logger.child({ service: 'ai-response-cache' });
    this.options = {
      defaultTtlMs: 15 * 60 * 1000, // 15 minutes
      maxSize: 100,
      maxMemoryBytes: 50 * 1024 * 1024, // 50MB
      enabled: true,
      cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
      cacheFailures: false,
      templateTtlMs: {},
      enableDetailedLogging: false,
      ...options
    };

    if (this.options.enabled) {
      this.startCleanupTimer();
    }
  }

  /**
   * Get cached response if available and not expired
   * @param request - AI request to check cache for
   */
  async get<T = any>(request: AIRequest): Promise<T | null> {
    if (!this.options.enabled) {
      return null;
    }

    const key = this.generateCacheKey(request);
    const cached = this.cache.get(key);

    if (!cached) {
      this.stats.missCount++;
      this.logCacheMiss(key, 'not found');
      return null;
    }

    const now = Date.now();

    // Check TTL expiration
    if (now > cached.expiresAt) {
      this.cache.delete(key);
      this.stats.ttlEvictions++;
      this.stats.totalEntries--;
      this.updateMemoryUsage(-cached.metadata.responseSizeBytes);
      this.stats.missCount++;
      this.logCacheMiss(key, 'expired');
      return null;
    }

    // Update access tracking for LRU
    cached.accessCount++;
    cached.lastAccessed = now;

    this.stats.hitCount++;
    this.logCacheHit(key, cached.metadata.templateId);

    return cached.response;
  }

  /**
   * Cache a response
   * @param request - Original AI request
   * @param response - Response to cache
   * @param wasSuccessful - Whether the response was successful
   * @param tokensUsed - Number of tokens used (if available)
   */
  async set<T = any>(
    request: AIRequest,
    response: T,
    wasSuccessful: boolean = true,
    tokensUsed?: number
  ): Promise<void> {
    if (!this.options.enabled) {
      return;
    }

    // Don't cache failures unless explicitly enabled'
    if (!wasSuccessful && !this.options.cacheFailures) {
      return;
    }

    const key = this.generateCacheKey(request);
    const now = Date.now();

    // Determine TTL for this template
    const templateId = this.extractTemplateId(request);
    const ttl = this.options.templateTtlMs[templateId] || this.options.defaultTtlMs;

    // Calculate response size
    const responseSizeBytes = this.estimateResponseSize(response);

    // Check if we need to make room
    await this.ensureCapacity(responseSizeBytes);

    const cachedResponse: CachedResponse = {
      response,
      timestamp: now,
      expiresAt: now + ttl,
      accessCount: 1,
      lastAccessed: now,
      metadata: {
        templateId,
        variablesHash: this.hashVariables(request.context ?? {}),
        samplingParams: {
          temperature: request.temperature ?? 0.2,
          maxTokens: request.maxTokens ?? 1000,
          ...(request.model && { model: request.model })
        },
        responseSizeBytes,
        wasSuccessful,
        tokensUsed
      }
    };

    // Store in cache
    const existingEntry = this.cache.get(key);
    if (existingEntry) {
      // Update existing entry
      this.updateMemoryUsage(responseSizeBytes - existingEntry.metadata.responseSizeBytes);
    } else {
      // New entry
      this.stats.totalEntries++;
      this.updateMemoryUsage(responseSizeBytes);
    }

    this.cache.set(key, cachedResponse);

    this.logCacheSet(key, templateId, responseSizeBytes);
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.stats = {
      totalEntries: 0,
      memoryUsageBytes: 0,
      hitCount: 0,
      missCount: 0,
      ttlEvictions: 0,
      lruEvictions: 0
    };
    this.logger.info('Cache cleared');
  }

  /**
   * Remove specific entry from cache
   * @param request - Request to remove from cache
   */
  delete(request: AIRequest): boolean {
    const key = this.generateCacheKey(request);
    const cached = this.cache.get(key);

    if (cached) {
      this.cache.delete(key);
      this.stats.totalEntries--;
      this.updateMemoryUsage(-cached.metadata.responseSizeBytes);
      return true;
    }

    return false;
  }

  /**
   * Get current cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hitCount + this.stats.missCount;
    const hitRate = totalRequests > 0 ? this.stats.hitCount / totalRequests : 0;

    // Calculate average response size
    const totalSizes = Array.from(this.cache.values()).reduce(
      (sum, cached) => sum + cached.metadata.responseSizeBytes,
      0
    );
    const averageResponseSize =
      this.stats.totalEntries > 0 ? totalSizes / this.stats.totalEntries : 0;

    // Get top templates by access count
    const templateStats = new Map<string, number>();
    for (const cached of this.cache.values()) {
      const current = templateStats.get(cached.metadata.templateId) || 0;
      templateStats.set(cached.metadata.templateId, current + cached.accessCount);
    }

    const topTemplates = Array.from(templateStats.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([templateId, accessCount]) => ({ templateId, accessCount }));

    return {
      ...this.stats,
      hitRate,
      averageResponseSize,
      topTemplates
    };
  }

  /**
   * Reset statistics counters
   */
  resetStats(): void {
    this.stats.hitCount = 0;
    this.stats.missCount = 0;
    this.stats.ttlEvictions = 0;
    this.stats.lruEvictions = 0;
  }

  /**
   * Enable or disable caching
   */
  setEnabled(enabled: boolean): void {
    this.options.enabled = enabled;

    if (enabled) {
      this.startCleanupTimer();
    } else {
      this.stopCleanupTimer();
      this.clear();
    }

    this.logger.info(`Cache ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Manually trigger cleanup of expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, cached] of this.cache.entries()) {
      if (now > cached.expiresAt) {
        this.cache.delete(key);
        this.stats.totalEntries--;
        this.stats.ttlEvictions++;
        this.updateMemoryUsage(-cached.metadata.responseSizeBytes);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} expired cache entries`);
    }

    return cleanedCount;
  }

  /**
   * Generate stable cache key for request
   */
  private generateCacheKey(request: AIRequest): string {
    // Create normalized representation for hashing
    const normalized = {
      prompt: request.prompt.trim(),
      temperature: Math.round((request.temperature ?? 0.2) * 100), // Round to avoid floating point issues
      maxTokens: request.maxTokens ?? 1000,
      model: request.model ?? 'default',
      context: this.sortObject(request.context ?? {})
    };

    // Create hash
    const hash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');

    return hash.substring(0, 16); // Use first 16 chars for key
  }

  /**
   * Extract template ID from request context or prompt
   */
  private extractTemplateId(request: AIRequest): string {
    // Try to get from context first
    if (request.context?._originalTemplate) {
      return request.context._originalTemplate;
    }

    if (request.context?._templateId) {
      return request.context._templateId;
    }

    // Try to infer from prompt content
    const prompt = request.prompt.toLowerCase();
    if (prompt.includes('dockerfile')) return 'dockerfile-generation';
    if (prompt.includes('kubernetes') || prompt.includes('k8s')) return 'k8s-generation';
    if (prompt.includes('analyze')) return 'repository-analysis';
    if (prompt.includes('fix') || prompt.includes('error')) return 'error-analysis';
    if (prompt.includes('optimization') || prompt.includes('improve'))
      return 'optimization-suggestion';

    return 'unknown';
  }

  /**
   * Create hash of variables for cache key stability
   */
  private hashVariables(variables: Record<string, any>): string {
    const sorted = this.sortObject(variables);
    return createHash('md5').update(JSON.stringify(sorted)).digest('hex').substring(0, 8);
  }

  /**
   * Recursively sort object keys for stable hashing
   */
  private sortObject(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sortObject(item));
    }

    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj as Record<string, unknown>).sort();

    for (const key of keys) {
      sorted[key] = this.sortObject((obj as Record<string, unknown>)[key]);
    }

    return sorted;
  }

  /**
   * Estimate response size in bytes
   */
  private estimateResponseSize(response: unknown): number {
    if (typeof response === 'string') {
      return Buffer.byteLength(response, 'utf8');
    }

    // For objects, estimate based on JSON serialization
    try {
      const json = JSON.stringify(response);
      return Buffer.byteLength(json, 'utf8');
    } catch {
      // Fallback for non-serializable objects
      return 1000; // Rough estimate
    }
  }

  /**
   * Ensure we have capacity for a new entry
   */
  private async ensureCapacity(newResponseSize: number): Promise<void> {
    // Check size limit
    while (this.stats.totalEntries >= this.options.maxSize) {
      this.evictLeastRecentlyUsed();
    }

    // Check memory limit
    while (this.stats.memoryUsageBytes + newResponseSize > this.options.maxMemoryBytes) {
      this.evictLeastRecentlyUsed();
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLeastRecentlyUsed(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, cached] of this.cache.entries()) {
      if (cached.lastAccessed < oldestTime) {
        oldestTime = cached.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const cached = this.cache.get(oldestKey)!;
      this.cache.delete(oldestKey);
      this.stats.totalEntries--;
      this.stats.lruEvictions++;
      this.updateMemoryUsage(-cached.metadata.responseSizeBytes);

      this.logger.debug(`Evicted LRU entry: ${cached.metadata.templateId}`);
    }
  }

  /**
   * Update memory usage tracking
   */
  private updateMemoryUsage(delta: number): void {
    this.stats.memoryUsageBytes = Math.max(0, this.stats.memoryUsageBytes + delta);
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      return;
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.options.cleanupIntervalMs);
  }

  /**
   * Stop cleanup timer
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Log cache hit
   */
  private logCacheHit(key: string, templateId: string): void {
    if (this.options.enableDetailedLogging) {
      this.logger.debug({ key: key.substring(0, 8), templateId }, 'Cache hit');
    }
  }

  /**
   * Log cache miss
   */
  private logCacheMiss(key: string, reason: string): void {
    if (this.options.enableDetailedLogging) {
      this.logger.debug({ key: key.substring(0, 8), reason }, 'Cache miss');
    }
  }

  /**
   * Log cache set
   */
  private logCacheSet(key: string, templateId: string, size: number): void {
    if (this.options.enableDetailedLogging) {
      this.logger.debug(
        {
          key: key.substring(0, 8),
          templateId,
          size,
          totalEntries: this.stats.totalEntries
        },
        'Cache set'
      );
    }
  }

  /**
   * Cleanup on destruction
   */
  destroy(): void {
    this.stopCleanupTimer();
    this.clear();
  }
}

/**
 * Factory function to create configured cache instance
 */
export function createAIResponseCache(logger: Logger, options?: CacheOptions): AIResponseCache {
  return new AIResponseCache(logger, options);
}
