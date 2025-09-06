/**
 * Simplified Configuration System
 *
 * Uses the new split configuration approach with core + advanced configs.
 * Much simpler and more maintainable than the previous approach.
 */

import type { ApplicationConfig } from './types';
import { mapEnvironmentToConfig } from './env-mapper';

/**
 * Create default configuration with sensible defaults
 * Uses the new core + advanced structure
 */
function createDefaultConfig(): ApplicationConfig {
  return {
    // Core configuration (always present)
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
    features: {
      mockMode: false,
      enableMetrics: true,
      enableEvents: true,
      enableDebugLogs: false,
      nonInteractive: false,
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

    // Advanced configuration (optional - only add when needed)
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
    // Deep merge for nested objects
    server: { ...defaults.server, ...envOverrides.server },
    session: { ...defaults.session, ...envOverrides.session },
    features: { ...defaults.features, ...envOverrides.features },
    docker: { ...defaults.docker, ...envOverrides.docker },
    kubernetes: { ...defaults.kubernetes, ...envOverrides.kubernetes },
    workflow: { ...defaults.workflow, ...envOverrides.workflow },
    mcp: { ...defaults.mcp, ...(envOverrides.mcp || {}) },
  };
}

/**
 * Create configuration for specific environment
 */
export function createConfigurationForEnv(
  nodeEnv: 'development' | 'production' | 'test',
): ApplicationConfig {
  const config = createConfiguration();
  config.server.nodeEnv = nodeEnv;

  // Apply environment-specific settings
  switch (nodeEnv) {
    case 'development':
      config.server.logLevel = 'debug';
      config.features.enableDebugLogs = true;
      config.features.mockMode = true;
      break;
    case 'production':
      config.server.logLevel = 'info';
      config.features.enableDebugLogs = false;
      config.features.enableMetrics = true;
      break;
    case 'test':
      config.server.logLevel = 'error';
      config.features.mockMode = true;
      config.features.enableEvents = false;
      config.session.store = 'memory';
      break;
  }

  return config;
}

/**
 * Get configuration summary for logging
 */
export function getConfigurationSummary(config: ApplicationConfig): Record<string, unknown> {
  return {
    nodeEnv: config.server.nodeEnv,
    logLevel: config.server.logLevel,
    workflowMode: config.workflow.mode,
    mockMode: config.features.mockMode,
    maxSessions: config.session.maxSessions,
    dockerRegistry: config.docker.registry,
  };
}
