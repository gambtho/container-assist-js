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
export interface Config {
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
}

/**
 * Load configuration from environment variables with defaults
 * Simple function - no validation, inheritance, or complex mapping
 */
export const loadConfig = (): Config => {
  return {
    // Server settings
    port: Number(process.env.PORT) || 3000,
    host: process.env.HOST || 'localhost',
    logLevel: (process.env.LOG_LEVEL as Config['logLevel']) || 'info',
    nodeEnv: (process.env.NODE_ENV as Config['nodeEnv']) || 'development',

    // Docker settings
    dockerSocket: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
    dockerTimeout: Number(process.env.DOCKER_TIMEOUT) || 60000,

    // Kubernetes settings
    kubeconfig: process.env.KUBECONFIG || '~/.kube/config',
    kubeNamespace: process.env.KUBE_NAMESPACE || 'default',

    // Workflow settings
    mockMode: process.env.NODE_ENV === 'test' || process.env.MOCK_MODE === 'true',
    maxCandidates: Number(process.env.MAX_CANDIDATES) || 5,
    samplingTimeout: Number(process.env.SAMPLING_TIMEOUT) || 30000,

    // Scoring thresholds
    dockerfileScoreThreshold: Number(process.env.DOCKERFILE_SCORE_THRESHOLD) || 70,
    scanScoreThreshold: Number(process.env.SCAN_SCORE_THRESHOLD) || 50,

    // Build settings
    buildTimeout: Number(process.env.BUILD_TIMEOUT) || 300000, // 5 minutes
    scanTimeout: Number(process.env.SCAN_TIMEOUT) || 180000,   // 3 minutes

    // Session settings
    sessionTtl: Number(process.env.SESSION_TTL) || 86400, // 24 hours
    maxSessions: Number(process.env.MAX_SESSIONS) || 1000,

    // Scanning settings
    securityScanner: (process.env.SECURITY_SCANNER as Config['securityScanner']) || 'trivy',
    severityThreshold: (process.env.SEVERITY_THRESHOLD as Config['severityThreshold']) || 'high',

    // Workspace settings
    workspaceDir: process.env.WORKSPACE_DIR || process.cwd(),
    tempDir: process.env.TEMP_DIR || '/tmp',
    cleanupOnExit: process.env.CLEANUP_ON_EXIT !== 'false',
  };
};

/**
 * Get configuration instance
 * Simple singleton pattern - no complex factory or dependency injection
 */
let configInstance: Config | null = null;

export const getConfig = (): Config => {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
};

/**
 * Reset configuration (useful for testing)
 */
export const resetConfig = (): void => {
  configInstance = null;
};

/**
 * Check if running in production mode
 */
export const isProduction = (): boolean => {
  return getConfig().nodeEnv === 'production';
};

/**
 * Check if running in test mode
 */
export const isTest = (): boolean => {
  return getConfig().nodeEnv === 'test';
};

/**
 * Check if running in development mode
 */
export const isDevelopment = (): boolean => {
  return getConfig().nodeEnv === 'development';
};
