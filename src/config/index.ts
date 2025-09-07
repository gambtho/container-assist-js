/**
 * Consolidated Configuration - Main Config
 *
 * Single source of configuration replacing 9 separate config files
 * Simple, focused configuration without complex validation overhead
 */

export const config = {
  mcp: {
    name: process.env.MCP_SERVER_NAME || 'containerization-assist',
    version: process.env.MCP_SERVER_VERSION || '1.0.0',
  },

  server: {
    logLevel: process.env.LOG_LEVEL || 'info',
    port: parseInt(process.env.PORT || '3000'),
  },

  workspace: {
    workspaceDir: process.env.WORKSPACE_DIR || process.cwd(),
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'),
  },

  sampling: {
    maxCandidates: parseInt(process.env.MAX_CANDIDATES || '5'),
    timeout: parseInt(process.env.SAMPLING_TIMEOUT || '30000'),
    weights: {
      dockerfile: {
        build: 30,
        size: 30,
        security: 25,
        speed: 15,
      },
      k8s: {
        validation: 20,
        security: 20,
        resources: 20,
        best_practices: 20,
      },
    },
  },

  cache: {
    ttl: parseInt(process.env.CACHE_TTL || '3600'),
    maxSize: parseInt(process.env.CACHE_MAX_SIZE || '100'),
  },

  docker: {
    socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
    timeout: parseInt(process.env.DOCKER_TIMEOUT || '60000'),
  },

  kubernetes: {
    namespace: process.env.K8S_NAMESPACE || 'default',
    timeout: parseInt(process.env.K8S_TIMEOUT || '60000'),
  },

  security: {
    scanTimeout: parseInt(process.env.SCAN_TIMEOUT || '300000'),
    failOnCritical: process.env.FAIL_ON_CRITICAL === 'true',
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },

  orchestrator: {
    defaultCandidates: parseInt(process.env.DEFAULT_CANDIDATES || '3'),
    maxCandidates: parseInt(process.env.MAX_CANDIDATES || '5'),
    earlyStopThreshold: parseInt(process.env.EARLY_STOP_THRESHOLD || '90'),
    tiebreakMargin: parseInt(process.env.TIEBREAK_MARGIN || '5'),

    scanThresholds: {
      critical: parseInt(process.env.SCAN_CRITICAL_THRESHOLD || '0'),
      high: parseInt(process.env.SCAN_HIGH_THRESHOLD || '2'),
      medium: parseInt(process.env.SCAN_MEDIUM_THRESHOLD || '10'),
    },

    buildSizeLimits: {
      sanityFactor: parseFloat(process.env.BUILD_SANITY_FACTOR || '1.25'),
      rejectFactor: parseFloat(process.env.BUILD_REJECT_FACTOR || '2.5'),
    },
  },
} as const;

/**
 * Configuration utilities
 */

export function createConfig(): typeof config {
  return config;
}

export function logConfigSummaryIfDev(logger?: {
  info: (message: string, data?: any) => void;
}): void {
  if (process.env.NODE_ENV === 'development') {
    const configData = {
      logLevel: config.server.logLevel,
      workspace: config.workspace.workspaceDir,
      docker: config.docker.socketPath,
    };

    if (logger) {
      logger.info('Configuration loaded', configData);
    } else {
      // Fallback for cases where logger is not available
      // eslint-disable-next-line no-console
      console.log('Configuration loaded:', configData);
    }
  }
}
