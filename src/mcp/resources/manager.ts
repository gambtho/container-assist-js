import type { Logger } from 'pino';
import { Result, Success, Failure } from '../../types/core.js';
import type { Resource, ResourceCache } from './types.js';
import { UriParser } from './uri-schemes.js';
import { MemoryResourceCache } from './cache.js';

/**
 * Resource configuration
 */
export interface ResourceConfig {
  defaultTtl: number;
  maxResourceSize: number;
  cacheConfig?: {
    defaultTtl: number;
  };
}

/**
 * Resource context for functional operations
 */
export interface ResourceContext {
  cache: ResourceCache;
  config: ResourceConfig;
  logger: Logger;
}

/**
 * Create resource context with dependencies
 */
export const createResourceContext = (
  config: ResourceConfig,
  logger: Logger,
  cache?: ResourceCache,
): ResourceContext => ({
  cache:
    cache ?? new MemoryResourceCache(config.cacheConfig?.defaultTtl ?? config.defaultTtl, logger),
  config,
  logger: logger.child({ component: 'ResourceManager' }),
});

/**
 * Get the size of content in bytes
 */
const getContentSize = (content: unknown): number => {
  if (typeof content === 'string') {
    return Buffer.byteLength(content, 'utf8');
  }

  if (Buffer.isBuffer(content)) {
    return content.length;
  }

  // For objects, stringify and measure
  return Buffer.byteLength(JSON.stringify(content), 'utf8');
};

/**
 * Determine MIME type based on content
 */
const determineMimeType = (content: unknown): string => {
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
};

/**
 * Publish a resource to the cache
 */
export const publishResource = async (
  uri: string,
  content: unknown,
  context: ResourceContext,
  ttl?: number,
): Promise<Result<string>> => {
  const { cache, config, logger } = context;

  try {
    // Validate URI format
    const parseResult = UriParser.parse(uri);
    if (!parseResult.ok) {
      return Failure(`Invalid URI: ${parseResult.error}`);
    }

    // Check content size
    const contentSize = getContentSize(content);
    if (contentSize > config.maxResourceSize) {
      return Failure(`Resource too large: ${contentSize} bytes (max: ${config.maxResourceSize})`);
    }

    // Determine MIME type
    const mimeType = determineMimeType(content);

    // Create resource
    const now = new Date();
    const effectiveTtl = ttl ?? config.defaultTtl;

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
    const cacheResult = await cache.set(uri, resource, effectiveTtl);
    if (!cacheResult.ok) {
      return Failure(`Failed to cache resource: ${cacheResult.error}`);
    }

    logger.info(
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
    logger.error({ error, uri }, 'Failed to publish resource');
    return Failure(
      `Failed to publish resource: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

/**
 * Read a resource from the cache
 */
export const readResource = async (
  uri: string,
  context: ResourceContext,
): Promise<Result<Resource | null>> => {
  const { cache, logger } = context;

  try {
    // Validate URI format
    const parseResult = UriParser.parse(uri);
    if (!parseResult.ok) {
      return Failure(`Invalid URI: ${parseResult.error}`);
    }

    // Get from cache
    const cacheResult = await cache.get(uri);
    if (!cacheResult.ok) {
      return Failure(`Failed to read from cache: ${cacheResult.error}`);
    }

    if (!cacheResult.value) {
      logger.debug({ uri }, 'Resource not found');
      return Success(null);
    }

    const resource = cacheResult.value as Resource;

    // Check expiration
    if (resource.expiresAt && new Date() > resource.expiresAt) {
      await cache.delete(uri);
      logger.debug({ uri, expiresAt: resource.expiresAt }, 'Resource expired');
      return Success(null);
    }

    logger.debug({ uri, size: getContentSize(resource.content) }, 'Resource read');
    return Success(resource);
  } catch (error) {
    logger.error({ error, uri }, 'Failed to read resource');
    return Failure(
      `Failed to read resource: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

/**
 * Invalidate resources matching a pattern
 */
export const invalidateResource = async (
  pattern: string,
  context: ResourceContext,
): Promise<Result<void>> => {
  const { cache, logger } = context;

  try {
    // Use optimized invalidation with pattern matching
    const invalidateResult = await cache.invalidate(pattern);

    if (!invalidateResult.ok) {
      return Failure(`Failed to invalidate resources: ${invalidateResult.error}`);
    }

    logger.info({ pattern, invalidatedCount: invalidateResult.value }, 'Resources invalidated');
    return Success(undefined);
  } catch (error) {
    logger.error({ error, pattern }, 'Failed to invalidate resources');
    return Failure(
      `Failed to invalidate resources: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

/**
 * List resources matching a pattern
 */
export const listResources = async (
  pattern: string,
  context: ResourceContext,
): Promise<Result<string[]>> => {
  const { cache, logger } = context;

  try {
    // Use optimized key iteration from cache
    const keys = cache.keys(pattern);

    // Filter keys to only return valid resource URIs
    const uris = keys.filter((key) => {
      // Check if it's a valid resource URI pattern
      return (
        key.startsWith('dockerfile://') ||
        key.startsWith('manifest://') ||
        key.startsWith('scan://') ||
        key.startsWith('analysis://') ||
        key.startsWith('build://') ||
        key.startsWith('session://')
      );
    });

    logger.debug({ pattern, count: uris.length }, 'Listed resources');
    return Success(uris);
  } catch (error) {
    logger.error({ error, pattern }, 'Failed to list resources');
    return Failure(
      `Failed to list resources: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

/**
 * Cleanup expired resources
 */
export const cleanupResources = async (context: ResourceContext): Promise<Result<void>> => {
  const { cache, logger } = context;

  try {
    // The cache handles its own cleanup, but we can trigger it manually
    if (cache instanceof MemoryResourceCache) {
      // Access private cleanup method through type assertion
      const cleanupResult = await (cache as any).cleanupExpired();
      if (!cleanupResult.ok) {
        return Failure(`Cleanup failed: ${cleanupResult.error}`);
      }

      logger.info({ cleanedCount: cleanupResult.value }, 'Resource cleanup completed');
    }

    return Success(undefined);
  } catch (error) {
    logger.error({ error }, 'Failed to cleanup resources');
    return Failure(
      `Failed to cleanup resources: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

/**
 * Get resource metadata without content
 */
export const getResourceMetadata = async (
  uri: string,
  context: ResourceContext,
): Promise<Result<Omit<Resource, 'content'> | null>> => {
  const { logger } = context;

  try {
    const readResult = await readResource(uri, context);
    if (!readResult.ok) {
      return Failure(readResult.error);
    }

    if (!readResult.value) {
      return Success(null);
    }

    const { content: _content, ...metadata } = readResult.value;
    return Success(metadata);
  } catch (error) {
    logger.error({ error, uri }, 'Failed to get resource metadata');
    return Failure(
      `Failed to get resource metadata: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

/**
 * Convenience API with pre-bound context
 */
export const createResourceAPI = (
  context: ResourceContext,
): {
  publish: (uri: string, content: unknown, ttl?: number) => Promise<Result<string>>;
  read: (uri: string) => Promise<Result<Resource | null>>;
  invalidate: (pattern: string) => Promise<Result<void>>;
  list: (pattern: string) => Promise<Result<string[]>>;
  cleanup: () => Promise<Result<void>>;
  getMetadata: (uri: string) => Promise<Result<Omit<Resource, 'content'> | null>>;
} => ({
  publish: (uri: string, content: unknown, ttl?: number) =>
    publishResource(uri, content, context, ttl),
  read: (uri: string) => readResource(uri, context),
  invalidate: (pattern: string) => invalidateResource(pattern, context),
  list: (pattern: string) => listResources(pattern, context),
  cleanup: () => cleanupResources(context),
  getMetadata: (uri: string) => getResourceMetadata(uri, context),
});

// Backward compatibility - Export class as deprecated
/** @deprecated Use functional API instead */
export class McpResourceManager {
  private context: ResourceContext;

  constructor(config: ResourceConfig, logger: Logger, cache?: ResourceCache) {
    this.context = createResourceContext(config, logger, cache);
  }

  async publish(uri: string, content: unknown, ttl?: number): Promise<Result<string>> {
    return publishResource(uri, content, this.context, ttl);
  }

  async read(uri: string): Promise<Result<Resource | null>> {
    return readResource(uri, this.context);
  }

  async invalidate(pattern: string): Promise<Result<void>> {
    return invalidateResource(pattern, this.context);
  }

  async list(pattern: string): Promise<Result<string[]>> {
    return listResources(pattern, this.context);
  }

  async cleanup(): Promise<Result<void>> {
    return cleanupResources(this.context);
  }

  async getMetadata(uri: string): Promise<Result<Omit<Resource, 'content'> | null>> {
    return getResourceMetadata(uri, this.context);
  }
}
