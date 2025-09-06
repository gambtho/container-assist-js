import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import pino from 'pino';
import { McpResourceManager } from '../../src/mcp/resources/manager.js';
import { MemoryResourceCache } from '../../src/mcp/resources/cache.js';
import { UriParser } from '../../src/mcp/resources/uri-schemes.js';
import type { ResourceManager, ResourceCache } from '../../src/mcp/resources/types.js';

describe('McpResourceManager', () => {
  let resourceManager: ResourceManager;
  let cache: ResourceCache;
  let logger: pino.Logger;

  beforeEach(() => {
    logger = pino({ level: 'silent' }); // Silent logging for tests
    cache = new MemoryResourceCache(60000, logger); // 1 minute TTL
    resourceManager = new McpResourceManager(
      {
        defaultTtl: 60000,
        maxResourceSize: 1024 * 1024, // 1MB
        cacheConfig: { defaultTtl: 60000 },
      },
      logger,
      cache,
    );
  });

  afterEach(() => {
    if (cache instanceof MemoryResourceCache) {
      cache.destroy();
    }
  });

  describe('publish', () => {
    it('should publish a resource successfully', async () => {
      const uri = 'mcp://test/resource-1';
      const content = { message: 'Hello, World!' };

      const result = await resourceManager.publish(uri, content);

      expect(result.success).toBe(true);
      expect(result.data).toBe(uri);
    });

    it('should reject invalid URI format', async () => {
      const uri = 'invalid-uri';
      const content = { message: 'Hello' };

      const result = await resourceManager.publish(uri, content);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid URI');
    });

    it('should reject resources that are too large', async () => {
      const uri = 'mcp://test/large-resource';
      const content = 'x'.repeat(2 * 1024 * 1024); // 2MB string

      const result = await resourceManager.publish(uri, content);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Resource too large');
    });

    it('should set appropriate MIME types', async () => {
      const jsonUri = 'mcp://test/json';
      const textUri = 'mcp://test/text';
      const objectUri = 'mcp://test/object';

      await resourceManager.publish(jsonUri, '{"test": true}');
      await resourceManager.publish(textUri, 'plain text');
      await resourceManager.publish(objectUri, { key: 'value' });

      const jsonResult = await resourceManager.read(jsonUri);
      const textResult = await resourceManager.read(textUri);
      const objectResult = await resourceManager.read(objectUri);

      expect(jsonResult.data?.mimeType).toBe('application/json');
      expect(textResult.data?.mimeType).toBe('text/plain');
      expect(objectResult.data?.mimeType).toBe('application/json');
    });
  });

  describe('read', () => {
    it('should read a published resource', async () => {
      const uri = 'mcp://test/readable';
      const content = { data: 'test content' };

      await resourceManager.publish(uri, content);
      const result = await resourceManager.read(uri);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.content).toEqual(content);
      expect(result.data!.uri).toBe(uri);
    });

    it('should return null for non-existent resource', async () => {
      const uri = 'mcp://test/non-existent';

      const result = await resourceManager.read(uri);

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('should handle expired resources', async () => {
      const uri = 'mcp://test/expired';
      const content = { data: 'expires soon' };

      // Publish with very short TTL
      await resourceManager.publish(uri, content, 10); // 10ms

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 50));

      const result = await resourceManager.read(uri);

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });
  });

  describe('getMetadata', () => {
    it('should return metadata without content', async () => {
      const uri = 'mcp://test/metadata';
      const content = { large: 'content'.repeat(1000) };

      await resourceManager.publish(uri, content);
      const result = await resourceManager.getMetadata(uri);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.uri).toBe(uri);
      expect(result.data!.mimeType).toBe('application/json');
      expect(result.data!.createdAt).toBeInstanceOf(Date);
      expect('content' in result.data!).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should cleanup expired resources', async () => {
      const uri1 = 'mcp://test/expires-fast';
      const uri2 = 'mcp://test/expires-slow';

      await resourceManager.publish(uri1, 'content1', 10); // 10ms
      await resourceManager.publish(uri2, 'content2', 60000); // 60s

      // Wait for first to expire
      await new Promise(resolve => setTimeout(resolve, 50));

      const cleanupResult = await resourceManager.cleanup();
      expect(cleanupResult.success).toBe(true);

      // Check that expired resource is gone
      const read1 = await resourceManager.read(uri1);
      expect(read1.data).toBeNull();

      // Check that non-expired resource remains
      const read2 = await resourceManager.read(uri2);
      expect(read2.data).toBeDefined();
    });
  });
});

describe('UriParser', () => {
  describe('parse', () => {
    it('should parse valid MCP URIs', () => {
      const uri = 'mcp://path/to/resource?param=value#fragment';
      const result = UriParser.parse(uri);

      expect(result.success).toBe(true);
      expect(result.data!.scheme).toBe('mcp');
      expect(result.data!.path).toBe('/path/to/resource');
      expect(result.data!.query).toEqual({ param: 'value' });
      expect(result.data!.fragment).toBe('fragment');
    });

    it('should reject invalid schemes', () => {
      const uri = 'http://invalid/scheme';
      const result = UriParser.parse(uri);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid URI scheme');
    });

    it('should handle URIs without query or fragment', () => {
      const uri = 'cache://simple/path';
      const result = UriParser.parse(uri);

      expect(result.success).toBe(true);
      expect(result.data!.scheme).toBe('cache');
      expect(result.data!.path).toBe('/simple/path');
      expect(result.data!.query).toBeUndefined();
      expect(result.data!.fragment).toBeUndefined();
    });
  });

  describe('build', () => {
    it('should build valid URIs from components', () => {
      const uri = UriParser.build(
        'session',
        'test/resource',
        { param: 'value' },
        'fragment',
      );

      expect(uri).toBe('session://test/resource?param=value#fragment');
    });

    it('should handle missing query and fragment', () => {
      const uri = UriParser.build('mcp', 'simple/path');

      expect(uri).toBe('mcp://simple/path');
    });
  });

  describe('generateUnique', () => {
    it('should generate unique URIs', () => {
      const uri1 = UriParser.generateUnique('temp', 'test');
      const uri2 = UriParser.generateUnique('temp', 'test');

      expect(uri1).not.toBe(uri2);
      expect(uri1).toMatch(/^temp:\/\/test\/\d+-[a-z0-9]+$/);
      expect(uri2).toMatch(/^temp:\/\/test\/\d+-[a-z0-9]+$/);
    });

    it('should generate URIs without base path', () => {
      const uri = UriParser.generateUnique('mcp');

      expect(uri).toMatch(/^mcp:\/\/\d+-[a-z0-9]+$/);
    });
  });

  describe('matches', () => {
    it('should match exact URIs', () => {
      const uri = 'mcp://test/resource';
      const pattern = 'mcp://test/resource';

      expect(UriParser.matches(uri, pattern)).toBe(true);
    });

    it('should match wildcard patterns', () => {
      const uri = 'mcp://test/resource/123';

      expect(UriParser.matches(uri, 'mcp://test/*')).toBe(true);
      expect(UriParser.matches(uri, 'mcp://test/resource/*')).toBe(true);
      expect(UriParser.matches(uri, '*')).toBe(true);
      expect(UriParser.matches(uri, 'cache://*')).toBe(false);
    });
  });
});
