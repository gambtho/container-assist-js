import { Result } from '../../types/core.js';

export interface Resource {
  uri: string;
  content: unknown;
  mimeType: string;
  createdAt: Date;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface ResourceManager {
  /**
   * Publish content to a resource URI with optional TTL
   */
  publish(uri: string, content: unknown, ttl?: number): Promise<Result<string>>;

  /**
   * Read content from a resource URI
   */
  read(uri: string): Promise<Result<Resource | null>>;

  /**
   * Invalidate resources matching a pattern
   */
  invalidate(pattern: string): Promise<Result<void>>;

  /**
   * List all resource URIs matching a pattern
   */
  list(pattern: string): Promise<Result<string[]>>;

  /**
   * Cleanup expired resources
   */
  cleanup(): Promise<Result<void>>;

  /**
   * Get resource metadata without content
   */
  getMetadata(uri: string): Promise<Result<Omit<Resource, 'content'> | null>>;
}

export interface ResourceCache {
  set(key: string, value: unknown, ttl?: number): Promise<Result<void>>;
  get(key: string): Promise<Result<unknown>>;
  delete(key: string): Promise<Result<boolean>>;
  clear(): Promise<Result<void>>;
  has(key: string): Promise<Result<boolean>>;
}

export const URI_SCHEMES = {
  MCP: 'mcp',
  CACHE: 'cache',
  SESSION: 'session',
  TEMP: 'temp',
} as const;

export type UriScheme = (typeof URI_SCHEMES)[keyof typeof URI_SCHEMES];

export interface ParsedUri {
  scheme: UriScheme;
  path: string;
  query?: Record<string, string>;
  fragment?: string;
}
