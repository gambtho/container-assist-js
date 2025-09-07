/**
 * Application configuration with environment overrides
 */

import type { ApplicationConfig } from './types';

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
function createConfiguration(): ApplicationConfig {
  const defaultConfig = createDefaultConfig();
  // Environment mapping is currently disabled - returns default configuration
  return defaultConfig;
}

export { createDefaultConfig, createConfiguration };
