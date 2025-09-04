/**
 * Simplified Configuration Validation
 *
 * Replaces the complex Zod schema system with simple, practical validation.
 */

import type { ApplicationConfig } from './types';

export interface ValidationResult {
  isValid: boolean;
  errors: Array<{ path: string; message: string }>;
  warnings: Array<{ path: string; message: string }>;
}

/**
 * Validate application configuration
 */
export function validateConfig(config: ApplicationConfig): ValidationResult {
  const errors: Array<{ path: string; message: string }> = [];
  const warnings: Array<{ path: string; message: string }> = [];

  // Server validation
  if (!['development', 'production', 'test'].includes(config.server.nodeEnv)) {
    errors.push({ path: 'server.nodeEnv', message: 'Must be development, production, or test' });
  }

  if (!['error', 'warn', 'info', 'debug', 'trace'].includes(config.server.logLevel)) {
    errors.push({ path: 'server.logLevel', message: 'Must be error, warn, info, debug, or trace' });
  }

  if (config.server.port && (config.server.port < 1 ?? config.server.port > 65535)) {
    errors.push({ path: 'server.port', message: 'Must be between 1 and 65535' });
  }

  // Session validation
  if (config.session.maxSessions < 1) {
    errors.push({ path: 'session.maxSessions', message: 'Must be at least 1' });
  }

  if (config.session.maxSessions > 1000) {
    warnings.push({
      path: 'session.maxSessions',
      message: 'Large number of sessions may impact performance'
    });
  }

  // Workflow validation
  if (!['interactive', 'auto', 'batch'].includes(config.workflow.mode)) {
    errors.push({ path: 'workflow.mode', message: 'Must be interactive, auto, or batch' });
  }

  if (config.workflow.maxRetries < 0) {
    errors.push({ path: 'workflow.maxRetries', message: 'Must be 0 or greater' });
  }

  // maxConcurrentTasks property doesn't exist in WorkflowConfig - skipping validation'

  // AI validation
  if (config.features.aiEnabled && !config.aiServices.ai.apiKey && !config.features.mockMode) {
    warnings.push({
      path: 'aiServices.ai.apiKey',
      message: 'AI enabled but no API key provided - consider enabling mock mode'
    });
  }

  if (config.aiServices.ai.maxTokens && config.aiServices.ai.maxTokens < 1) {
    errors.push({ path: 'aiServices.ai.maxTokens', message: 'Must be at least 1' });
  }

  if (
    config.aiServices.ai.temperature &&
    (config.aiServices.ai.temperature < 0 ?? config.aiServices.ai.temperature > 2)
  ) {
    errors.push({ path: 'aiServices.ai.temperature', message: 'Must be between 0 and 2' });
  }

  // Infrastructure validation
  if (!['trivy'].includes(config.infrastructure.scanning.scanner)) {
    errors.push({ path: 'infrastructure.scanning.scanner', message: 'Must be trivy' });
  }

  if (
    !['low', 'medium', 'high', 'critical'].includes(
      config.infrastructure.scanning.severityThreshold
    )
  ) {
    errors.push({
      path: 'infrastructure.scanning.severityThreshold',
      message: 'Must be low, medium, high, or critical'
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate partial configuration (for overrides)
 */
export function validatePartialConfig(config: Partial<ApplicationConfig>): ValidationResult {
  // For partial validation, create a minimal config and merge
  const minimalConfig: ApplicationConfig = {
    server: { nodeEnv: 'development', logLevel: 'info', port: 3000, host: 'localhost' },
    mcp: {
      storePath: './data/sessions.db',
      sessionTTL: '24h',
      maxSessions: 100,
      enableMetrics: false,
      enableEvents: true
    },
    session: {
      store: 'memory',
      ttl: 86400,
      maxSessions: 100,
      persistencePath: './data/sessions.db',
      persistenceInterval: 3600,
      cleanupInterval: 3600
    },
    workspace: { workspaceDir: process.cwd(), tempDir: './tmp', cleanupOnExit: true },
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
        scanner: 'trivy',
        severityThreshold: 'high',
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
        mode: 'auto',
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
        latencyRange: { min: 100, max: 500 }
      }
    },
    logging: {
      level: 'info',
      format: 'pretty',
      destination: 'console',
      filePath: './logs/app.log',
      maxFileSize: '10MB',
      maxFiles: 5,
      enableColors: true
    },
    workflow: {
      mode: 'interactive',
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

  // Deep merge the partial config
  const merged = { ...minimalConfig, ...config };
  return validateConfig(merged);
}
