/**
 * Centralized Configuration Defaults
 *
 * Single source of truth for all default values used throughout the application.
 * Eliminates hardcoded values and makes configuration more maintainable.
 */

/**
 * Default ports by programming language/framework
 */
export const DEFAULT_PORTS = {
  javascript: [3000, 8080],
  typescript: [3000, 8080],
  python: [8000, 5000],
  java: [8080, 8081],
  go: [8080, 3000],
  rust: [8080, 3000],
  ruby: [3000, 9292],
  php: [8080, 80],
  csharp: [5000, 5001],
  default: [3000, 8080],
} as const;

/**
 * Default timeout values in milliseconds
 */
export const DEFAULT_TIMEOUTS = {
  cache: 300000, // 5 minutes
  cacheCleanup: 300000, // 5 minutes
  docker: 30000, // 30 seconds
  dockerBuild: 300000, // 5 minutes
  kubernetes: 30000, // 30 seconds
  sampling: 30000, // 30 seconds
  scan: 300000, // 5 minutes
  deployment: 180000, // 3 minutes
  deploymentPoll: 5000, // 5 seconds (between deployment status checks)
  verification: 60000, // 1 minute
  healthCheck: 5000, // 5 seconds (between health checks)
} as const;

/**
 * Default cache configurations
 */
export const DEFAULT_CACHE = {
  defaultTtl: 300000, // 5 minutes
  cleanupInterval: 300000, // 5 minutes
  maxSize: 100,
  maxFileSize: 10485760, // 10MB
} as const;

/**
 * Default session configurations
 */
export const DEFAULT_SESSION = {
  maxSessions: 10,
  sessionTtl: 3600000, // 1 hour
  persistencePath: './data/sessions.db',
} as const;

/**
 * Default server configurations
 */
export const DEFAULT_SERVER = {
  port: 3000,
  host: 'localhost',
  nodeEnv: 'development' as const,
  logLevel: 'info' as const,
} as const;

/**
 * Default Docker configurations
 */
export const DEFAULT_DOCKER = {
  socketPath: '/var/run/docker.sock',
  apiVersion: '1.41',
  buildTimeout: 300000, // 5 minutes
  pushTimeout: 180000, // 3 minutes
  pullTimeout: 180000, // 3 minutes
} as const;

/**
 * Default Kubernetes configurations
 */
export const DEFAULT_KUBERNETES = {
  namespace: 'default',
  context: 'default',
  timeout: 30000, // 30 seconds
  deployTimeout: 180000, // 3 minutes
} as const;

/**
 * Default sampling configurations
 */
export const DEFAULT_SAMPLING = {
  maxCandidates: 5,
  timeout: 30000, // 30 seconds
  maxRetries: 3,
  scoringWeights: {
    security: 0.4,
    performance: 0.3,
    standards: 0.2,
    maintainability: 0.1,
  },
} as const;

/**
 * Default workflow configurations
 */
export const DEFAULT_WORKFLOW = {
  mode: 'interactive' as const,
  maxRetries: 3,
  maxRemediationAttempts: 3,
  remediationThreshold: 0.4,
} as const;

/**
 * Default scanner configurations
 */
export const DEFAULT_SCANNER = {
  scanner: 'trivy' as const,
  severityThreshold: 'high' as const,
  timeout: 300000, // 5 minutes
  enableFixSuggestions: true,
  scanLayers: true,
} as const;

/**
 * Get default port for a given language
 */
export function getDefaultPort(language: string): number {
  const key = language.toLowerCase() as keyof typeof DEFAULT_PORTS;
  const ports = DEFAULT_PORTS[key] || DEFAULT_PORTS.default;
  return ports[0];
}

/**
 * Get all default ports for a given language
 */
export function getDefaultPorts(language: string): readonly number[] {
  const key = language.toLowerCase() as keyof typeof DEFAULT_PORTS;
  return DEFAULT_PORTS[key] || DEFAULT_PORTS.default;
}

/**
 * Parse time string to milliseconds (e.g., '5m', '30s', '1h')
 */
export function parseTimeToMs(time: string): number {
  const match = time.match(/^(\d+)([hms])$/);
  if (!match?.[1] || !match?.[2]) {
    throw new Error(`Invalid time format: ${time}. Use format like '5m', '30s', '1h'`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'h':
      return value * 60 * 60 * 1000;
    case 'm':
      return value * 60 * 1000;
    case 's':
      return value * 1000;
    default:
      throw new Error(`Invalid time unit: ${unit}`);
  }
}

/**
 * Format milliseconds to human-readable string
 */
export function formatMs(ms: number): string {
  if (ms >= 3600000) {
    return `${Math.floor(ms / 3600000)}h`;
  }
  if (ms >= 60000) {
    return `${Math.floor(ms / 60000)}m`;
  }
  if (ms >= 1000) {
    return `${Math.floor(ms / 1000)}s`;
  }
  return `${ms}ms`;
}
