/**
 * Configuration Types Tests
 * 
 * Tests the configuration type system and helper functions
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  getConfig,
  resetConfig,
  config,
  createConfig,
  createTestConfig,
  createMinimalConfig,
  getConfigSummary,
  logConfigSummaryIfDev,
  ConfigHelpers,
} from '../../src/config/index';
import { createConfiguration, createConfigurationForEnv } from '../../src/config/config';
import type { ApplicationConfig, NodeEnv, LogLevel, WorkflowMode, StoreType, SamplerMode } from '../../src/config/types';

describe('Configuration Types', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    originalEnv = { ...process.env };
    resetConfig();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleSpy.mockRestore();
    resetConfig();
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
      const config = createConfiguration();
      
      // Valid values
      const validModes: SamplerMode[] = ['auto', 'mock', 'real'];
      validModes.forEach(mode => {
        expect(typeof mode).toBe('string');
        expect(['auto', 'mock', 'real']).toContain(mode);
      });

      expect(['auto', 'mock', 'real']).toContain(config.aiServices.sampler.mode);
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

      // Infrastructure configuration
      expect(config.infrastructure).toMatchObject({
        docker: expect.any(Object),
        kubernetes: expect.any(Object),
        scanning: expect.any(Object),
        build: expect.any(Object),
        java: expect.any(Object),
      });
    });

    it('should have correct Docker configuration structure', () => {
      const config = createConfiguration();
      
      expect(config.infrastructure.docker).toMatchObject({
        socketPath: expect.any(String),
        registry: expect.any(String),
        host: expect.any(String),
        port: expect.any(Number),
        timeout: expect.any(Number),
        apiVersion: expect.any(String),
      });
    });

    it('should have correct AI services configuration structure', () => {
      const config = createConfiguration();
      
      expect(config.aiServices.ai).toMatchObject({
        apiKey: expect.any(String),
        model: expect.any(String),
        baseUrl: expect.any(String),
        timeout: expect.any(Number),
        retryAttempts: expect.any(Number),
        retryDelayMs: expect.any(Number),
        temperature: expect.any(Number),
        maxTokens: expect.any(Number),
      });

      expect(config.aiServices.sampler).toMatchObject({
        mode: expect.any(String),
        templateDir: expect.any(String),
        cacheEnabled: expect.any(Boolean),
        retryAttempts: expect.any(Number),
        retryDelayMs: expect.any(Number),
      });
    });
  });

  describe('Configuration Factory Functions', () => {
    it('should getConfig return lazy-loaded configuration', () => {
      const config1 = getConfig();
      const config2 = getConfig();

      // Should return same instance (lazy loading)
      expect(config1).toBe(config2);
      expect(config1.server.nodeEnv).toBe('test');
    });

    it('should resetConfig clear lazy-loaded instance', () => {
      const config1 = getConfig();
      resetConfig();
      const config2 = getConfig();

      // Should be different instances after reset
      expect(config1).not.toBe(config2);
      expect(config2).toBeDefined();
    });

    it('should config proxy provide access to configuration', () => {
      resetConfig();
      
      expect(config.server.nodeEnv).toBe('test');
      expect(config.mcp.maxSessions).toBe(100);
      expect(config.infrastructure.docker.registry).toBe('docker.io');
    });

    it('should config proxy allow setting values', () => {
      resetConfig();
      
      config.server.port = 8080;
      expect(config.server.port).toBe(8080);
      
      // Should persist in underlying config
      expect(getConfig().server.port).toBe(8080);
    });

    it('should createConfig be alias for createConfiguration', () => {
      const config1 = createConfig();
      const config2 = createConfiguration();

      expect(config1).toEqual(config2);
    });

    it('should createTestConfig return test configuration', () => {
      const config = createTestConfig();

      expect(config.server.nodeEnv).toBe('test');
      expect(config.server.logLevel).toBe('error');
      expect(config.features.mockMode).toBe(true);
      expect(config.features.enableEvents).toBe(false);
      expect(config.session.store).toBe('memory');
    });

    it('should createMinimalConfig return test configuration', () => {
      const config = createMinimalConfig();

      // Currently same as test config
      expect(config.server.nodeEnv).toBe('test');
      expect(config.server.logLevel).toBe('error');
      expect(config.features.mockMode).toBe(true);
    });

    it('should getConfigSummary return configuration summary', () => {
      const config = createConfiguration();
      const summary = getConfigSummary(config);

      expect(summary).toEqual({
        nodeEnv: 'test',
        logLevel: 'error',
        workflowMode: 'interactive',
        mockMode: false,
        aiEnabled: true,
        maxSessions: 100,
        dockerRegistry: 'docker.io',
      });
    });
  });

  describe('Configuration Helper Functions', () => {
    describe('logConfigSummaryIfDev', () => {
      it('should log summary in development with debug logs enabled', () => {
        const config = createConfigurationForEnv('development');
        config.features.enableDebugLogs = true;

        logConfigSummaryIfDev(config);

        expect(consoleSpy).toHaveBeenCalledWith(
          'Configuration loaded:',
          expect.objectContaining({
            nodeEnv: 'development',
            logLevel: 'debug',
          })
        );
      });

      it('should not log summary in development with debug logs disabled', () => {
        const config = createConfigurationForEnv('development');
        config.features.enableDebugLogs = false;

        logConfigSummaryIfDev(config);

        expect(consoleSpy).not.toHaveBeenCalled();
      });

      it('should not log summary in production', () => {
        const config = createConfigurationForEnv('production');

        logConfigSummaryIfDev(config);

        expect(consoleSpy).not.toHaveBeenCalled();
      });

      it('should not log summary in test', () => {
        const config = createConfigurationForEnv('test');

        logConfigSummaryIfDev(config);

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

    it('should hasAI check AI availability', () => {
      const config = createConfiguration();
      
      // AI enabled and has API key
      config.features.aiEnabled = true;
      config.aiServices.ai.apiKey = 'test-key';
      expect(ConfigHelpers.hasAI(config)).toBe(true);

      // AI enabled but no API key, mock mode enabled
      config.aiServices.ai.apiKey = '';
      config.features.mockMode = true;
      expect(ConfigHelpers.hasAI(config)).toBe(true);

      // AI disabled
      config.features.aiEnabled = false;
      expect(ConfigHelpers.hasAI(config)).toBe(false);

      // AI enabled, no API key, no mock mode - reset first
      config.features.aiEnabled = true;
      config.aiServices.ai.apiKey = '';
      config.features.mockMode = false;
      expect(ConfigHelpers.hasAI(config)).toBe(false);
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
      expect(config.server.shutdownTimeout).toBeUndefined();
    });

    it('should handle optional docker properties', () => {
      const config = createConfiguration();
      
      expect(config.infrastructure.docker.host).toBeDefined();
      expect(config.infrastructure.docker.port).toBeDefined();
      expect(config.infrastructure.docker.buildArgs === undefined || typeof config.infrastructure.docker.buildArgs === 'object').toBe(true);
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
      expect(config.infrastructure.docker.registry).toBe('prod.registry.io');
      
      // Other values should remain default
      expect(config.server.port).toBe(3000);
      expect(config.mcp.maxSessions).toBe(100);
    });

    it('should handle complex nested property overrides', () => {
      process.env.DOCKER_SOCKET = '/custom/socket';
      process.env.K8S_NAMESPACE = 'production';
      process.env.AI_MODEL = 'gpt-4';

      const config = createConfiguration();

      expect(config.infrastructure.docker.socketPath).toBe('/custom/socket');
      expect(config.infrastructure.kubernetes.namespace).toBe('production');
      expect(config.aiServices.ai.model).toBe('gpt-4');

      // Other nested properties should remain default
      expect(config.infrastructure.docker.registry).toBe('docker.io');
      expect(config.infrastructure.kubernetes.timeout).toBe(300000);
      expect(config.aiServices.ai.timeout).toBe(30000);
    });
  });
});