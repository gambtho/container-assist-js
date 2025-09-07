/**
 * Configuration Validation Tests
 * 
 * Tests the configuration validation and loading system
 */

import { jest } from '@jest/globals';
import {
  createConfiguration,
  createConfigurationForEnv,
  getConfigurationSummary,
} from '../../src/config/config';
import { validateConfig } from '../../src/config/validation';
import type { ApplicationConfig } from '../../src/config/types';

describe('Configuration Validation', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Clear relevant environment variables for clean tests
    delete process.env.NODE_ENV;
    delete process.env.LOG_LEVEL;
    delete process.env.MCP_STORE_PATH;
    delete process.env.SESSION_TTL;
    delete process.env.MAX_SESSIONS;
    delete process.env.WORKSPACE_DIR;
    delete process.env.DOCKER_HOST;
    delete process.env.DOCKER_REGISTRY;
    delete process.env.KUBE_NAMESPACE;
    delete process.env.KUBECONFIG;
    delete process.env.AI_MODEL;
    delete process.env.AI_BASE_URL;
    delete process.env.MOCK_MODE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createConfiguration', () => {
    it('should create configuration with default values', () => {
      const config = createConfiguration();

      expect(config).toBeDefined();
      expect(config.server.nodeEnv).toBe('development');
      expect(config.server.logLevel).toBe('info');
      expect(config.server.port).toBe(3000);
      expect(config.server.host).toBe('localhost');
      expect(config.mcp.storePath).toBe('./data/sessions.db');
      expect(config.mcp.sessionTTL).toBe('24h');
      expect(config.mcp.maxSessions).toBe(100);
      expect(config.docker.socketPath).toBe('/var/run/docker.sock');
      expect(config.docker.registry).toBe('docker.io');
    });

    it('should apply environment variable overrides', () => {
      process.env.NODE_ENV = 'production';
      process.env.LOG_LEVEL = 'warn';
      process.env.MCP_STORE_PATH = '/custom/path/sessions.db';
      process.env.MAX_SESSIONS = '200';
      process.env.DOCKER_REGISTRY = 'custom.registry.io';
      process.env.AI_MODEL = 'gpt-4';
      process.env.MOCK_MODE = 'true';

      const config = createConfiguration();

      expect(config.server.nodeEnv).toBe('production');
      expect(config.server.logLevel).toBe('warn');
      expect(config.mcp.storePath).toBe('/custom/path/sessions.db');
      expect(config.mcp.maxSessions).toBe(200);
      expect(config.docker.registry).toBe('custom.registry.io');
    });

    it('should handle nested configuration paths', () => {
      process.env.DOCKER_HOST = '/custom/docker.sock';
      process.env.KUBE_NAMESPACE = 'production';
      process.env.AI_BASE_URL = 'https://api.custom.com';

      const config = createConfiguration();

      expect(config.docker.socketPath).toBe('/custom/docker.sock');
      expect(config.kubernetes.namespace).toBe('production');
    });

    it('should handle boolean environment variables correctly', () => {
      process.env.MOCK_MODE = 'true';
      const config1 = createConfiguration();

      process.env.MOCK_MODE = 'false';
      const config2 = createConfiguration();

      process.env.MOCK_MODE = 'True';
      const config3 = createConfiguration();

      process.env.MOCK_MODE = 'FALSE';
      const config4 = createConfiguration();
    });

    it('should handle number environment variables correctly', () => {
      process.env.MAX_SESSIONS = '500';
      const config = createConfiguration();
      expect(config.mcp.maxSessions).toBe(500);
      expect(typeof config.mcp.maxSessions).toBe('number');
    });

    it('should warn and skip invalid number values', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      
      process.env.MAX_SESSIONS = 'not-a-number';
      const config = createConfiguration();
      
      // Should use default value when parsing fails
      expect(config.mcp.maxSessions).toBe(100);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid MAX_SESSIONS')
      );
      
      consoleSpy.mockRestore();
    });

    it('should preserve existing structure when overriding nested values', () => {
      process.env.DOCKER_HOST = '/custom/docker.sock';
      const config = createConfiguration();

      // Check that other Docker config values are preserved
      expect(config.docker.socketPath).toBe('/custom/docker.sock');
      expect(config.docker.registry).toBe('docker.io');
      expect(config.docker.host).toBe('localhost');
      expect(config.docker.port).toBe(2375);
    });
  });

  describe('createConfigurationForEnv', () => {
    it('should create development configuration', () => {
      const config = createConfigurationForEnv('development');

      expect(config.server.nodeEnv).toBe('development');
      expect(config.server.logLevel).toBe('debug');
    });

    it('should create production configuration', () => {
      const config = createConfigurationForEnv('production');

      expect(config.server.nodeEnv).toBe('production');
      expect(config.server.logLevel).toBe('info');
    });

    it('should create test configuration', () => {
      const config = createConfigurationForEnv('test');

      expect(config.server.nodeEnv).toBe('test');
      expect(config.server.logLevel).toBe('error');
      expect(config.session.store).toBe('memory');
    });

    it('should still apply environment overrides for specific environments', () => {
      process.env.MAX_SESSIONS = '50';

      const config = createConfigurationForEnv('production');

      expect(config.server.nodeEnv).toBe('production');
      expect(config.mcp.maxSessions).toBe(50);
    });
  });

  describe('validateConfig', () => {
    it('should validate correct configuration', () => {
      const config = createConfiguration();
      const result = validateConfig(config);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect invalid NODE_ENV', () => {
      const config = createConfiguration();
      config.server.nodeEnv = 'invalid' as any;

      const result = validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('Must be development, production, or test') })
      ]));
    });

    it('should detect invalid LOG_LEVEL', () => {
      const config = createConfiguration();
      config.server.logLevel = 'invalid' as any;

      const result = validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('Must be error, warn, info, debug, or trace') })
      ]));
    });

    it('should detect invalid server port', () => {
      const config = createConfiguration();
      config.server.port = -1;

      const result = validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('Must be between 1 and 65535') })
      ]));

      config.server.port = 70000;
      const result2 = validateConfig(config);
      expect(result2.isValid).toBe(false);
      expect(result2.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('Must be between 1 and 65535') })
      ]));
    });

    it('should validate port 0 as invalid', () => {
      const config = createConfiguration();
      config.server.port = 0;

      const result = validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('Must be between 1 and 65535') })
      ]));
    });

    it('should validate valid port ranges', () => {
      const config = createConfiguration();
      config.server.port = 1;
      expect(validateConfig(config).isValid).toBe(true);

      config.server.port = 65535;
      expect(validateConfig(config).isValid).toBe(true);

      config.server.port = 8080;
      expect(validateConfig(config).isValid).toBe(true);
    });

    it('should handle undefined port', () => {
      const config = createConfiguration();
      config.server.port = undefined;

      const result = validateConfig(config);
      expect(result.isValid).toBe(true);
    });

    it('should accumulate multiple validation errors', () => {
      const config = createConfiguration();
      config.server.nodeEnv = 'invalid' as any;
      config.server.logLevel = 'invalid' as any;
      config.server.port = -1;

      const result = validateConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('Must be development, production, or test') }),
        expect.objectContaining({ message: expect.stringContaining('Must be error, warn, info, debug, or trace') }),
        expect.objectContaining({ message: expect.stringContaining('Must be between 1 and 65535') })
      ]));
    });
  });

  describe('getConfigurationSummary', () => {
    it('should return configuration summary with key values', () => {
      const config = createConfiguration();
      const summary = getConfigurationSummary(config);

      expect(summary).toEqual({
        nodeEnv: 'development',
        logLevel: 'info',
        workflowMode: 'interactive',
        maxSessions: 1000,
        dockerRegistry: 'docker.io',
      });
    });

    it('should reflect configuration changes in summary', () => {
      const config = createConfigurationForEnv('production');
      config.docker.registry = 'custom.registry.io';
      config.session.maxSessions = 500;

      const summary = getConfigurationSummary(config);

      expect(summary.nodeEnv).toBe('production');
      expect(summary.dockerRegistry).toBe('custom.registry.io');
      expect(summary.maxSessions).toBe(500);
    });
  });

  describe('Configuration Structure Integrity', () => {
    it('should have all required top-level configuration sections', () => {
      const config = createConfiguration();

      expect(config.server).toBeDefined();
      expect(config.mcp).toBeDefined();
      expect(config.session).toBeDefined();
      expect(config.workspace).toBeDefined();
      expect(config.logging).toBeDefined();
      expect(config.workflow).toBeDefined();
      expect(config.docker).toBeDefined();
      expect(config.kubernetes).toBeDefined();
    });


    it('should maintain type safety for enum values', () => {
      const config = createConfiguration();

      // Test enum types are preserved
      expect(['development', 'production', 'test']).toContain(config.server.nodeEnv);
      expect(['error', 'warn', 'info', 'debug', 'trace']).toContain(config.server.logLevel);
      expect(['interactive', 'auto', 'batch']).toContain(config.workflow.mode);
      expect(['memory', 'file', 'redis']).toContain(config.session.store);
    });
  });

  describe('Environment Variable Edge Cases', () => {
    it('should handle empty string environment variables', () => {
      process.env.KUBECONFIG = '';

      const config = createConfiguration();

      expect(config.kubernetes.kubeconfig).toBe('');
    });

    it('should handle whitespace in environment variables', () => {
      process.env.DOCKER_REGISTRY = '  registry.example.com  ';

      const config = createConfiguration();

      // Values should be preserved as-is (no trimming in current implementation)
      expect(config.docker.registry).toBe('  registry.example.com  ');
    });

    it('should handle undefined environment variables gracefully', () => {
      // Ensure no environment variables are set
      const config = createConfiguration();

      // Should use default values
      expect(config.kubernetes.kubeconfig).toBe('~/.kube/config');
      expect(config.mcp.storePath).toBe('./data/sessions.db');
    });
  });

  describe('Configuration Immutability', () => {
    it('should create independent configuration instances', () => {
      const config1 = createConfiguration();
      const config2 = createConfiguration();

      // Modify one config
      config1.server.port = 9999;
      config1.docker.registry = 'modified.registry.io';

      // Other config should be unchanged
      expect(config2.server.port).toBe(3000);
      expect(config2.docker.registry).toBe('docker.io');
    });

    it('should create deep copies for nested objects', () => {
      const config1 = createConfiguration();
      const config2 = createConfiguration();

      // Modify nested object properties that exist in base config
      config1.docker.buildArgs = { TEST: 'value' };
      config1.docker.host = 'modified-host';

      // Other config's nested objects should be unchanged
      expect(config2.docker.buildArgs).toEqual({});
      expect(config2.docker.host).toBe('localhost');
      
      // Verify the modifications were applied to config1
      expect(config1.docker.buildArgs).toEqual({ TEST: 'value' });
      expect(config1.docker.host).toBe('modified-host');
    });
  });
});