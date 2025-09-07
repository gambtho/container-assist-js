/**
 * Configuration Types Tests
 * 
 * Tests the configuration type system and helper functions
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  config,
  getConfig,
  createConfig,
  logConfigSummaryIfDev,
} from '../../../../src/config/index';
import { ConfigHelpers } from '../../../../src/config/validation';
import { createConfiguration, createConfigurationForEnv } from '../../../../src/config/config';
import type { ApplicationConfig, NodeEnv, LogLevel, WorkflowMode, StoreType, SamplerMode } from '../../../../src/config/types';

describe('Configuration Types', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    originalEnv = { ...process.env };
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleSpy.mockRestore();
  });

  describe('Type Safety', () => {
    it('should enforce NodeEnv type constraints', () => {
      const config = createConfiguration();
      
      // Valid values
      const validEnvs: NodeEnv[] = ['development', 'production', 'test'];
      validEnvs.forEach(env => {
        expect(typeof env).toBe('string');
        expect(['development', 'production', 'test']).toContain(env);
      });

      expect(['development', 'production', 'test']).toContain(config.server.nodeEnv);
    });

    it('should enforce LogLevel type constraints', () => {
      const config = createConfiguration();
      
      // Valid values
      const validLevels: LogLevel[] = ['error', 'warn', 'info', 'debug', 'trace'];
      validLevels.forEach(level => {
        expect(typeof level).toBe('string');
        expect(['error', 'warn', 'info', 'debug', 'trace']).toContain(level);
      });

      expect(['error', 'warn', 'info', 'debug', 'trace']).toContain(config.server.logLevel);
    });

    it('should enforce WorkflowMode type constraints', () => {
      const config = createConfiguration();
      
      // Valid values
      const validModes: WorkflowMode[] = ['interactive', 'auto', 'batch'];
      validModes.forEach(mode => {
        expect(typeof mode).toBe('string');
        expect(['interactive', 'auto', 'batch']).toContain(mode);
      });

      expect(['interactive', 'auto', 'batch']).toContain(config.workflow.mode);
    });

    it('should enforce StoreType type constraints', () => {
      const config = createConfiguration();
      
      // Valid values
      const validStores: StoreType[] = ['memory', 'file', 'redis'];
      validStores.forEach(store => {
        expect(typeof store).toBe('string');
        expect(['memory', 'file', 'redis']).toContain(store);
      });

      expect(['memory', 'file', 'redis']).toContain(config.session.store);
    });

    it('should enforce SamplerMode type constraints', () => {
      const validModes: SamplerMode[] = ['auto', 'mock', 'real'];
      validModes.forEach(mode => {
        expect(typeof mode).toBe('string');
        expect(['auto', 'mock', 'real']).toContain(mode);
      });
    });
  });

  describe('Configuration Structure', () => {
    it('should have correct ApplicationConfig structure', () => {
      const config: ApplicationConfig = createConfiguration();

      // Server configuration
      expect(config.server).toMatchObject({
        nodeEnv: expect.any(String),
        logLevel: expect.any(String),
        port: expect.any(Number),
        host: expect.any(String),
      });

      // MCP configuration
      expect(config.mcp).toMatchObject({
        storePath: expect.any(String),
        sessionTTL: expect.any(String),
        maxSessions: expect.any(Number),
        enableMetrics: expect.any(Boolean),
        enableEvents: expect.any(Boolean),
      });

      // Session configuration
      expect(config.session).toMatchObject({
        store: expect.any(String),
        ttl: expect.any(Number),
        maxSessions: expect.any(Number),
      });

      // Infrastructure configuration is optional in simplified config
      expect(config.infrastructure).toBeUndefined();
    });

    it('should have correct Docker configuration structure', () => {
      const config = createConfiguration();
      
      // Docker config is in core config, not infrastructure
      expect(config.docker).toMatchObject({
        socketPath: expect.any(String),
        registry: expect.any(String),
        timeout: expect.any(Number),
        buildArgs: expect.any(Object),
      });
    });

  });

  describe('Configuration Factory Functions', () => {
    it('should getConfig return configuration', () => {
      const config1 = getConfig();
      expect(config1).toBeDefined();
      expect(config1.server).toBeDefined();
      expect(config1.server.logLevel).toBeDefined();
    });


    it('should config provide access to configuration', () => {
      expect(config.server.logLevel).toBeDefined();
      expect(config.mcp.name).toBeDefined();
      expect(config.docker.socketPath).toBeDefined();
    });

    it('should config proxy allow setting values', () => {
        
      config.server.port = 8080;
      expect(config.server.port).toBe(8080);
      
      // Should persist in underlying config
      expect(getConfig().server.port).toBe(8080);
    });

    it('should createConfig return configuration object', () => {
      const configInstance = createConfig();
      expect(configInstance).toBeDefined();
      expect(configInstance.server).toBeDefined();
      expect(configInstance.mcp).toBeDefined();
    });

    it('should have basic config structure', () => {
      const configInstance = getConfig();
      expect(configInstance).toBeDefined();
      expect(configInstance.server).toBeDefined();
    });


  });

  describe('Configuration Helper Functions', () => {
    describe('logConfigSummaryIfDev', () => {
      it('should log summary in development', () => {
        process.env.NODE_ENV = 'development';

        logConfigSummaryIfDev();

        expect(consoleSpy).toHaveBeenCalledWith(
          'Configuration loaded:',
          expect.objectContaining({
            server: expect.any(Object),
          })
        );
      });

      it('should not log summary when not in development', () => {
        process.env.NODE_ENV = 'production';

        logConfigSummaryIfDev();

        expect(consoleSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('ConfigHelpers', () => {
    it('should isProduction check production environment', () => {
      const prodConfig = createConfigurationForEnv('production');
      const devConfig = createConfigurationForEnv('development');

      expect(ConfigHelpers.isProduction(prodConfig)).toBe(true);
      expect(ConfigHelpers.isProduction(devConfig)).toBe(false);
    });

    it('should isDevelopment check development environment', () => {
      const prodConfig = createConfigurationForEnv('production');
      const devConfig = createConfigurationForEnv('development');

      expect(ConfigHelpers.isDevelopment(prodConfig)).toBe(false);
      expect(ConfigHelpers.isDevelopment(devConfig)).toBe(true);
    });

    it('should isTest check test environment', () => {
      const testConfig = createConfigurationForEnv('test');
      const devConfig = createConfigurationForEnv('development');

      expect(ConfigHelpers.isTest(testConfig)).toBe(true);
      expect(ConfigHelpers.isTest(devConfig)).toBe(false);
    });


    describe('parseTTL', () => {
      it('should parse hours correctly', () => {
        expect(ConfigHelpers.parseTTL('1h')).toBe(3600000);
        expect(ConfigHelpers.parseTTL('24h')).toBe(86400000);
        expect(ConfigHelpers.parseTTL('48h')).toBe(172800000);
      });

      it('should parse minutes correctly', () => {
        expect(ConfigHelpers.parseTTL('1m')).toBe(60000);
        expect(ConfigHelpers.parseTTL('30m')).toBe(1800000);
        expect(ConfigHelpers.parseTTL('60m')).toBe(3600000);
      });

      it('should parse seconds correctly', () => {
        expect(ConfigHelpers.parseTTL('1s')).toBe(1000);
        expect(ConfigHelpers.parseTTL('30s')).toBe(30000);
        expect(ConfigHelpers.parseTTL('300s')).toBe(300000);
      });

      it('should throw error for invalid TTL format', () => {
        expect(() => ConfigHelpers.parseTTL('invalid')).toThrow('Invalid TTL format: invalid');
        expect(() => ConfigHelpers.parseTTL('1d')).toThrow('Invalid TTL format: 1d');
        expect(() => ConfigHelpers.parseTTL('h')).toThrow('Invalid TTL format: h');
        expect(() => ConfigHelpers.parseTTL('1')).toThrow('Invalid TTL format: 1');
        expect(() => ConfigHelpers.parseTTL('')).toThrow('Invalid TTL format: ');
      });

      it('should handle zero values', () => {
        expect(ConfigHelpers.parseTTL('0h')).toBe(0);
        expect(ConfigHelpers.parseTTL('0m')).toBe(0);
        expect(ConfigHelpers.parseTTL('0s')).toBe(0);
      });
    });
  });

  describe('Optional Properties', () => {
    it('should handle optional server properties', () => {
      const config = createConfiguration();
      
      expect(config.server.port).toBeDefined();
      expect(config.server.host).toBeDefined();
    });

    it('should handle optional docker properties', () => {
      const config = createConfiguration();
      
      expect(config.docker.host).toBeDefined();
      expect(config.docker.port).toBeDefined();
      expect(config.docker.buildArgs === undefined || typeof config.docker.buildArgs === 'object').toBe(true);
    });

    it('should handle optional workspace properties', () => {
      const config = createConfiguration();
      
      expect(config.workspace.workspaceDir).toBeDefined();
      expect(config.workspace.tempDir).toBeDefined();
      expect(config.workspace.cleanupOnExit).toBeDefined();
    });
  });

  describe('Configuration Merging', () => {
    it('should merge environment overrides with base configuration', () => {
      process.env.NODE_ENV = 'production';
      process.env.LOG_LEVEL = 'warn';
      process.env.DOCKER_REGISTRY = 'prod.registry.io';

      const config = createConfiguration();

      expect(config.server.nodeEnv).toBe('production');
      expect(config.server.logLevel).toBe('warn');
      expect(config.docker.registry).toBe('prod.registry.io');
      
      // Other values should remain default
      expect(config.server.port).toBe(3000);
      expect(config.mcp.maxSessions).toBe(100);
    });

    it('should handle complex nested property overrides', () => {
      process.env.DOCKER_HOST = '/custom/socket';
      process.env.KUBE_NAMESPACE = 'production';

      const config = createConfiguration();

      expect(config.docker.socketPath).toBe('/custom/socket');
      expect(config.kubernetes.namespace).toBe('production');

      // Other nested properties should remain default
      expect(config.docker.registry).toBe('docker.io');
      expect(config.kubernetes.timeout).toBe(30000);
    });
  });
});