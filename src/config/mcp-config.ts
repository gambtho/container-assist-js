import { Result, Success, Failure } from '../domain/types/result.js';

/**
 * Configuration for MCP-specific features
 */
export interface MCPConfig {
  // Resource management
  resources: {
    maxSize: number;
    defaultTtl: number;
    cacheDir: string;
    enableCompression: boolean;
  };

  // Sampling configuration (for Team Beta)
  sampling: {
    maxCandidates: number;
    defaultCandidates: number;
    scoringWeights: {
      buildSpeed: number;
      imageSize: number;
      security: number;
      maintainability: number;
      performance: number;
    };
    cacheTTL: number;
    enableDeterministicScoring: boolean;
  };

  // Progress notifications
  progress: {
    enableNotifications: boolean;
    batchSize: number;
    flushInterval: number;
    retainHistory: boolean;
    historyTTL: number;
  };

  // Tool configuration (for Team Delta)
  tools: {
    enableResourceLinks: boolean;
    maxToolResponse: number;
    timeoutMs: number;
    retryAttempts: number;
    enableDynamicEnablement: boolean;
  };

  // Testing configuration (for Team Gamma)
  testing: {
    enableInspector: boolean;
    benchmarkSamples: number;
    performanceThresholds: {
      toolResponse: number;
      candidateGeneration: number;
      endToEndWorkflow: number;
    };
    enableRegressionDetection: boolean;
  };

  // Integration configuration (for Team Epsilon)
  integration: {
    enableOrchestration: boolean;
    maxConcurrentOperations: number;
    workflowTimeout: number;
    enableDeploymentVerification: boolean;
    verificationTimeout: number;
  };
}

/**
 * Default MCP configuration
 */
export const DEFAULT_MCP_CONFIG: MCPConfig = {
  resources: {
    maxSize: 5 * 1024 * 1024, // 5MB
    defaultTtl: 3600000, // 1 hour
    cacheDir: './cache/mcp',
    enableCompression: true,
  },

  sampling: {
    maxCandidates: 5,
    defaultCandidates: 3,
    scoringWeights: {
      buildSpeed: 0.25,
      imageSize: 0.2,
      security: 0.3,
      maintainability: 0.15,
      performance: 0.1,
    },
    cacheTTL: 1800000, // 30 minutes
    enableDeterministicScoring: true,
  },

  progress: {
    enableNotifications: true,
    batchSize: 10,
    flushInterval: 1000,
    retainHistory: true,
    historyTTL: 86400000, // 24 hours
  },

  tools: {
    enableResourceLinks: true,
    maxToolResponse: 1024 * 1024, // 1MB
    timeoutMs: 300000, // 5 minutes
    retryAttempts: 2,
    enableDynamicEnablement: true,
  },

  testing: {
    enableInspector: false,
    benchmarkSamples: 10,
    performanceThresholds: {
      toolResponse: 100, // ms
      candidateGeneration: 30000, // 30s
      endToEndWorkflow: 300000, // 5 minutes
    },
    enableRegressionDetection: true,
  },

  integration: {
    enableOrchestration: true,
    maxConcurrentOperations: 5,
    workflowTimeout: 1800000, // 30 minutes
    enableDeploymentVerification: true,
    verificationTimeout: 600000, // 10 minutes
  },
};

/**
 * Environment variable mappings for configuration overrides
 */
const ENV_MAPPINGS = {
  // Resources
  MCP_RESOURCE_MAX_SIZE: ['resources', 'maxSize'],
  MCP_RESOURCE_TTL: ['resources', 'defaultTtl'],
  MCP_CACHE_DIR: ['resources', 'cacheDir'],

  // Sampling
  MCP_MAX_CANDIDATES: ['sampling', 'maxCandidates'],
  MCP_DEFAULT_CANDIDATES: ['sampling', 'defaultCandidates'],
  MCP_SAMPLING_CACHE_TTL: ['sampling', 'cacheTTL'],

  // Scoring weights
  MCP_WEIGHT_BUILD_SPEED: ['sampling', 'scoringWeights', 'buildSpeed'],
  MCP_WEIGHT_IMAGE_SIZE: ['sampling', 'scoringWeights', 'imageSize'],
  MCP_WEIGHT_SECURITY: ['sampling', 'scoringWeights', 'security'],
  MCP_WEIGHT_MAINTAINABILITY: ['sampling', 'scoringWeights', 'maintainability'],
  MCP_WEIGHT_PERFORMANCE: ['sampling', 'scoringWeights', 'performance'],

  // Tools
  MCP_TOOL_TIMEOUT: ['tools', 'timeoutMs'],
  MCP_TOOL_RETRY_ATTEMPTS: ['tools', 'retryAttempts'],
  MCP_MAX_TOOL_RESPONSE: ['tools', 'maxToolResponse'],

  // Testing
  MCP_BENCHMARK_SAMPLES: ['testing', 'benchmarkSamples'],
  MCP_TOOL_RESPONSE_THRESHOLD: ['testing', 'performanceThresholds', 'toolResponse'],
  MCP_CANDIDATE_THRESHOLD: ['testing', 'performanceThresholds', 'candidateGeneration'],
  MCP_WORKFLOW_THRESHOLD: ['testing', 'performanceThresholds', 'endToEndWorkflow'],

  // Integration
  MCP_MAX_CONCURRENT_OPS: ['integration', 'maxConcurrentOperations'],
  MCP_WORKFLOW_TIMEOUT: ['integration', 'workflowTimeout'],
  MCP_VERIFICATION_TIMEOUT: ['integration', 'verificationTimeout'],
} as const;

/**
 * Load MCP configuration with environment variable overrides
 */
export function loadMCPConfig(): Result<MCPConfig> {
  try {
    const config = JSON.parse(JSON.stringify(DEFAULT_MCP_CONFIG)) as MCPConfig;

    // Apply environment variable overrides
    for (const [envVar, path] of Object.entries(ENV_MAPPINGS)) {
      const value = process.env[envVar];
      if (value !== undefined) {
        const result = applyConfigOverride(config, path, value);
        if (!result.success) {
          return Failure(`Invalid config override for ${envVar}: ${result.error}`);
        }
      }
    }

    // Validate configuration
    const validationResult = validateMCPConfig(config);
    if (!validationResult.success) {
      return Failure(`Invalid MCP configuration: ${validationResult.error}`);
    }

    return Success(config);
  } catch (error) {
    return Failure(`Failed to load MCP configuration: ${error.message}`);
  }
}

/**
 * Apply a configuration override from an environment variable
 */
function applyConfigOverride(config: any, path: string[], value: string): Result<void> {
  try {
    let target = config;

    // Navigate to the target property
    for (let i = 0; i < path.length - 1; i++) {
      target = target[path[i]];
      if (!target) {
        return Failure(`Invalid config path: ${path.join('.')}`);
      }
    }

    const finalKey = path[path.length - 1];
    const currentValue = target[finalKey];

    // Parse value based on current type
    let parsedValue: any;
    if (typeof currentValue === 'number') {
      parsedValue = parseFloat(value);
      if (isNaN(parsedValue)) {
        return Failure(`Expected number, got: ${value}`);
      }
    } else if (typeof currentValue === 'boolean') {
      parsedValue = value.toLowerCase() === 'true';
    } else {
      parsedValue = value;
    }

    target[finalKey] = parsedValue;
    return Success(undefined);
  } catch (error) {
    return Failure(`Failed to apply config override: ${error.message}`);
  }
}

/**
 * Validate MCP configuration
 */
function validateMCPConfig(config: MCPConfig): Result<void> {
  try {
    // Validate resource limits
    if (config.resources.maxSize <= 0) {
      return Failure('Resource maxSize must be positive');
    }

    if (config.resources.defaultTtl < 0) {
      return Failure('Resource defaultTtl must be non-negative');
    }

    // Validate sampling configuration
    if (config.sampling.maxCandidates <= 0) {
      return Failure('Sampling maxCandidates must be positive');
    }

    if (config.sampling.defaultCandidates > config.sampling.maxCandidates) {
      return Failure('Sampling defaultCandidates cannot exceed maxCandidates');
    }

    // Validate scoring weights sum to 1.0 (approximately)
    const weights = config.sampling.scoringWeights;
    const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      return Failure(`Scoring weights must sum to 1.0, got: ${totalWeight}`);
    }

    // Validate timeouts
    if (config.tools.timeoutMs <= 0) {
      return Failure('Tool timeoutMs must be positive');
    }

    if (config.integration.workflowTimeout <= 0) {
      return Failure('Workflow timeout must be positive');
    }

    // Validate performance thresholds
    const thresholds = config.testing.performanceThresholds;
    if (
      thresholds.toolResponse <= 0 ||
      thresholds.candidateGeneration <= 0 ||
      thresholds.endToEndWorkflow <= 0
    ) {
      return Failure('Performance thresholds must be positive');
    }

    return Success(undefined);
  } catch (error) {
    return Failure(`Configuration validation failed: ${error.message}`);
  }
}

/**
 * Get configuration section for a specific team
 */
export function getTeamConfig<K extends keyof MCPConfig>(config: MCPConfig, team: K): MCPConfig[K] {
  return config[team];
}

/**
 * Create a minimal configuration for testing
 */
export function createTestConfig(overrides: Partial<MCPConfig> = {}): MCPConfig {
  return {
    ...DEFAULT_MCP_CONFIG,
    resources: {
      ...DEFAULT_MCP_CONFIG.resources,
      maxSize: 1024 * 1024, // 1MB for tests
      defaultTtl: 60000, // 1 minute for tests
      ...overrides.resources,
    },
    sampling: {
      ...DEFAULT_MCP_CONFIG.sampling,
      maxCandidates: 3, // Smaller for faster tests
      defaultCandidates: 2,
      cacheTTL: 30000, // 30 seconds for tests
      ...overrides.sampling,
    },
    ...overrides,
  };
}
