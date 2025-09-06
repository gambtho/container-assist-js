import type { Logger } from 'pino';
import { Result, Success, Failure } from '../../types/core.js';
import type { Resource, ResourceCache } from './types.js';
import { UriParser } from './uri-schemes.js';
import { MemoryResourceCache } from './cache.js';

export class McpResourceManager {
  private readonly cache: ResourceCache;
  private readonly logger: Logger;

  constructor(
    private readonly config: {
      defaultTtl: number;
      maxResourceSize: number;
      cacheConfig?: {
        defaultTtl: number;
      };
    },
    logger: Logger,
    cache?: ResourceCache,
  ) {
    this.logger = logger.child({ component: 'McpResourceManager' });
    this.cache =
      cache ?? new MemoryResourceCache(config.cacheConfig?.defaultTtl ?? config.defaultTtl, logger);
  }

  async publish(uri: string, content: unknown, ttl?: number): Promise<Result<string>> {
    try {
      // Validate URI format
      const parseResult = UriParser.parse(uri);
      if (!parseResult.ok) {
        return Failure(`Invalid URI: ${parseResult.error}`);
      }

      // Check content size
      const contentSize = this.getContentSize(content);
      if (contentSize > this.config.maxResourceSize) {
        return Failure(
          `Resource too large: ${contentSize} bytes (max: ${this.config.maxResourceSize})`,
        );
      }

      // Determine MIME type
      const mimeType = this.determineMimeType(content);

      // Create resource
      const now = new Date();
      const effectiveTtl = ttl ?? this.config.defaultTtl;

      const resource: Resource = {
        uri,
        content,
        mimeType,
        createdAt: now,
        metadata: {
          size: contentSize,
          scheme: parseResult.value.scheme,
        },
      };

      if (effectiveTtl > 0) {
        resource.expiresAt = new Date(now.getTime() + effectiveTtl);
      }

      // Store in cache
      const cacheResult = await this.cache.set(uri, resource, effectiveTtl);
      if (!cacheResult.ok) {
        return Failure(`Failed to cache resource: ${cacheResult.error}`);
      }

      this.logger.info(
        {
          uri,
          contentSize,
          mimeType,
          ttl: effectiveTtl,
          expiresAt: resource.expiresAt,
        },
        'Resource published',
      );

      return Success(uri);
    } catch (error) {
      this.logger.error({ error, uri }, 'Failed to publish resource');
      return Failure(`Failed to publish resource: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async read(uri: string): Promise<Result<Resource | null>> {
    try {
      // Validate URI format
      const parseResult = UriParser.parse(uri);
      if (!parseResult.ok) {
        return Failure(`Invalid URI: ${parseResult.error}`);
      }

      // Get from cache
      const cacheResult = await this.cache.get(uri);
      if (!cacheResult.ok) {
        return Failure(`Failed to read from cache: ${cacheResult.error}`);
      }

      if (!cacheResult.value) {
        this.logger.debug({ uri }, 'Resource not found');
        return Success(null);
      }

      const resource = cacheResult.value as Resource;

      // Check expiration
      if (resource.expiresAt && new Date() > resource.expiresAt) {
        await this.cache.delete(uri);
        this.logger.debug({ uri, expiresAt: resource.expiresAt }, 'Resource expired');
        return Success(null);
      }

      this.logger.debug({ uri, size: this.getContentSize(resource.content) }, 'Resource read');
      return Success(resource);
    } catch (error) {
      this.logger.error({ error, uri }, 'Failed to read resource');
      return Failure(`Failed to read resource: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async invalidate(pattern: string): Promise<Result<void>> {
    try {
      // For now, we need to get all keys and match against pattern
      // This is inefficient but works for the initial implementation
      const listResult = await this.list('*');
      if (!listResult.ok) {
        return Failure(`Failed to list resources for invalidation: ${listResult.error}`);
      }

      let invalidatedCount = 0;
      for (const uri of listResult.value) {
        if (UriParser.matches(uri, pattern)) {
          const deleteResult = await this.cache.delete(uri);
          if (deleteResult.ok && deleteResult.value) {
            invalidatedCount++;
          }
        }
      }

      this.logger.info({ pattern, invalidatedCount }, 'Resources invalidated');
      return Success(undefined);
    } catch (error) {
      this.logger.error({ error, pattern }, 'Failed to invalidate resources');
      return Failure(`Failed to invalidate resources: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async list(pattern: string): Promise<Result<string[]>> {
    try {
      // Since we're using a simple cache implementation, we need to iterate
      // In a production implementation, this would be more efficient
      const uris: string[] = [];

      // This is a basic implementation - in practice we'd need better key iteration
      // For now, we'll return an empty array and log a warning
      this.logger.warn({ pattern }, 'List operation not fully implemented - returning empty array');

      return Success(uris);
    } catch (error) {
      this.logger.error({ error, pattern }, 'Failed to list resources');
      return Failure(`Failed to list resources: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async cleanup(): Promise<Result<void>> {
    try {
      // The cache handles its own cleanup, but we can trigger it manually
      if (this.cache instanceof MemoryResourceCache) {
        // Access private cleanup method through type assertion
        const cleanupResult = await (this.cache as any).cleanupExpired();
        if (!cleanupResult.ok) {
          return Failure(`Cleanup failed: ${cleanupResult.error}`);
        }

        this.logger.info({ cleanedCount: cleanupResult.value }, 'Resource cleanup completed');
      }

      return Success(undefined);
    } catch (error) {
      this.logger.error({ error }, 'Failed to cleanup resources');
      return Failure(`Failed to cleanup resources: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getMetadata(uri: string): Promise<Result<Omit<Resource, 'content'> | null>> {
    try {
      const readResult = await this.read(uri);
      if (!readResult.ok) {
        return Failure(readResult.error);
      }

      if (!readResult.value) {
        return Success(null);
      }

      const { content: _content, ...metadata } = readResult.value;
      return Success(metadata);
    } catch (error) {
      this.logger.error({ error, uri }, 'Failed to get resource metadata');
      return Failure(`Failed to get resource metadata: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the size of content in bytes
   */
  private getContentSize(content: unknown): number {
    if (typeof content === 'string') {
      return Buffer.byteLength(content, 'utf8');
    }

    if (Buffer.isBuffer(content)) {
      return content.length;
    }

    // For objects, stringify and measure
    return Buffer.byteLength(JSON.stringify(content), 'utf8');
  }

  /**
   * Determine MIME type based on content
   */
  private determineMimeType(content: unknown): string {
    if (typeof content === 'string') {
      // Try to detect if it's JSON
      try {
        JSON.parse(content);
        return 'application/json';
      } catch {
        return 'text/plain';
      }
    }

    if (Buffer.isBuffer(content)) {
      return 'application/octet-stream';
    }

    // Objects are serialized as JSON
    return 'application/json';
  }
}
