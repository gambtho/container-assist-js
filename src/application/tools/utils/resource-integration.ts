/**
 * Resource Integration Utilities - Team Delta Implementation
 *
 * Provides utilities for publishing and managing large resources in MCP tools,
 * keeping response payloads under 5MB while maintaining full functionality.
 */

import { createHash } from 'node:crypto';
import type { Logger } from 'pino';
import type { ResourceReference, ResourceConfig, ResourcePublisher } from '../interfaces';
import { Success, Failure, type Result } from '../../../types/core/index';

/**
 * Default resource configuration
 */
export const DEFAULT_RESOURCE_CONFIG: ResourceConfig = {
  maxInlineSize: 1024 * 1024, // 1MB max inline
  defaultTTL: 3600, // 1 hour default TTL
  supportedMimeTypes: [
    'application/json',
    'text/plain',
    'text/yaml',
    'text/dockerfile',
    'text/x-log',
    'application/zip',
    'text/csv',
  ],
  enableCompression: true,
};

/**
 * In-memory resource store (will be replaced by Team Alpha's resource manager)
 * This is a mock implementation for Team Delta's independent development
 */
class MockResourceStore {
  private resources = new Map<
    string,
    {
      content: unknown;
      mimeType: string;
      createdAt: Date;
      ttl: number;
      metadata?: Record<string, unknown>;
    }
  >();

  async store(
    uri: string,
    content: unknown,
    mimeType: string,
    ttl: number,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    this.resources.set(uri, {
      content,
      mimeType,
      createdAt: new Date(),
      ttl,
      metadata: metadata || undefined,
    });
  }

  async retrieve(
    uri: string,
  ): Promise<{ content: unknown; mimeType: string; metadata?: Record<string, unknown> } | null> {
    const resource = this.resources.get(uri);
    if (!resource) return null;

    // Check TTL
    const now = new Date();
    const expiresAt = new Date(resource.createdAt.getTime() + resource.ttl * 1000);
    if (now > expiresAt) {
      this.resources.delete(uri);
      return null;
    }

    return {
      content: resource.content,
      mimeType: resource.mimeType,
      metadata: resource.metadata || undefined,
    };
  }

  async cleanup(pattern?: string): Promise<void> {
    if (!pattern) {
      this.resources.clear();
      return;
    }

    const regex = new RegExp(pattern);
    for (const [uri] of this.resources) {
      if (regex.test(uri)) {
        this.resources.delete(uri);
      }
    }
  }

  size(): number {
    return this.resources.size;
  }
}

/**
 * Resource publisher implementation
 */
export class ResourcePublisherImpl implements ResourcePublisher {
  private store = new MockResourceStore();
  private config: ResourceConfig;

  constructor(
    private logger: Logger,
    private sessionId: string,
    config?: Partial<ResourceConfig>,
  ) {
    this.config = { ...DEFAULT_RESOURCE_CONFIG, ...config };
  }

  /**
   * Publish data as a resource, with automatic size-based routing
   */
  async publish<T>(data: T, mimeType: string, ttl?: number): Promise<ResourceReference> {
    const serialized = this.serialize(data, mimeType);
    const size = Buffer.byteLength(serialized);
    const resourceTTL = ttl ?? this.config.defaultTTL;

    // Generate URI
    const hash = createHash('sha256').update(serialized).digest('hex').slice(0, 16);
    const uri = `mcp://${this.sessionId}/resources/${hash}`;

    // Store the resource
    const metadata = {
      originalSize: size,
      compressed: false, // TODO: Implement compression
      publishedAt: new Date().toISOString(),
    };
    await this.store.store(uri, data, mimeType, resourceTTL, metadata);

    this.logger.debug({ uri, size, mimeType }, 'Published resource');

    return {
      uri,
      mimeType,
      description: this.generateDescription(data, mimeType),
      size,
      ttl: resourceTTL,
      metadata: {
        sessionId: this.sessionId,
        publishedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Publish large data with optimizations
   */
  async publishLarge<T>(data: T, mimeType: string): Promise<ResourceReference> {
    return this.publish(data, mimeType, this.config.defaultTTL * 2); // Longer TTL for large resources
  }

  /**
   * Create a reference without storing (for external URIs)
   */
  createReference(
    uri: string,
    description: string,
    metadata?: Record<string, unknown>,
  ): ResourceReference {
    return {
      uri,
      mimeType: 'application/octet-stream',
      description,
      metadata: {
        sessionId: this.sessionId,
        external: true,
        ...metadata,
      },
    };
  }

  /**
   * Cleanup resources matching pattern
   */
  async cleanup(pattern?: string): Promise<void> {
    await this.store.cleanup(pattern);
    this.logger.debug({ pattern }, 'Cleaned up resources');
  }

  /**
   * Get resource statistics
   */
  getStats(): { totalResources: number; sessionId: string } {
    return {
      totalResources: this.store.size(),
      sessionId: this.sessionId,
    };
  }

  private serialize(data: unknown, mimeType: string): string {
    switch (mimeType) {
      case 'application/json':
        return JSON.stringify(data, null, 2);
      case 'text/plain':
      case 'text/dockerfile':
      case 'text/yaml':
      case 'text/x-log':
        return String(data);
      default:
        return JSON.stringify(data);
    }
  }

  private generateDescription(data: unknown, mimeType: string): string {
    if (mimeType === 'application/json') {
      if (Array.isArray(data)) {
        return `JSON array with ${data.length} items`;
      }
      if (typeof data === 'object' && data !== null) {
        const keys = Object.keys(data);
        return `JSON object with ${keys.length} properties`;
      }
      return 'JSON data';
    }

    if (mimeType === 'text/dockerfile') {
      const lines = String(data).split('\n').length;
      return `Dockerfile with ${lines} lines`;
    }

    if (mimeType === 'text/yaml') {
      return 'YAML configuration';
    }

    if (mimeType === 'text/x-log') {
      const lines = String(data).split('\n').length;
      return `Log file with ${lines} lines`;
    }

    return 'Binary or text data';
  }
}

/**
 * Resource utilities for tools
 */
export class ResourceUtils {
  /**
   * Determine if data should be inlined or published as resource
   */
  static shouldInline(
    data: unknown,
    maxInlineSize: number = DEFAULT_RESOURCE_CONFIG.maxInlineSize,
  ): boolean {
    const serialized = typeof data === 'string' ? data : JSON.stringify(data);
    return Buffer.byteLength(serialized) <= maxInlineSize;
  }

  /**
   * Create an MCP tool response with resource handling
   */
  static createMCPResponse(
    data: unknown,
    resourcePublisher?: ResourcePublisher,
    options?: {
      mimeType?: string;
      forceInline?: boolean;
      description?: string;
    },
  ): Promise<{
    content: Array<{
      type: 'text' | 'resource';
      text?: string;
      resource?: ResourceReference;
    }>;
  }> {
    return this.createMCPResponseImpl(data, resourcePublisher, options);
  }

  private static async createMCPResponseImpl(
    data: unknown,
    resourcePublisher?: ResourcePublisher,
    options?: {
      mimeType?: string;
      forceInline?: boolean;
      description?: string;
    },
  ): Promise<{
    content: Array<{
      type: 'text' | 'resource';
      text?: string;
      resource?: ResourceReference;
    }>;
  }> {
    const mimeType = options?.mimeType ?? 'application/json';
    const forceInline = options?.forceInline ?? false;

    if (forceInline || !resourcePublisher || this.shouldInline(data)) {
      return {
        content: [
          {
            type: 'text',
            text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    // Publish as resource
    const resourceRef = await resourcePublisher.publish(data, mimeType);

    return {
      content: [
        {
          type: 'resource',
          resource: {
            uri: resourceRef.uri,
            mimeType: resourceRef.mimeType,
            description: options?.description ?? resourceRef.description,
          },
        },
      ],
    };
  }

  /**
   * Create a hybrid response with both inline summary and resource details
   */
  static async createHybridResponse(
    summary: string,
    detailData: unknown,
    resourcePublisher: ResourcePublisher,
    options?: {
      mimeType?: string;
      resourceDescription?: string;
    },
  ): Promise<{
    content: Array<{
      type: 'text' | 'resource';
      text?: string;
      resource?: ResourceReference;
    }>;
  }> {
    const mimeType = options?.mimeType ?? 'application/json';
    const resourceRef = await resourcePublisher.publish(detailData, mimeType);

    return {
      content: [
        {
          type: 'text',
          text: summary,
        },
        {
          type: 'resource',
          resource: {
            uri: resourceRef.uri,
            mimeType: resourceRef.mimeType,
            description: options?.resourceDescription ?? resourceRef.description,
          },
        },
      ],
    };
  }
}

/**
 * Resource validation utilities
 */
export class ResourceValidator {
  static validateMimeType(mimeType: string, supportedTypes: string[]): Result<void> {
    if (!supportedTypes.includes(mimeType)) {
      return Failure(`Unsupported MIME type: ${mimeType}. Supported: ${supportedTypes.join(', ')}`);
    }
    return Success(undefined);
  }

  static validateResourceSize(size: number, maxSize: number): Result<void> {
    if (size > maxSize) {
      return Failure(`Resource size ${size} bytes exceeds maximum ${maxSize} bytes`);
    }
    return Success(undefined);
  }

  static validateTTL(ttl: number): Result<void> {
    if (ttl <= 0 || ttl > 86400 * 7) {
      // Max 7 days
      return Failure(`Invalid TTL: ${ttl}. Must be between 1 and 604800 seconds`);
    }
    return Success(undefined);
  }

  static validateURI(uri: string): Result<void> {
    try {
      new URL(uri);
      return Success(undefined);
    } catch {
      return Failure(`Invalid URI format: ${uri}`);
    }
  }
}

/**
 * Factory for creating resource publishers
 */
export function createResourcePublisher(
  logger: Logger,
  sessionId: string,
  config?: Partial<ResourceConfig>,
): ResourcePublisher {
  return new ResourcePublisherImpl(logger, sessionId, config);
}
