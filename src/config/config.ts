/**
 * Application configuration with environment overrides
 */

import type { ApplicationConfig } from './types';
import { mapEnvironmentToConfig } from './env-mapper';

/**
 * Create default configuration with sensible defaults
 * @returns ApplicationConfig with default values for all sections
 */
function createDefaultConfig(): ApplicationConfig {
  return {
    server: {
      nodeEnv: 'development',
      logLevel: 'info',
      port: 3000,
      host: 'localhost',
    },
    session: {
      store: 'memory',
      ttl: 86400, // 24h
      maxSessions: 1000,
      persistencePath: './data/sessions.db',
      persistenceInterval: 60000, // 1min
      cleanupInterval: 300000, // 5min
    },
    docker: {
      socketPath: '/var/run/docker.sock',
      registry: 'docker.io',
      host: 'localhost',
      port: 2375,
      timeout: 30000,
      apiVersion: '1.41',
      buildArgs: {},
    },
    kubernetes: {
      kubeconfig: '~/.kube/config',
      namespace: 'default',
      context: 'default',
      timeout: 30000,
      dryRun: false,
    },
    workflow: {
      mode: 'interactive',
      autoRetry: true,
      maxRetries: 3,
      retryDelayMs: 1000,
      parallelSteps: false,
    },

    mcp: {
      storePath: './data/sessions.db',
      sessionTTL: '24h',
      maxSessions: 100,
      enableMetrics: true,
      enableEvents: true,
    },
    workspace: {
      workspaceDir: process.cwd(),
      tempDir: './tmp',
      cleanupOnExit: true,
    },
    logging: {
      level: 'info',
      format: 'pretty',
      destination: 'console',
      filePath: './logs/app.log',
      maxFileSize: '10MB',
      maxFiles: 5,
      enableColors: true,
    },
  };
}

/**
 * Create configuration with environment overrides
 * @returns ApplicationConfig with environment variable overrides applied
 */
export function createConfiguration(): ApplicationConfig {
  // Start with defaults
  const defaults = createDefaultConfig();

  // Get environment overrides
  const envOverrides = mapEnvironmentToConfig();

  // Merge defaults with environment overrides
  return {
    ...defaults,
    ...envOverrides,
    server: { ...defaults.server, ...envOverrides.server },
    session: { ...defaults.session, ...envOverrides.session },
    docker: { ...defaults.docker, ...envOverrides.docker },
    kubernetes: { ...defaults.kubernetes, ...envOverrides.kubernetes },
    workflow: { ...defaults.workflow, ...envOverrides.workflow },
    mcp: { ...defaults.mcp, ...(envOverrides.mcp || {}) },
  };
}

/**
 * Create configuration for specific environment
 * @param nodeEnv - Target environment
 * @returns ApplicationConfig optimized for the specified environment
 */
export function createConfigurationForEnv(
  nodeEnv: 'development' | 'production' | 'test',
): ApplicationConfig {
  const config = createConfiguration();
  config.server.nodeEnv = nodeEnv;

  switch (nodeEnv) {
    case 'development':
      config.server.logLevel = 'debug';
      break;
    case 'production':
      config.server.logLevel = 'info';
      break;
    case 'test':
      config.server.logLevel = 'error';
      config.session.store = 'memory';
      break;
  }

  return config;
}

/**
 * Get configuration summary for logging
 * @param config - Application configuration
 * @returns Summary object with key configuration values
 */
export function getConfigurationSummary(config: ApplicationConfig): Record<string, unknown> {
  return {
    nodeEnv: config.server.nodeEnv,
    logLevel: config.server.logLevel,
    workflowMode: config.workflow.mode,
    maxSessions: config.session.maxSessions,
    dockerRegistry: config.docker.registry,
  };
}
