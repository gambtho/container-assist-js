/**
 * Unified Configuration Module
 */

// Export essential types only (removed unused configuration type exports)
export type {
  ApplicationConfig,
  // Note: Individual config types removed as they were unused
  // If specific config types are needed, import directly from './types'
} from './types';

// Export essential configuration functions only
export { createConfiguration, createConfigurationForEnv } from './config';

// Import configuration
import { createConfiguration, getConfigurationSummary } from './config';
import type { ApplicationConfig } from './types';

/**
 * Lazy-loaded configuration instance
 * Configuration is only created when first accessed
 */
let _config: ApplicationConfig | undefined;

/**
 * Get the default configuration instance
 *
 * This is created lazily on first access based on the current environment.
 * Use this for most application needs.
 */
export function getConfig(): ApplicationConfig {
  if (!_config) {
    _config = createConfiguration();
  }
  return _config;
}

// Note: resetConfig function removed as unused

export const config = new Proxy({} as ApplicationConfig, {
  get(_target, prop) {
    return getConfig()[prop as keyof ApplicationConfig];
  },
  set(_target, prop, value) {
    (getConfig() as unknown as Record<string, unknown>)[prop as keyof ApplicationConfig] = value;
    return true;
  },
});

/**
 * Create configuration with defaults (used by CLI)
 */
export const createConfig = createConfiguration;

/**
 * Development helper: log configuration summary on startup (used by CLI)
 */
export function logConfigSummaryIfDev(configInstance: ApplicationConfig): void {
  if (configInstance.server.nodeEnv === 'development' && configInstance.features.enableDebugLogs) {
    // eslint-disable-next-line no-console
    console.log('Configuration loaded:', getConfigurationSummary(configInstance));
  }
}

/**
 * Reset lazy-loaded configuration instance
 */
export function resetConfig(): void {
  _config = undefined;
}

/**
 * Create test configuration with test-specific defaults
 */
export function createTestConfig(): ApplicationConfig {
  const config = createConfiguration();
  config.server.nodeEnv = 'test';
  config.server.logLevel = 'error';
  config.features.mockMode = true;
  config.features.enableEvents = false;
  config.session.store = 'memory';
  return config;
}

/**
 * Create minimal configuration (currently same as test)
 */
export function createMinimalConfig(): ApplicationConfig {
  return createTestConfig();
}

/**
 * Get configuration summary
 */
export function getConfigSummary(config: ApplicationConfig): object {
  return getConfigurationSummary(config);
}

/**
 * Configuration helper utilities
 */
export const ConfigHelpers = {
  isProduction(config: ApplicationConfig): boolean {
    return config.server.nodeEnv === 'production';
  },

  isDevelopment(config: ApplicationConfig): boolean {
    return config.server.nodeEnv === 'development';
  },

  isTest(config: ApplicationConfig): boolean {
    return config.server.nodeEnv === 'test';
  },

  hasAI(config: ApplicationConfig): boolean {
    return (
      config.features.aiEnabled && (config.aiServices.ai.apiKey !== '' || config.features.mockMode)
    );
  },

  parseTTL(ttl: string): number {
    const match = ttl.match(/^(\d+)([hms])$/);
    if (!match) {
      throw new Error(`Invalid TTL format: ${ttl}`);
    }

    const [, amount, unit] = match;
    const value = parseInt(amount || '0', 10);

    switch (unit) {
      case 'h':
        return value * 3600000; // hours to milliseconds
      case 'm':
        return value * 60000; // minutes to milliseconds
      case 's':
        return value * 1000; // seconds to milliseconds
      default:
        throw new Error(`Invalid TTL format: ${ttl}`);
    }
  },
};
