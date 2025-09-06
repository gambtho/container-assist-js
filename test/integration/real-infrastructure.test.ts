import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createMCPInfrastructure, createInfrastructure, MCPInfrastructure } from '../mocks/index.js';

describe('Real MCP Infrastructure Integration', () => {
  let cleanup: Array<() => void> = [];

  afterEach(() => {
    // Cleanup any resources
    cleanup.forEach(fn => fn());
    cleanup = [];
  });

  describe('createMCPInfrastructure', () => {
    it('should create real resource manager and progress notifier', () => {
      const infra = createMCPInfrastructure();
      
      expect(infra.config).toBeDefined();
      expect(infra.resourceManager).toBeDefined();
      expect(infra.progressNotifier).toBeDefined();
      
      // Verify these are real implementations, not mocks
      expect(infra.resourceManager.constructor.name).toBe('McpResourceManager');
      expect(infra.progressNotifier.constructor.name).toBe('McpProgressNotifier');
    });

    it('should allow config overrides', () => {
      const infra = createMCPInfrastructure({
        resources: {
          maxSize: 1024,
          defaultTtl: 5000,
          cacheDir: './test-cache',
          enableCompression: false
        }
      });
      
      expect(infra.config.resources.maxSize).toBe(1024);
      expect(infra.config.resources.defaultTtl).toBe(5000);
    });
  });

  describe('createInfrastructure with environment detection', () => {
    it('should use real implementations when explicitly requested', () => {
      const infra = createInfrastructure(undefined, 'real');
      
      // Should be real implementations
      expect(infra.resourceManager.constructor.name).toBe('McpResourceManager');
      expect(infra.progressNotifier.constructor.name).toBe('McpProgressNotifier');
    });

    it('should use mocks when explicitly requested', () => {
      const infra = createInfrastructure(undefined, 'mock');
      
      // Should be mock implementations
      expect(infra.resourceManager.constructor.name).toBe('MockResourceManager');
      expect(infra.progressNotifier.constructor.name).toBe('MockProgressNotifier');
    });

    it('should use mocks in test environment by default', () => {
      // In test environment (NODE_ENV=test), should automatically use mocks
      const infra = createInfrastructure();
      
      // Should be mock implementations since we're in test environment
      expect(infra.resourceManager.constructor.name).toBe('MockResourceManager');
      expect(infra.progressNotifier.constructor.name).toBe('MockProgressNotifier');
    });

    it('should respect forceMode parameter', () => {
      const realInfra = createInfrastructure(undefined, 'real');
      const mockInfra = createInfrastructure(undefined, 'mock');
      
      expect(realInfra.resourceManager.constructor.name).toBe('McpResourceManager');
      expect(mockInfra.resourceManager.constructor.name).toBe('MockResourceManager');
    });
  });

  describe('MCPInfrastructure', () => {
    it('should provide use-case-specific real infrastructure', () => {
      const samplingInfra = MCPInfrastructure.sampling();
      const toolingInfra = MCPInfrastructure.tooling();
      
      // Should be real implementations
      expect(samplingInfra.resourceManager.constructor.name).toBe('McpResourceManager');
      expect(samplingInfra.progressNotifier.constructor.name).toBe('McpProgressNotifier');
      
      expect(toolingInfra.resourceManager.constructor.name).toBe('McpResourceManager');
      expect(toolingInfra.progressNotifier.constructor.name).toBe('McpProgressNotifier');
      
      // Should have use-case-specific configs
      expect(samplingInfra.config.sampling.maxCandidates).toBe(7); // Sampling-specific
      expect(toolingInfra.config.tools.enableResourceLinks).toBe(true); // Tooling-specific
    });
  });

  describe('Real Resource Manager Integration', () => {
    it('should publish and read resources', async () => {
      const infra = createMCPInfrastructure();
      const { resourceManager } = infra;
      
      const testContent = { message: 'Hello from real implementation!' };
      const uri = 'mcp://test/integration-test';
      
      // Publish
      const publishResult = await resourceManager.publish(uri, testContent);
      expect(publishResult.success).toBe(true);
      expect(publishResult.data).toBe(uri);
      
      // Read
      const readResult = await resourceManager.read(uri);
      expect(readResult.success).toBe(true);
      expect(readResult.data).toBeDefined();
      expect(readResult.data!.content).toEqual(testContent);
      expect(readResult.data!.mimeType).toBe('application/json');
    });

    it('should validate resource size limits', async () => {
      const infra = createMCPInfrastructure({
        resources: {
          maxSize: 100, // Very small limit for testing
          defaultTtl: 60000,
          cacheDir: './test-cache',
          enableCompression: true
        }
      });
      
      const largeContent = 'x'.repeat(200); // Exceeds 100 byte limit
      const uri = 'mcp://test/large-content';
      
      const result = await infra.resourceManager.publish(uri, largeContent);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Resource too large');
    });
  });

  describe('Real Progress Notifier Integration', () => {
    it('should track progress events', async () => {
      const infra = createMCPInfrastructure();
      const { progressNotifier } = infra;
      
      const events: any[] = [];
      const unsubscribe = progressNotifier.subscribe((event) => {
        events.push(event);
      });
      cleanup.push(unsubscribe);
      
      const token = progressNotifier.generateToken('integration-test');
      
      // Send progress updates
      progressNotifier.notifyProgress({ token, value: 25, message: 'Starting...' });
      progressNotifier.notifyProgress({ token, value: 75, message: 'Almost done...' });
      progressNotifier.notifyComplete(token, { result: 'success' });
      
      // Give events time to propagate
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(events).toHaveLength(3);
      expect(events[0].type).toBe('progress');
      expect(events[0].value).toBe(25);
      expect(events[1].type).toBe('progress');
      expect(events[1].value).toBe(75);
      expect(events[2].type).toBe('complete');
      expect(events[2].result).toEqual({ result: 'success' });
    });

    it('should generate unique tokens', () => {
      const infra = createMCPInfrastructure();
      const { progressNotifier } = infra;
      
      const token1 = progressNotifier.generateToken('test-op');
      const token2 = progressNotifier.generateToken('test-op');
      
      expect(token1).not.toBe(token2);
      expect(token1).toContain('test-op');
      expect(token2).toContain('test-op');
    });
  });
});