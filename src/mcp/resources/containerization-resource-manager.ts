/**
 * Enhanced Resource Manager with MCP SDK Integration
 *
 * Provides dynamic resource discovery and management using MCP SDK resource handlers.
 * Extends the existing resource manager with MCP-native capabilities.
 */

import type { Logger } from 'pino';
import {
  type Resource as MCPResource,
  type ListResourcesResult,
  type ReadResourceResult,
} from '@modelcontextprotocol/sdk/types.js';
import { Result, Success, Failure } from '../../types/core/index.js';
import { McpResourceManager } from './manager.js';
import type { Resource } from './types.js';

/**
 * Enhanced resource types for MCP integration
 */
export interface EnhancedResource extends Resource {
  /** MCP-native resource properties */
  name: string;
  description?: string | undefined;
  annotations?:
    | {
        audience?: string[];
        priority?: number;
      }
    | undefined;
}

/**
 * Resource categories supported by the enhanced manager
 */
export type ResourceCategory =
  | 'dockerfile'
  | 'k8s-manifest'
  | 'scan-result'
  | 'build-artifact'
  | 'deployment-status'
  | 'session-data';

/**
 * Enhanced Resource Manager with MCP SDK integration
 */
export class EnhancedResourceManager {
  private baseManager: McpResourceManager;
  private resourceIndex: Map<string, EnhancedResource> = new Map();
  private categoryIndex: Map<ResourceCategory, Set<string>> = new Map();
  private logger: Logger;

  constructor(baseManager: McpResourceManager, logger: Logger) {
    this.baseManager = baseManager;
    this.logger = logger.child({ component: 'EnhancedResourceManager' });

    // Initialize category indices
    this.initializeCategoryIndices();
  }

  /**
   * Initialize category indices for efficient resource discovery
   */
  private initializeCategoryIndices(): void {
    const categories: ResourceCategory[] = [
      'dockerfile',
      'k8s-manifest',
      'scan-result',
      'build-artifact',
      'deployment-status',
      'session-data',
    ];

    categories.forEach((category) => {
      this.categoryIndex.set(category, new Set());
    });
  }

  /**
   * Publish an enhanced resource with MCP metadata
   */
  async publishEnhanced(
    uri: string,
    content: unknown,
    metadata: {
      name: string;
      description?: string;
      category: ResourceCategory;
      annotations?: {
        audience?: string[];
        priority?: number;
      };
    },
    ttl?: number,
  ): Promise<Result<string>> {
    try {
      // Publish to base manager first
      const publishResult = await this.baseManager.publish(uri, content, ttl);
      if (!publishResult.ok) {
        return publishResult;
      }

      // Create enhanced resource
      const baseResource = await this.baseManager.read(uri);
      if (!baseResource.ok || !baseResource.value) {
        return Failure('Failed to read published resource');
      }

      const enhancedResource: EnhancedResource = {
        ...baseResource.value,
        name: metadata.name,
        description: metadata.description,
        annotations: metadata.annotations,
      };

      // Update indices
      this.resourceIndex.set(uri, enhancedResource);
      this.categoryIndex.get(metadata.category)?.add(uri);

      this.logger.info(
        {
          uri,
          name: metadata.name,
          category: metadata.category,
          audience: metadata.annotations?.audience,
          priority: metadata.annotations?.priority,
        },
        'Enhanced resource published',
      );

      return Success(uri);
    } catch (error) {
      this.logger.error({ error, uri }, 'Failed to publish enhanced resource');
      return Failure(
        `Failed to publish enhanced resource: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * MCP-native resource listing handler
   */
  async listResources(category?: ResourceCategory): Promise<Result<ListResourcesResult>> {
    try {
      const resources: MCPResource[] = [];

      // Get resources from specific category or all categories
      const targetUris = category
        ? Array.from(this.categoryIndex.get(category) || [])
        : Array.from(this.resourceIndex.keys());

      for (const uri of targetUris) {
        const resource = this.resourceIndex.get(uri);
        if (!resource) continue;

        // Check if resource is still valid
        const isValid = await this.isResourceValid(uri);
        if (!isValid) {
          this.cleanupResource(uri);
          continue;
        }

        resources.push({
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType,
          annotations: resource.annotations,
        });
      }

      this.logger.debug(
        {
          category,
          resourceCount: resources.length,
          totalIndexed: this.resourceIndex.size,
        },
        'Listed resources',
      );

      return Success({ resources });
    } catch (error) {
      this.logger.error({ error, category }, 'Failed to list resources');
      return Failure(
        `Failed to list resources: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * MCP-native resource reading handler
   */
  async readResource(uri: string): Promise<Result<ReadResourceResult>> {
    try {
      const resource = await this.baseManager.read(uri);
      if (!resource.ok) {
        return Failure(resource.error);
      }

      if (!resource.value) {
        return Failure('Resource not found');
      }

      // Convert to MCP format
      const mcpResource: ReadResourceResult = {
        contents: [
          {
            uri: resource.value.uri,
            mimeType: resource.value.mimeType,
            text:
              typeof resource.value.content === 'string'
                ? resource.value.content
                : JSON.stringify(resource.value.content, null, 2),
          },
        ],
      };

      this.logger.debug(
        {
          uri,
          mimeType: resource.value.mimeType,
          size: this.getContentSize(resource.value.content),
        },
        'Resource read',
      );

      return Success(mcpResource);
    } catch (error) {
      this.logger.error({ error, uri }, 'Failed to read resource');
      return Failure(
        `Failed to read resource: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get resources by category with filtering
   */
  async getResourcesByCategory(
    category: ResourceCategory,
    filters?: {
      audience?: string;
      priority?: number;
      namePattern?: string;
    },
  ): Promise<Result<EnhancedResource[]>> {
    try {
      const categoryUris = this.categoryIndex.get(category);
      if (!categoryUris) {
        return Success([]);
      }

      const resources: EnhancedResource[] = [];

      for (const uri of categoryUris) {
        const resource = this.resourceIndex.get(uri);
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

          if (filters.namePattern && !new RegExp(filters.namePattern).test(resource.name)) {
            continue;
          }
        }

        // Verify resource is still valid
        const isValid = await this.isResourceValid(uri);
        if (!isValid) {
          this.cleanupResource(uri);
          continue;
        }

        resources.push(resource);
      }

      // Sort by priority (highest first)
      resources.sort((a, b) => (b.annotations?.priority || 0) - (a.annotations?.priority || 0));

      this.logger.debug(
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
      this.logger.error({ error, category, filters }, 'Failed to get resources by category');
      return Failure(
        `Failed to get resources by category: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Search resources by name or content
   */
  async searchResources(query: {
    name?: string;
    content?: string;
    category?: ResourceCategory;
    tags?: string[];
  }): Promise<Result<EnhancedResource[]>> {
    try {
      const matchingResources: EnhancedResource[] = [];

      // Get candidate URIs
      const candidateUris = query.category
        ? Array.from(this.categoryIndex.get(query.category) || [])
        : Array.from(this.resourceIndex.keys());

      for (const uri of candidateUris) {
        const resource = this.resourceIndex.get(uri);
        if (!resource) continue;

        let matches = true;

        // Name matching
        if (query.name && !new RegExp(query.name, 'i').test(resource.name)) {
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

        if (matches) {
          // Verify resource is still valid
          const isValid = await this.isResourceValid(uri);
          if (isValid) {
            matchingResources.push(resource);
          } else {
            this.cleanupResource(uri);
          }
        }
      }

      // Sort by relevance (priority first, then creation time)
      matchingResources.sort((a, b) => {
        const priorityDiff = (b.annotations?.priority || 0) - (a.annotations?.priority || 0);
        if (priorityDiff !== 0) return priorityDiff;

        return b.createdAt.getTime() - a.createdAt.getTime();
      });

      this.logger.debug(
        {
          query,
          resultCount: matchingResources.length,
          searchedCount: candidateUris.length,
        },
        'Searched resources',
      );

      return Success(matchingResources);
    } catch (error) {
      this.logger.error({ error, query }, 'Failed to search resources');
      return Failure(
        `Failed to search resources: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get resource statistics
   */
  getStats(): {
    total: number;
    byCategory: Record<ResourceCategory, number>;
    memoryUsage: number;
  } {
    const byCategory = {} as Record<ResourceCategory, number>;

    for (const [category, uris] of this.categoryIndex.entries()) {
      byCategory[category] = uris.size;
    }

    return {
      total: this.resourceIndex.size,
      byCategory,
      memoryUsage: this.calculateMemoryUsage(),
    };
  }

  /**
   * Cleanup expired and invalid resources
   */
  async performMaintenance(): Promise<Result<{ cleaned: number; errors: number }>> {
    try {
      let cleaned = 0;
      let errors = 0;

      const urisToCheck = Array.from(this.resourceIndex.keys());

      for (const uri of urisToCheck) {
        try {
          const isValid = await this.isResourceValid(uri);
          if (!isValid) {
            this.cleanupResource(uri);
            cleaned++;
          }
        } catch (error) {
          this.logger.warn({ error, uri }, 'Error checking resource validity');
          errors++;
        }
      }

      // Cleanup base manager
      const baseCleanupResult = await this.baseManager.cleanup();
      if (!baseCleanupResult.ok) {
        this.logger.warn({ error: baseCleanupResult.error }, 'Base manager cleanup failed');
        errors++;
      }

      this.logger.info(
        { cleaned, errors, remaining: this.resourceIndex.size },
        'Maintenance completed',
      );

      return Success({ cleaned, errors });
    } catch (error) {
      this.logger.error({ error }, 'Failed to perform maintenance');
      return Failure(
        `Failed to perform maintenance: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Check if a resource is still valid
   */
  private async isResourceValid(uri: string): Promise<boolean> {
    try {
      const result = await this.baseManager.read(uri);
      return result.ok && result.value !== null;
    } catch {
      return false;
    }
  }

  /**
   * Remove resource from indices
   */
  private cleanupResource(uri: string): void {
    const resource = this.resourceIndex.get(uri);
    if (resource) {
      // Remove from category index
      for (const [category, uris] of this.categoryIndex.entries()) {
        if (uris.has(uri)) {
          uris.delete(uri);
          this.logger.debug({ uri, category }, 'Removed resource from category index');
        }
      }
    }

    this.resourceIndex.delete(uri);
  }

  /**
   * Calculate approximate memory usage
   */
  private calculateMemoryUsage(): number {
    let size = 0;
    for (const resource of this.resourceIndex.values()) {
      size += this.getContentSize(resource);
    }
    return size;
  }

  /**
   * Get content size in bytes
   */
  private getContentSize(content: unknown): number {
    if (typeof content === 'string') {
      return Buffer.byteLength(content, 'utf8');
    }

    if (Buffer.isBuffer(content)) {
      return content.length;
    }

    return Buffer.byteLength(JSON.stringify(content), 'utf8');
  }
}
