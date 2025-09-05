/**
 * Cache Key Generation Utilities
 * Provides sophisticated cache key generation with semantic similarity detection
 */

import { createHash } from 'crypto';
import type { AIRequest } from './requests';

/**
 * Options for cache key generation
 */
export interface KeyGenerationOptions {
  /** Whether to include temperature in key (default: true) */
  includeTemperature?: boolean;

  /** Whether to include max tokens in key (default: false) */
  includeMaxTokens?: boolean;

  /** Whether to include model in key (default: true) */
  includeModel?: boolean;

  /** Temperature precision for grouping (default: 0.1) */
  temperaturePrecision?: number;

  /** Whether to normalize prompt whitespace (default: true) */
  normalizeWhitespace?: boolean;

  /** Variables to exclude from key generation */
  excludeVariables?: string[];

  /** Variables to include only (if specified, only these are used) */
  includeOnlyVariables?: string[];
}

/**
 * Semantic similarity threshold for cache key variants
 */
export interface SimilarityOptions {
  /** Enable semantic similarity detection (default: false) */
  enableSimilarity?: boolean;

  /** Similarity threshold (0.0-1.0) for considering requests similar (default: 0.8) */
  similarityThreshold?: number;

  /** Maximum number of similar keys to track per base key (default: 3) */
  maxSimilarKeys?: number;
}

/**
 * Cache key with metadata
 */
export interface CacheKey {
  /** The primary cache key */
  key: string;

  /** Normalized version for similarity detection */
  normalizedKey?: string | undefined;

  /** Hash components used to generate the key */
  components: {
    promptHash: string;
    contextHash: string;
    parametersHash: string;
  };

  /** Metadata about the key generation */
  metadata: {
    templateId?: string | undefined;
    variableCount: number;
    promptLength: number;
    hasContext: boolean;
  };
}

/**
 * Advanced cache key generator with semantic awareness
 */
export class CacheKeyGenerator {
  private options: Required<KeyGenerationOptions>;
  private similarityOptions: Required<SimilarityOptions>;
  private keyRegistry = new Map<string, Set<string>>();

  constructor(options: KeyGenerationOptions = {}, similarityOptions: SimilarityOptions = {}) {
    this.options = {
      includeTemperature: true,
      includeMaxTokens: false,
      includeModel: true,
      temperaturePrecision: 0.1,
      normalizeWhitespace: true,
      excludeVariables: [],
      includeOnlyVariables: [],
      ...options,
    };

    this.similarityOptions = {
      enableSimilarity: false,
      similarityThreshold: 0.8,
      maxSimilarKeys: 3,
      ...similarityOptions,
    };
  }

  /**
   * Generate cache key for AI request
   * @param request - AI request to generate key for
   */
  generateKey(request: AIRequest): CacheKey {
    // Normalize the request
    const normalized = this.normalizeRequest(request);

    // Generate component hashes
    const promptHash = this.hashPrompt(normalized.prompt);
    const contextHash = this.hashContext(normalized.context);
    const parametersHash = this.hashParameters(normalized);

    // Combine hashes into final key
    const keyComponents = [promptHash, contextHash, parametersHash].filter(Boolean);
    const key = this.combineHashes(keyComponents);

    // Generate normalized key for similarity if enabled
    const normalizedKey = this.similarityOptions.enableSimilarity
      ? this.generateNormalizedKey(normalized)
      : undefined;

    // Extract metadata
    const metadata: {
      templateId?: string;
      variableCount: number;
      promptLength: number;
      hasContext: boolean;
    } = {
      variableCount: Object.keys(normalized.context ?? {}).length,
      promptLength: normalized.prompt.length,
      hasContext: normalized.context != null && Object.keys(normalized.context).length > 0,
    };

    const templateId = this.extractTemplateId(request);
    if (templateId) {
      metadata.templateId = templateId;
    }

    const cacheKey: CacheKey = {
      key,
      normalizedKey,
      components: {
        promptHash,
        contextHash,
        parametersHash,
      },
      metadata,
    };

    // Register key for similarity tracking
    if (this.similarityOptions.enableSimilarity && normalizedKey) {
      this.registerKey(normalizedKey, key);
    }

    return cacheKey;
  }

  /**
   * Find similar cache keys for a given request
   * @param request - AI request to find similar keys for
   */
  findSimilarKeys(request: AIRequest): string[] {
    if (!this.similarityOptions.enableSimilarity) {
      return [];
    }

    const normalized = this.normalizeRequest(request);
    const normalizedKey = this.generateNormalizedKey(normalized);

    return Array.from(this.keyRegistry.get(normalizedKey) ?? []);
  }

  /**
   * Check if two requests would generate similar cache keys
   * @param request1 - First request
   * @param request2 - Second request
   */
  areRequestsSimilar(request1: AIRequest, request2: AIRequest): boolean {
    if (!this.similarityOptions.enableSimilarity) {
      return false;
    }

    const key1 = this.generateNormalizedKey(this.normalizeRequest(request1));
    const key2 = this.generateNormalizedKey(this.normalizeRequest(request2));

    return key1 === key2;
  }

  /**
   * Get cache key statistics
   */
  getStats(): {
    totalKeys: number;
    uniqueNormalizedKeys: number;
    averageKeysPerNormalized: number;
  } {
    const totalKeys = Array.from(this.keyRegistry.values()).reduce(
      (sum, keys) => sum + keys.size,
      0,
    );

    const uniqueNormalizedKeys = this.keyRegistry.size;
    const averageKeysPerNormalized =
      uniqueNormalizedKeys > 0 ? totalKeys / uniqueNormalizedKeys : 0;

    return {
      totalKeys,
      uniqueNormalizedKeys,
      averageKeysPerNormalized,
    };
  }

  /**
   * Clear the key registry
   */
  clearRegistry(): void {
    this.keyRegistry.clear();
  }

  /**
   * Normalize request for consistent key generation
   */
  private normalizeRequest(request: AIRequest): AIRequest {
    const normalized: AIRequest = { ...request };

    // Normalize prompt
    if (this.options.normalizeWhitespace) {
      normalized.prompt = this.normalizeWhitespace(request.prompt);
    }

    // Normalize temperature
    if (normalized.temperature !== undefined) {
      normalized.temperature = this.roundToPrecision(
        normalized.temperature,
        this.options.temperaturePrecision,
      );
    }

    // Filter context variables
    if (normalized.context) {
      normalized.context = this.filterContext(normalized.context);
    }

    return normalized;
  }

  /**
   * Generate hash for prompt content
   */
  private hashPrompt(prompt: string): string {
    return createHash('sha256').update(prompt.trim()).digest('hex').substring(0, 16);
  }

  /**
   * Generate hash for context variables
   */
  private hashContext(context?: Record<string, unknown>): string {
    if (!context || Object.keys(context).length === 0) {
      return ';';
    }

    const filtered = this.filterContext(context);
    const sorted = this.sortObjectDeep(filtered);

    return createHash('sha256').update(JSON.stringify(sorted)).digest('hex').substring(0, 16);
  }

  /**
   * Generate hash for sampling parameters
   */
  private hashParameters(request: AIRequest): string {
    const params: Record<string, unknown> = {};

    if (this.options.includeTemperature && request.temperature !== undefined) {
      params.temperature = request.temperature;
    }

    if (this.options.includeMaxTokens && request.maxTokens !== undefined) {
      params.maxTokens = request.maxTokens;
    }

    if (this.options.includeModel && request.model !== undefined) {
      params.model = request.model;
    }

    if (Object.keys(params).length === 0) {
      return ';';
    }

    return createHash('md5').update(JSON.stringify(params)).digest('hex').substring(0, 8);
  }

  /**
   * Generate normalized key for similarity detection
   */
  private generateNormalizedKey(request: AIRequest): string {
    // Create a highly normalized version that ignores minor differences
    const essentials = {
      // Heavily normalize prompt - remove extra whitespace, convert to lowercase
      prompt: this.normalizePromptForSimilarity(request.prompt),
      // Only include essential context variables
      context: this.extractEssentialContext(request.context ?? {}),
      // Round parameters to broader ranges
      temperature: request.temperature ? Math.round(request.temperature * 10) / 10 : undefined,
      model: request.model,
    };

    return createHash('md5').update(JSON.stringify(essentials)).digest('hex').substring(0, 12);
  }

  /**
   * Combine multiple hashes into final key
   */
  private combineHashes(hashes: string[]): string {
    const combined = hashes.join('|');
    return createHash('sha256').update(combined).digest('hex').substring(0, 20);
  }

  /**
   * Filter context variables based on options
   */
  private filterContext(context: Record<string, unknown>): Record<string, unknown> {
    let filtered = { ...context };

    // If includeOnly is specified, use only those variables
    if (this.options.includeOnlyVariables && this.options.includeOnlyVariables.length > 0) {
      const included: Record<string, unknown> = {};
      for (const key of this.options.includeOnlyVariables) {
        if (key in filtered) {
          included[key] = filtered[key];
        }
      }
      filtered = included;
    }

    // Exclude specified variables
    for (const excludeKey of this.options.excludeVariables) {
      delete filtered[excludeKey];
    }

    // Remove internal/debug variables
    const internalPrefixes = ['_', '__', 'debug', 'internal'];
    for (const key of Object.keys(filtered)) {
      if (internalPrefixes.some((prefix) => key.startsWith(prefix))) {
        delete filtered[key];
      }
    }

    return filtered;
  }

  /**
   * Recursively sort object for consistent hashing
   */
  private sortObjectDeep(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sortObjectDeep(item)).sort();
    }

    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj as Record<string, unknown>).sort();

    for (const key of keys) {
      sorted[key] = this.sortObjectDeep((obj as Record<string, unknown>)[key]);
    }

    return sorted;
  }

  /**
   * Normalize whitespace in text
   */
  private normalizeWhitespace(text: string): string {
    return text
      .replace(/\s+/g, ' ') // Multiple whitespace -> single space
      .replace(/\n\s*/g, '\n') // Clean up line breaks
      .trim();
  }

  /**
   * Normalize prompt for similarity detection
   */
  private normalizePromptForSimilarity(prompt: string): string {
    return prompt
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Extract essential context variables for similarity
   */
  private extractEssentialContext(context: Record<string, unknown>): Record<string, unknown> {
    const essential = ['language', 'framework', 'port', 'entryPoint', 'buildSystem'];
    const result: Record<string, unknown> = {};

    for (const key of essential) {
      if (key in context) {
        result[key] = context[key];
      }
    }

    return result;
  }

  /**
   * Extract template ID from request
   */
  private extractTemplateId(request: AIRequest): string | undefined {
    return (
      (request.context?._templateId as string) ??
      ((request.context?._originalTemplate as string) || (request.context?.templateId as string))
    );
  }

  /**
   * Round number to specified precision
   */
  private roundToPrecision(value: number, precision: number): number {
    const factor = 1 / precision;
    return Math.round(value * factor) / factor;
  }

  /**
   * Register key for similarity tracking
   */
  private registerKey(normalizedKey: string, actualKey: string): void {
    if (!this.keyRegistry.has(normalizedKey)) {
      this.keyRegistry.set(normalizedKey, new Set());
    }

    const keySet = this.keyRegistry.get(normalizedKey)!;
    keySet.add(actualKey);

    // Limit the number of similar keys tracked
    if (keySet.size > this.similarityOptions.maxSimilarKeys) {
      // Remove oldest key (simple FIFO)
      const first = keySet.values().next().value as string;
      keySet.delete(first);
    }
  }
}

/**
 * Utility functions for cache key operations
 */
export class CacheKeyUtils {
  /**
   * Extract template ID from cache key metadata
   */
  static getTemplateId(key: CacheKey): string {
    return key.metadata.templateId ?? 'unknown';
  }

  /**
   * Check if cache key represents a complex request
   */
  static isComplexRequest(key: CacheKey): boolean {
    return key.metadata.variableCount > 5 ?? key.metadata.promptLength > 1000;
  }

  /**
   * Get cache key fingerprint for debugging
   */
  static getFingerprint(key: CacheKey): string {
    return `${key.key.substring(0, 8)}...(${key.metadata.variableCount}v,${key.metadata.promptLength}p)`;
  }

  /**
   * Compare two cache keys for similarity
   */
  static areSimilar(key1: CacheKey, key2: CacheKey): boolean {
    if (!key1.normalizedKey || !key2.normalizedKey) {
      return false;
    }

    return key1.normalizedKey === key2.normalizedKey;
  }
}

/**
 * Factory function for creating key generator
 */
export function createCacheKeyGenerator(
  options?: KeyGenerationOptions,
  similarityOptions?: SimilarityOptions,
): CacheKeyGenerator {
  return new CacheKeyGenerator(options, similarityOptions);
}

/**
 * Simple key generation function for basic use cases
 */
export function generateSimpleCacheKey(request: AIRequest): string {
  const generator = new CacheKeyGenerator();
  return generator.generateKey(request).key;
}
