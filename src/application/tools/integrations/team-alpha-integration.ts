/**
 * Team Alpha Integration - Team Delta Implementation
 *
 * Integration adapter between Team Delta's enhanced tools and Team Alpha's
 * resource management components, providing seamless resource publishing
 * and retrieval.
 */

import type { Logger } from 'pino';
import type { ResourcePublisher, ResourceReference } from '../interfaces';
import type { ResourceManager } from '../../../mcp/resources/types';
import { McpResourceManager } from '../../../mcp/resources/manager';
import { createHash } from 'node:crypto';
import { Success, Failure, type Result } from '../../../types/core/index';

/**
 * Configuration for Team Alpha integration
 */
export interface TeamAlphaIntegrationConfig {
  defaultTTL: number;
  maxResourceSize: number;
  sessionId: string;
  enableCompression?: boolean;
  supportedMimeTypes?: string[];
}

/**
 * Resource publisher that integrates with Team Alpha's MCP resource manager
 */
export class TeamAlphaResourcePublisher implements ResourcePublisher {
  private resourceManager: ResourceManager;

  constructor(
    private logger: Logger,
    private config: TeamAlphaIntegrationConfig,
    resourceManager?: ResourceManager,
  ) {
    // Use provided resource manager or create default one
    this.resourceManager = resourceManager ?? new McpResourceManager(
      {
        defaultTtl: config.defaultTTL * 1000, // Convert to milliseconds
        maxResourceSize: config.maxResourceSize,
      },
      logger,
    );
  }

  /**
   * Publish data using Team Alpha's resource manager
   */
  async publish<T>(data: T, mimeType: string, ttl?: number): Promise<ResourceReference> {
    const serialized = this.serialize(data, mimeType);
    const size = Buffer.byteLength(serialized);
    const resourceTTL = (ttl ?? this.config.defaultTTL) * 1000; // Convert to milliseconds

    // Generate unique URI using Team Alpha's scheme
    const hash = createHash('sha256').update(serialized).digest('hex').slice(0, 16);
    const uri = `mcp://${this.config.sessionId}/resources/${hash}`;

    // Publish using Team Alpha's resource manager
    const publishResult = await this.resourceManager.publish(uri, data, resourceTTL);
    
    if (!publishResult.ok) {
      this.logger.error({ error: publishResult.error, uri }, 'Failed to publish resource via Team Alpha');
      throw new Error(`Resource publishing failed: ${publishResult.error}`);
    }

    this.logger.debug({ uri, size, mimeType, ttl: resourceTTL }, 'Published resource via Team Alpha');

    return {
      uri: publishResult.value,
      mimeType,
      description: this.generateDescription(data, mimeType),
      size,
      ttl: ttl ?? this.config.defaultTTL,
      metadata: {
        sessionId: this.config.sessionId,
        publishedAt: new Date().toISOString(),
        teamAlphaManaged: true,
      },
    };
  }

  /**
   * Publish large data with extended TTL
   */
  async publishLarge<T>(data: T, mimeType: string): Promise<ResourceReference> {
    return this.publish(data, mimeType, this.config.defaultTTL * 2);
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
        sessionId: this.config.sessionId,
        external: true,
        teamAlphaManaged: false,
        ...metadata,
      },
    };
  }

  /**
   * Cleanup resources using Team Alpha's resource manager
   */
  async cleanup(pattern?: string): Promise<void> {
    if (pattern) {
      const invalidateResult = await this.resourceManager.invalidate(pattern);
      if (!invalidateResult.ok) {
        this.logger.error({ error: invalidateResult.error, pattern }, 'Failed to cleanup resources');
        throw new Error(`Resource cleanup failed: ${invalidateResult.error}`);
      }
    } else {
      // Cleanup all session resources
      const sessionPattern = `mcp://${this.config.sessionId}/*`;
      await this.cleanup(sessionPattern);
    }

    this.logger.debug({ pattern }, 'Cleaned up resources via Team Alpha');
  }

  /**
   * Get resource statistics from Team Alpha's manager
   */
  async getStats(): Promise<{ totalResources: number; sessionId: string }> {
    // Since Team Alpha's ResourceManager doesn't expose stats directly,
    // we'll provide basic session info
    return {
      totalResources: 0, // Would need Team Alpha extension to provide this
      sessionId: this.config.sessionId,
    };
  }

  /**
   * Read resource using Team Alpha's resource manager
   */
  async read(uri: string): Promise<Result<unknown>> {
    const readResult = await this.resourceManager.read(uri);
    
    if (!readResult.ok) {
      return Failure(`Failed to read resource: ${readResult.error}`);
    }

    if (!readResult.value) {
      return Failure('Resource not found');
    }

    return Success(readResult.value.content);
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
 * Factory for creating Team Alpha integrated resource publisher
 */
export function createTeamAlphaResourcePublisher(
  logger: Logger,
  sessionId: string,
  config?: Partial<TeamAlphaIntegrationConfig>,
  resourceManager?: ResourceManager,
): ResourcePublisher {
  const finalConfig: TeamAlphaIntegrationConfig = {
    defaultTTL: 3600, // 1 hour default
    maxResourceSize: 50 * 1024 * 1024, // 50MB default
    sessionId,
    enableCompression: true,
    supportedMimeTypes: [
      'application/json',
      'text/plain',
      'text/yaml',
      'text/dockerfile',
      'text/x-log',
    ],
    ...config,
  };

  return new TeamAlphaResourcePublisher(logger, finalConfig, resourceManager);
}