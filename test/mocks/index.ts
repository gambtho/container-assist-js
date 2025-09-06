/**
 * Mock implementations for MCP core infrastructure
 *
 * These mocks enable other teams to develop independently without
 * waiting for Team Alpha's infrastructure to be complete.
 *
 * Usage:
 * - Import specific mocks for targeted testing
 * - Use factory functions for consistent mock creation
 * - Configure behavior for different test scenarios
 */

export {
  MockResourceManager,
  createMockResourceManager,
} from './resource-manager.mock.js';

export {
  MockProgressNotifier,
  createMockProgressNotifier,
} from './progress-notifier.mock.js';

export {
  MOCK_CONFIG_PRESETS,
  getMockConfig,
  createMockConfig,
  getTeamAlphaConfig,
  getTeamBetaConfig,
  getTeamGammaConfig,
  getTeamDeltaConfig,
  getTeamEpsilonConfig,
  validateMockConfig,
} from './mcp-config.mock.js';

export type { MockConfigPreset } from './mcp-config.mock.js';

/**
 * Complete mock setup for all core MCP infrastructure
 * Useful for integration testing and full workflow simulation
 */
export function createMockMCPInfrastructure(preset: 'fast' | 'development' | 'minimal' | 'stress' = 'development'): {
  config: any;
  resourceManager: any;
  progressNotifier: any;
} {
  const config = getMockConfig(preset);
  const resourceManager = createMockResourceManager({
    maxSize: config.resources.maxSize,
    defaultTtl: config.resources.defaultTtl,
    simulateLatency: preset === 'stress',
    failureRate: preset === 'stress' ? 0.02 : 0, // 2% failure rate for stress testing
  });

  const progressNotifier = createMockProgressNotifier({
    logEvents: preset !== 'minimal',
    maxEvents: preset === 'stress' ? 10000 : 1000,
    simulateDelay: preset === 'stress',
  });

  return {
    config,
    resourceManager,
    progressNotifier,
  };
}

/**
 * Team-specific mock setups
 */
export const TeamMocks = {
  Alpha: () => createMockMCPInfrastructure('development'),
  Beta: () => {
    const mocks = createMockMCPInfrastructure('development');
    return {
      ...mocks,
      config: getTeamBetaConfig(),
    };
  },
  Gamma: () => {
    const mocks = createMockMCPInfrastructure('fast'); // Fast for test automation
    return {
      ...mocks,
      config: getTeamGammaConfig(),
    };
  },
  Delta: () => {
    const mocks = createMockMCPInfrastructure('development');
    return {
      ...mocks,
      config: getTeamDeltaConfig(),
    };
  },
  Epsilon: () => {
    const mocks = createMockMCPInfrastructure('development');
    return {
      ...mocks,
      config: getTeamEpsilonConfig(),
    };
  },
} as const;

/**
 * Environment-based mock selection
 * Automatically chooses appropriate mocks based on NODE_ENV
 */
export function createEnvironmentMocks(): {
  config: any;
  resourceManager: any;
  progressNotifier: any;
} {
  const env = process.env.NODE_ENV || 'development';

  switch (env) {
    case 'test':
      return createMockMCPInfrastructure('fast');
    case 'development':
      return createMockMCPInfrastructure('development');
    case 'production':
      // In production, return minimal mocks for fallback scenarios
      return createMockMCPInfrastructure('minimal');
    default:
      return createMockMCPInfrastructure('development');
  }
}

/**
 * Mock utilities for testing
 */
export const MockUtils = {
  /**
   * Wait for mock operations to complete (useful for async testing)
   */
  async waitForOperations(ms: number = 100): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Create a test scenario with predictable mock behavior
   */
  createTestScenario(name: string, config: {
    resourceFailureRate?: number;
    progressLatency?: boolean;
    maxResources?: number;
  } = {}) {
    return {
      name,
      resourceManager: createMockResourceManager({
        failureRate: config.resourceFailureRate || 0,
        maxSize: config.maxResources || 1024 * 1024,
      }),
      progressNotifier: createMockProgressNotifier({
        simulateDelay: config.progressLatency || false,
        logEvents: false, // Quiet for test scenarios
      }),
      config: getMockConfig('fast'),
    };
  },
};

/**
 * Type guards for mock identification
 */
export function isMockResourceManager(manager: any): manager is MockResourceManager {
  return manager && typeof manager.getResourceCount === 'function';
}

export function isMockProgressNotifier(notifier: any): notifier is MockProgressNotifier {
  return notifier && typeof notifier.getStats === 'function';
}
