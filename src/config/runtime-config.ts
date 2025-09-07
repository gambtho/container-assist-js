/**
 * Simplified Configuration - De-Enterprise Refactoring
 *
 * Replaces complex configuration hierarchy with flat, simple structure.
 * Single config interface with environment variable loading.
 * Eliminates configuration validation overhead and complex inheritance.
 */

/**
 * Simple, flat configuration interface
 * All optional fields have sensible defaults
 */
interface Config {
  // Server settings
  port: number;
  host: string;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  nodeEnv: 'development' | 'production' | 'test';

  // Docker settings
  dockerSocket: string;
  dockerTimeout: number;

  // Kubernetes settings
  kubeconfig: string;
  kubeNamespace: string;

  // Workflow settings
  mockMode: boolean;
  maxCandidates: number;
  samplingTimeout: number;

  // Scoring thresholds
  dockerfileScoreThreshold: number;
  scanScoreThreshold: number;

  // Build settings
  buildTimeout: number;
  scanTimeout: number;

  // Session settings
  sessionTtl: number;
  maxSessions: number;

  // Scanning settings
  securityScanner: 'trivy' | 'mock';
  severityThreshold: 'low' | 'medium' | 'high' | 'critical';

  // Workspace settings
  workspaceDir: string;
  tempDir: string;
  cleanupOnExit: boolean;

  // Docker container user settings
  dockerUserId: number;
  dockerGroupId: number;

  // AI service settings
  aiResponseSizeLimitMB: number;

  // Cache settings
  cacheTtlMs: number;
  cacheCleanupIntervalMs: number;

  // Retry settings
  retryAttempts: number;
  retryDelayMs: number;
  retryBackoffEnabled: boolean;

  // Scoring weights for environments
  scoringWeights: {
    production: {
      security: number;
      performance: number;
      standards: number;
      maintainability: number;
    };
    development: {
      maintainability: number;
      standards: number;
      performance: number;
      security: number;
    };
    testing: {
      standards: number;
      maintainability: number;
      security: number;
      performance: number;
    };
  };
}

/**
 * Load configuration from environment variables with defaults
 * Simple function - no validation, inheritance, or complex mapping
 */
