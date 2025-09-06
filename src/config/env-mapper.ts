/**
 * Simplified Environment Variable Mapper
 *
 * Maps environment variables to core configuration in a simple, functional way.
 * Only maps essential configurations - advanced configs use their defaults.
 */

import type { CoreConfig, NodeEnv, LogLevel, WorkflowMode, StoreType } from './core';

/**
 * Parse integer with default value and error handling
 */
function parseIntWithDefault(
  value: string | undefined,
  defaultValue: number,
  envVarName: string,
): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    console.warn(`Invalid ${envVarName}: '${value}'. Using default: ${defaultValue}`);
    return defaultValue;
  }
  return parsed;
}

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
      mockMode: process.env.MOCK_MODE?.toLowerCase() === 'true',
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

    mcp: {
      storePath: process.env.MCP_STORE_PATH ?? './data/sessions.db',
      sessionTTL: process.env.SESSION_TTL ?? '24h',
      maxSessions: parseIntWithDefault(process.env.MAX_SESSIONS, 100, 'MAX_SESSIONS'),
      enableMetrics: process.env.MCP_ENABLE_METRICS !== 'false',
      enableEvents: process.env.MCP_ENABLE_EVENTS !== 'false',
    },
  };
}
