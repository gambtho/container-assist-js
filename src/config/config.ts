/**
 * Simplified Configuration System
 *
 * Replaces the over-engineered 7-file configuration system with a simple,
 * maintainable approach using defaults + environment overrides.
 */

import type { ApplicationConfig } from './types';

// Simple environment variable mapping - no complex inheritance
const ENV_MAPPINGS = {
  // Server
  NODE_ENV: { path: 'server.nodeEnv', type: 'string', default: 'development' },
  LOG_LEVEL: { path: 'server.logLevel', type: 'string', default: 'info' },

  // MCP
  MCP_STORE_PATH: { path: 'mcp.storePath', type: 'string', default: './data/sessions.db' },
  SESSION_TTL: { path: 'mcp.sessionTTL', type: 'string', default: '24h' },
  MAX_SESSIONS: { path: 'mcp.maxSessions', type: 'number', default: 100 },

  // Workspace
  WORKSPACE_DIR: { path: 'workspace.workspaceDir', type: 'string', default: process.cwd() },

  // Docker
  DOCKER_SOCKET: {
    path: 'infrastructure.docker.socketPath',
    type: 'string',
    default: '/var/run/docker.sock'
  },
  DOCKER_REGISTRY: { path: 'infrastructure.docker.registry', type: 'string', default: 'docker.io' },

  // Kubernetes
  K8S_NAMESPACE: {
    path: 'infrastructure.kubernetes.namespace',
    type: 'string',
    default: 'default'
  },
  KUBECONFIG: { path: 'infrastructure.kubernetes.kubeconfig', type: 'string', default: '' },

  // AI
  AI_API_KEY: { path: 'aiServices.ai.apiKey', type: 'string', default: '' },
  AI_MODEL: { path: 'aiServices.ai.model', type: 'string', default: 'claude-3-sonnet-20241022' },
  AI_BASE_URL: { path: 'aiServices.ai.baseUrl', type: 'string', default: '' },
  MOCK_MODE: { path: 'features.mockMode', type: 'boolean', default: false }
} as const;

// Base configuration with sensible defaults
const BASE_CONFIG: ApplicationConfig = {
  server: {
    nodeEnv: 'development' as const,
    logLevel: 'info' as const,
    port: 3000,
    host: 'localhost'
  },
  mcp: {
    storePath: './data/sessions.db',
    sessionTTL: '24h',
    maxSessions: 100,
    enableMetrics: false,
    enableEvents: true
  },
  session: {
    store: 'memory' as const,
    ttl: 86400, // 24h in seconds
    maxSessions: 100,
    persistencePath: './data/sessions.db',
    persistenceInterval: 3600, // 1h in seconds
    cleanupInterval: 3600 // 1h in seconds
  },
  workspace: {
    workspaceDir: process.cwd(),
    tempDir: './tmp',
    cleanupOnExit: true
  },
  infrastructure: {
    docker: {
      socketPath: '/var/run/docker.sock',
      registry: 'docker.io',
      host: 'localhost',
      port: 2376,
      timeout: 300000,
      apiVersion: '1.41'
    },
    kubernetes: {
      kubeconfig: '',
      namespace: 'default',
      context: '',
      timeout: 300000,
      dryRun: false
    },
    scanning: {
      enabled: true,
      scanner: 'trivy' as const,
      severityThreshold: 'high' as const,
      failOnVulnerabilities: false,
      skipUpdate: false,
      timeout: 300000
    },
    build: {
      enableCache: true,
      parallel: false,
      maxParallel: 4,
      buildArgs: {},
      labels: {},
      target: '',
      squash: false
    },
    java: {
      defaultVersion: '17',
      defaultJvmHeapPercentage: 75,
      enableNativeImage: false,
      enableJmx: false,
      enableProfiling: false
    }
  },
  aiServices: {
    ai: {
      apiKey: '',
      model: 'claude-3-sonnet-20241022',
      baseUrl: '',
      timeout: 30000,
      retryAttempts: 3,
      retryDelayMs: 1000,
      temperature: 0.1,
      maxTokens: 4096
    },
    sampler: {
      mode: 'auto' as const,
      templateDir: './templates',
      cacheEnabled: true,
      retryAttempts: 3,
      retryDelayMs: 1000
    },
    mock: {
      enabled: false,
      responsesDir: './mock-responses',
      deterministicMode: false,
      simulateLatency: false,
      errorRate: 0,
      latencyRange: {
        min: 100,
        max: 500
      }
    }
  },
  logging: {
    level: 'info' as const,
    format: 'pretty' as const,
    destination: 'console' as const,
    filePath: './logs/app.log',
    maxFileSize: '10MB',
    maxFiles: 5,
    enableColors: true
  },
  workflow: {
    mode: 'interactive' as const,
    autoRetry: true,
    maxRetries: 3,
    retryDelayMs: 5000,
    parallelSteps: false,
    skipOptionalSteps: false
  },
  features: {
    aiEnabled: true,
    mockMode: false,
    enableMetrics: false,
    enableEvents: true,
    enablePerformanceMonitoring: false,
    enableDebugLogs: false,
    enableTracing: false,
    nonInteractive: false
  }
};

// Simple value parsing without over-engineering
function parseValue(value: string, type: string): any {
  switch (type) {
    case 'string':
      return value;
    case 'number':
      const num = Number(value);
      if (isNaN(num)) throw new Error(`Invalid number: ${value}`);
      return num;
    case 'boolean':
      return value.toLowerCase() === 'true';
    default:
      return value;
  }
}

// Simple nested object path setting
function setPath(obj: unknown, path: string, value: unknown): void {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    if (!(key in current)) current[key] = {};
    current = current[key];
  }

  current[keys[keys.length - 1]!] = value;
}

/**
 * Create configuration with environment overrides
 */
export function createConfiguration(): ApplicationConfig {
  // Start with base config
  const config = JSON.parse(JSON.stringify(BASE_CONFIG)) as ApplicationConfig;

  // Apply environment overrides
  for (const [envVar, mapping] of Object.entries(ENV_MAPPINGS)) {
    const value = process.env[envVar];
    if (value !== undefined) {
      try {
        const parsedValue = parseValue(value, mapping.type);
        setPath(config, mapping.path, parsedValue);
      } catch (error) {
        console.warn(`Invalid ${envVar}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  return config;
}

/**
 * Create configuration for specific environment
 */
export function createConfigurationForEnv(
  env: 'development' | 'production' | 'test'
): ApplicationConfig {
  const config = createConfiguration();
  config.server.nodeEnv = env;

  // Environment-specific adjustments
  if (env === 'production') {
    config.server.logLevel = 'info';
    config.features.enableDebugLogs = false;
    config.features.enableMetrics = true;
  } else if (env === 'development') {
    config.server.logLevel = 'debug';
    config.features.enableDebugLogs = true;
    config.features.mockMode = true;
  } else if (env === 'test') {
    config.server.logLevel = 'error';
    config.features.mockMode = true;
    config.features.enableEvents = false;
    config.session.store = 'memory';
  }

  return config;
}

/**
 * Validate configuration (simple checks)
 */
export function validateConfiguration(config: ApplicationConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Basic validation
  if (!['development', 'production', 'test'].includes(config.server.nodeEnv)) {
    errors.push('Invalid NODE_ENV');
  }

  if (!['error', 'warn', 'info', 'debug', 'trace'].includes(config.server.logLevel)) {
    errors.push('Invalid LOG_LEVEL');
  }

  if (config.server.port && (config.server.port < 1 ?? config.server.port > 65535)) {
    errors.push('Invalid server port');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get configuration summary for logging
 */
export function getConfigurationSummary(config: ApplicationConfig): Record<string, any> {
  return {
    nodeEnv: config.server.nodeEnv,
    logLevel: config.server.logLevel,
    workflowMode: config.workflow.mode,
    mockMode: config.features.mockMode,
    aiEnabled: config.features.aiEnabled,
    maxSessions: config.session.maxSessions,
    dockerRegistry: config.infrastructure.docker.registry
  };
}
