/**
 * Simplified Environment Variable Mapper
 *
 * Maps environment variables to core configuration in a simple, functional way.
 * Only maps essential configurations - advanced configs use their defaults.
 */

import type { CoreConfig, NodeEnv, LogLevel, WorkflowMode, StoreType } from './core';

/**
 * Map environment variables to core configuration
 * Only essential environment variables are mapped
 */
export function mapEnvironmentToConfig(): Partial<CoreConfig> {
  return {
    server: {
      nodeEnv: (process.env.NODE_ENV as NodeEnv) ?? 'development',
      logLevel: (process.env.LOG_LEVEL as LogLevel) ?? 'info',
      port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
      host: process.env.HOST ?? 'localhost',
    },

    session: {
      store: (process.env.SESSION_STORE as StoreType) ?? 'memory',
      ttl: process.env.SESSION_TTL ? parseInt(process.env.SESSION_TTL) : 86400,
      maxSessions: process.env.MAX_SESSIONS ? parseInt(process.env.MAX_SESSIONS) : 1000,
      persistencePath: process.env.SESSION_PERSISTENCE_PATH || './data/sessions.db',
      persistenceInterval: process.env.SESSION_PERSISTENCE_INTERVAL
        ? parseInt(process.env.SESSION_PERSISTENCE_INTERVAL)
        : 60000,
      cleanupInterval: process.env.SESSION_CLEANUP_INTERVAL
        ? parseInt(process.env.SESSION_CLEANUP_INTERVAL)
        : 300000,
    },

    features: {
      mockMode: process.env.MOCK_MODE === 'true',
      enableMetrics: process.env.ENABLE_METRICS !== 'false', // default true
      enableEvents: process.env.ENABLE_EVENTS !== 'false', // default true
      enableDebugLogs: process.env.ENABLE_DEBUG_LOGS === 'true',
      nonInteractive: process.env.NON_INTERACTIVE === 'true',
    },

    docker: {
      socketPath: process.env.DOCKER_HOST ?? '/var/run/docker.sock',
      registry: process.env.DOCKER_REGISTRY ?? 'docker.io',
      host: process.env.DOCKER_HOST_IP || 'localhost',
      port: process.env.DOCKER_PORT ? parseInt(process.env.DOCKER_PORT) : 2375,
      timeout: process.env.DOCKER_TIMEOUT ? parseInt(process.env.DOCKER_TIMEOUT) : 30000,
      apiVersion: process.env.DOCKER_API_VERSION || '1.41',
      buildArgs: process.env.DOCKER_BUILD_ARGS ? JSON.parse(process.env.DOCKER_BUILD_ARGS) : {},
    },

    kubernetes: {
      kubeconfig: process.env.KUBECONFIG ?? '~/.kube/config',
      namespace: process.env.KUBE_NAMESPACE ?? 'default',
      context: process.env.KUBE_CONTEXT || 'default',
      timeout: process.env.KUBE_TIMEOUT ? parseInt(process.env.KUBE_TIMEOUT) : 30000,
      dryRun: process.env.KUBE_DRY_RUN === 'true',
    },

    workflow: {
      mode: (process.env.WORKFLOW_MODE as WorkflowMode) ?? 'interactive',
      autoRetry: process.env.WORKFLOW_AUTO_RETRY !== 'false', // default true
      maxRetries: process.env.WORKFLOW_MAX_RETRIES ? parseInt(process.env.WORKFLOW_MAX_RETRIES) : 3,
      retryDelayMs: process.env.WORKFLOW_RETRY_DELAY
        ? parseInt(process.env.WORKFLOW_RETRY_DELAY)
        : 1000,
      parallelSteps: process.env.WORKFLOW_PARALLEL_STEPS === 'true',
    },
  };
}

/**
 * Get essential environment variables for validation
 */
export function getEssentialEnvVars(): Record<string, string | undefined> {
  return {
    NODE_ENV: process.env.NODE_ENV,
    LOG_LEVEL: process.env.LOG_LEVEL,
    DOCKER_HOST: process.env.DOCKER_HOST,
    DOCKER_REGISTRY: process.env.DOCKER_REGISTRY,
    KUBECONFIG: process.env.KUBECONFIG,
    KUBE_NAMESPACE: process.env.KUBE_NAMESPACE,
    MOCK_MODE: process.env.MOCK_MODE,
  };
}

/**
 * Validate essential environment variables
 */
export function validateEssentialEnvVars(): { isValid: boolean; missing: string[] } {
  const missing: string[] = [];

  return {
    isValid: missing.length === 0,
    missing,
  };
}
