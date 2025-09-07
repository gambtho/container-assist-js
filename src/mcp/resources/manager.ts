import type { Logger } from 'pino';
import {
  type ListResourcesResult,
  type ReadResourceResult,
  type Resource as MCPResource,
} from '@modelcontextprotocol/sdk/types.js';
import { Result, Success, Failure } from '../../types/core.js';
import type { Resource, ResourceCache, ResourceCategory } from './types.js';
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
  // Category indexing for efficient resource discovery
  categoryIndex?: Map<ResourceCategory, Set<string>>;
  // Resource metadata index for enhanced features
  resourceIndex?: Map<string, Resource>;
}

/**
 * Create resource context with dependencies
 */
export const createResourceContext = (
  config: ResourceConfig,
  logger: Logger,
  cache?: ResourceCache,
): ResourceContext => {
  const context: ResourceContext = {
    cache:
      cache ?? new MemoryResourceCache(config.cacheConfig?.defaultTtl ?? config.defaultTtl, logger),
    config,
    logger: logger.child({ component: 'ResourceManager' }),
    categoryIndex: new Map(),
    resourceIndex: new Map(),
  };

  // Initialize category indices
  const categories: ResourceCategory[] = [
    'dockerfile',
    'k8s-manifest',
    'scan-result',
    'build-artifact',
    'deployment-status',
    'session-data',
  ];
  categories.forEach((category) => {
    context.categoryIndex!.set(category, new Set());
  });

  return context;
};

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
 * Enhanced metadata for publishing resources
 */
export interface PublishMetadata {
  name?: string;
  description?: string;
  category?: ResourceCategory;
  annotations?: {
    audience?: string[];
    priority?: number;
    tags?: string[];
  };
}

/**
 * Publish a resource to the cache
 */
export const publishResource = async (
  uri: string,
  content: unknown,
  context: ResourceContext,
  ttl?: number,
  metadata?: PublishMetadata,
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

    // Create resource with enhanced metadata
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
        ...(metadata?.category && { category: metadata.category }),
      },
      ...(metadata?.name && { name: metadata.name ?? uri.split('://').pop() ?? uri }),
      ...(metadata?.description && { description: metadata.description }),
      ...(metadata?.annotations && { annotations: metadata.annotations }),
    };

    if (effectiveTtl > 0) {
      resource.expiresAt = new Date(now.getTime() + effectiveTtl);
    }

    // Store in cache
    const cacheResult = await cache.set(uri, resource, effectiveTtl);
    if (!cacheResult.ok) {
      return Failure(`Failed to cache resource: ${cacheResult.error}`);
    }

    // Update indices if available
    if (context.resourceIndex) {
      context.resourceIndex.set(uri, resource);
    }
    if (context.categoryIndex && metadata?.category) {
      context.categoryIndex.get(metadata.category)?.add(uri);
    }

    logger.info(
      {
        uri,
        contentSize,
        mimeType,
        ttl: effectiveTtl,
        expiresAt: resource.expiresAt,
        name: metadata?.name,
        category: metadata?.category,
        priority: metadata?.annotations?.priority,
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
  const { cache, logger, resourceIndex, categoryIndex } = context;

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

    // Clean up indices
    if (resourceIndex && categoryIndex) {
      for (const [uri, resource] of resourceIndex.entries()) {
        if (resource.expiresAt && new Date() > resource.expiresAt) {
          resourceIndex.delete(uri);
          // Remove from category index
          if (resource.metadata?.category) {
            categoryIndex.get(resource.metadata.category)?.delete(uri);
          }
        }
      }
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
 * Get resources by category with filtering
 */
export const getResourcesByCategory = async (
  category: ResourceCategory,
  context: ResourceContext,
  filters?: {
    audience?: string;
    priority?: number;
    namePattern?: string;
  },
): Promise<Result<Resource[]>> => {
  const { logger, categoryIndex, resourceIndex } = context;

  try {
    if (!categoryIndex || !resourceIndex) {
      // Fallback to listing all resources with pattern
      const listResult = await listResources(`*://*`, context);
      if (!listResult.ok) {
        return Failure(listResult.error);
      }

      const resources: Resource[] = [];
      for (const uri of listResult.value) {
        const resourceResult = await readResource(uri, context);
        if (resourceResult.ok && resourceResult.value) {
          const resource = resourceResult.value;
          if (resource.metadata?.category === category) {
            resources.push(resource);
          }
        }
      }
      return Success(resources);
    }

    const categoryUris = categoryIndex.get(category);
    if (!categoryUris) {
      return Success([]);
    }

    const resources: Resource[] = [];

    for (const uri of categoryUris) {
      const resource = resourceIndex.get(uri);
      if (!resource) continue;

      // Apply filters
      if (filters) {
        if (
          filters.audience &&
          (!resource.annotations?.audience ||
            !resource.annotations.audience.includes(filters.audience))
        ) {
          continue;
        }

        if (
          filters.priority !== undefined &&
          (resource.annotations?.priority || 0) < filters.priority
        ) {
          continue;
        }

        if (
          filters.namePattern &&
          resource.name &&
          !new RegExp(filters.namePattern).test(resource.name)
        ) {
          continue;
        }
      }

      // Check expiration
      if (resource.expiresAt && new Date() > resource.expiresAt) {
        continue;
      }

      resources.push(resource);
    }

    // Sort by priority (highest first)
    resources.sort((a, b) => (b.annotations?.priority || 0) - (a.annotations?.priority || 0));

    logger.debug(
      {
        category,
        filters,
        resultCount: resources.length,
        totalInCategory: categoryUris.size,
      },
      'Filtered resources by category',
    );

    return Success(resources);
  } catch (error) {
    logger.error({ error, category, filters }, 'Failed to get resources by category');
    return Failure(
      `Failed to get resources by category: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

/**
 * Search resources by name or content
 */
export const searchResources = async (
  query: {
    name?: string;
    content?: string;
    category?: ResourceCategory;
    tags?: string[];
  },
  context: ResourceContext,
): Promise<Result<Resource[]>> => {
  const { logger, categoryIndex, resourceIndex } = context;

  try {
    const matchingResources: Resource[] = [];

    // Get candidate URIs
    let candidateUris: string[];
    if (resourceIndex) {
      candidateUris =
        query.category && categoryIndex
          ? Array.from(categoryIndex.get(query.category) || [])
          : Array.from(resourceIndex.keys());
    } else {
      // Fallback to listing all resources
      const listResult = await listResources('*://*', context);
      if (!listResult.ok) {
        return Failure(listResult.error);
      }
      candidateUris = listResult.value;
    }

    for (const uri of candidateUris) {
      let resource: Resource | null;
      if (resourceIndex) {
        resource = resourceIndex.get(uri) || null;
      } else {
        const resourceResult = await readResource(uri, context);
        if (!resourceResult.ok || !resourceResult.value) continue;
        resource = resourceResult.value;
      }

      if (!resource) continue;

      let matches = true;

      // Name matching
      if (query.name && resource.name && !new RegExp(query.name, 'i').test(resource.name)) {
        matches = false;
      }

      // Content matching (expensive - only do if needed)
      if (matches && query.content) {
        const contentStr =
          typeof resource.content === 'string'
            ? resource.content
            : JSON.stringify(resource.content);

        if (!new RegExp(query.content, 'i').test(contentStr)) {
          matches = false;
        }
      }

      // Tag matching
      if (matches && query.tags && query.tags.length > 0) {
        if (
          !resource.annotations?.tags ||
          !query.tags.every((tag) => resource.annotations?.tags?.includes(tag))
        ) {
          matches = false;
        }
      }

      if (matches) {
        // Check expiration
        if (resource.expiresAt && new Date() > resource.expiresAt) {
          continue;
        }
        matchingResources.push(resource);
      }
    }

    // Sort by relevance (priority first, then creation time)
    matchingResources.sort((a, b) => {
      const priorityDiff = (b.annotations?.priority || 0) - (a.annotations?.priority || 0);
      if (priorityDiff !== 0) return priorityDiff;

      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    logger.debug(
      {
        query,
        resultCount: matchingResources.length,
        searchedCount: candidateUris.length,
      },
      'Searched resources',
    );

    return Success(matchingResources);
  } catch (error) {
    logger.error({ error, query }, 'Failed to search resources');
    return Failure(
      `Failed to search resources: ${error instanceof Error ? error.message : String(error)}`,
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
 * Convert internal resource to SDK format for listing
 */
export const convertResourceToSDK = (resource: Resource): MCPResource => ({
  uri: resource.uri,
  name: resource.name || resource.uri.split('://').pop() || resource.uri,
  mimeType: resource.mimeType,
  description: resource.description,
  annotations: resource.annotations,
});

/**
 * SDK-compatible list resources handler
 */
export const listResourcesSDK = async (
  context: ResourceContext,
  cursor?: string,
  category?: ResourceCategory,
): Promise<Result<ListResourcesResult>> => {
  try {
    const resources: MCPResource[] = [];

    // Use optimized index-based listing if available
    if (context.resourceIndex) {
      const targetUris =
        category && context.categoryIndex
          ? Array.from(context.categoryIndex.get(category) || [])
          : Array.from(context.resourceIndex.keys());

      for (const uri of targetUris) {
        const resource = context.resourceIndex.get(uri);
        if (!resource) continue;

        // Check expiration
        if (resource.expiresAt && new Date() > resource.expiresAt) {
          continue;
        }

        resources.push(convertResourceToSDK(resource));
      }
    } else {
      // Fallback to cache-based listing
      const listResult = await listResources('*', context);
      if (!listResult.ok) {
        return Failure(listResult.error);
      }

      for (const uri of listResult.value) {
        const resourceResult = await readResource(uri, context);
        if (resourceResult.ok && resourceResult.value) {
          if (!category || resourceResult.value.metadata?.category === category) {
            resources.push(convertResourceToSDK(resourceResult.value));
          }
        }
      }
    }

    // Sort by priority (highest first), then by creation time
    resources.sort((a, b) => {
      const aPriority = (a.annotations as any)?.priority || 0;
      const bPriority = (b.annotations as any)?.priority || 0;
      const priorityDiff = bPriority - aPriority;
      if (priorityDiff !== 0) return priorityDiff;
      return 0;
    });

    // Simple pagination
    const limit = 50;
    const startIndex = cursor ? parseInt(cursor, 10) : 0;
    const endIndex = startIndex + limit;
    const paginatedResources = resources.slice(startIndex, endIndex);

    const result: ListResourcesResult = {
      resources: paginatedResources,
      nextCursor: endIndex < resources.length ? endIndex.toString() : undefined,
    };

    context.logger.debug(
      {
        totalResources: resources.length,
        returnedResources: paginatedResources.length,
        category,
        cursor,
        nextCursor: result.nextCursor,
      },
      'Listed resources using SDK format',
    );

    return Success(result);
  } catch (error) {
    context.logger.error({ error, cursor, category }, 'Failed to list resources in SDK format');
    return Failure(
      `Failed to list resources: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

/**
 * SDK-compatible read resource handler
 */
export const readResourceSDK = async (
  uri: string,
  context: ResourceContext,
): Promise<Result<ReadResourceResult>> => {
  try {
    const resourceResult = await readResource(uri, context);
    if (!resourceResult.ok) {
      return Failure(resourceResult.error);
    }

    if (!resourceResult.value) {
      return Failure('Resource not found');
    }

    const resource = resourceResult.value;

    // Convert content to text format for SDK
    let textContent: string;
    if (typeof resource.content === 'string') {
      textContent = resource.content;
    } else if (Buffer.isBuffer(resource.content)) {
      textContent = resource.content.toString('base64');
    } else {
      textContent = JSON.stringify(resource.content, null, 2);
    }

    const result: ReadResourceResult = {
      contents: [
        {
          uri: resource.uri,
          mimeType: resource.mimeType,
          text: textContent,
        },
      ],
    };

    context.logger.debug(
      {
        uri,
        mimeType: resource.mimeType,
        contentLength: textContent.length,
      },
      'Read resource using SDK format',
    );

    return Success(result);
  } catch (error) {
    context.logger.error({ error, uri }, 'Failed to read resource in SDK format');
    return Failure(
      `Failed to read resource: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

/**
 * Convenience API with pre-bound context (Legacy - for backward compatibility)
 * @deprecated Use createSDKResourceManager instead
 */
export const createResourceAPI = (
  context: ResourceContext,
): {
  publish: (
    uri: string,
    content: unknown,
    ttl?: number,
    metadata?: PublishMetadata,
  ) => Promise<Result<string>>;
  read: (uri: string) => Promise<Result<Resource | null>>;
  invalidate: (pattern: string) => Promise<Result<void>>;
  list: (pattern: string) => Promise<Result<string[]>>;
  cleanup: () => Promise<Result<void>>;
  getMetadata: (uri: string) => Promise<Result<Omit<Resource, 'content'> | null>>;
  getByCategory: (category: ResourceCategory, filters?: any) => Promise<Result<Resource[]>>;
  search: (query: any) => Promise<Result<Resource[]>>;
} => ({
  publish: (uri: string, content: unknown, ttl?: number, metadata?: PublishMetadata) =>
    publishResource(uri, content, context, ttl, metadata),
  read: (uri: string) => readResource(uri, context),
  invalidate: (pattern: string) => invalidateResource(pattern, context),
  list: (pattern: string) => listResources(pattern, context),
  cleanup: () => cleanupResources(context),
  getMetadata: (uri: string) => getResourceMetadata(uri, context),
  getByCategory: (category: ResourceCategory, filters?: any) =>
    getResourcesByCategory(category, context, filters),
  search: (query: any) => searchResources(query, context),
});

/**
 * SDK-native resource manager interface
 */
export interface SDKResourceManager {
  listResources(cursor?: string, category?: ResourceCategory): Promise<Result<ListResourcesResult>>;
  readResource(uri: string): Promise<Result<ReadResourceResult>>;
  publishResource(
    uri: string,
    content: unknown,
    ttl?: number,
    metadata?: PublishMetadata,
  ): Promise<Result<string>>;
  publishEnhanced(
    uri: string,
    content: unknown,
    metadata: PublishMetadata & { category: ResourceCategory },
    ttl?: number,
  ): Promise<Result<string>>;
  invalidateResource(pattern: string): Promise<Result<void>>;
  cleanup(): Promise<Result<void>>;
  getResourcesByCategory(category: ResourceCategory, filters?: any): Promise<Result<Resource[]>>;
  searchResources(query: any): Promise<Result<Resource[]>>;
  getStats(): { total: number; byCategory: Record<ResourceCategory, number>; memoryUsage: number };
}

/**
 * Create SDK-native resource manager with bound context
 */
export const createSDKResourceManager = (context: ResourceContext): SDKResourceManager => ({
  listResources: (cursor?: string, category?: ResourceCategory) =>
    listResourcesSDK(context, cursor, category),
  readResource: (uri: string) => readResourceSDK(uri, context),
  publishResource: (uri: string, content: unknown, ttl?: number, metadata?: PublishMetadata) =>
    publishResource(uri, content, context, ttl, metadata),
  publishEnhanced: (
    uri: string,
    content: unknown,
    metadata: PublishMetadata & { category: ResourceCategory },
    ttl?: number,
  ) => publishResource(uri, content, context, ttl, metadata),
  invalidateResource: (pattern: string) => invalidateResource(pattern, context),
  cleanup: () => cleanupResources(context),
  getResourcesByCategory: (category: ResourceCategory, filters?: any) =>
    getResourcesByCategory(category, context, filters),
  searchResources: (query: any) => searchResources(query, context),
  getStats: () => {
    const byCategory = {} as Record<ResourceCategory, number>;
    if (context.categoryIndex) {
      for (const [category, uris] of context.categoryIndex.entries()) {
        byCategory[category] = uris.size;
      }
    }
    return {
      total: context.resourceIndex?.size || 0,
      byCategory,
      memoryUsage: calculateTotalMemoryUsage(context),
    };
  },
});

/**
 * Calculate total memory usage of all resources
 */
const calculateTotalMemoryUsage = (context: ResourceContext): number => {
  let totalSize = 0;
  if (context.resourceIndex) {
    for (const resource of context.resourceIndex.values()) {
      totalSize += getContentSize(resource.content);
    }
  }
  return totalSize;
};
