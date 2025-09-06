/**
 * Unified Configuration Module
 */

// Export essential types only
export type { ApplicationConfig } from './types';

// Import configuration
import { createConfiguration, getConfigurationSummary } from './config';
import { ConfigHelpers } from './validation';
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
 * Reset the configuration instance (for testing)
 */
export function resetConfig(): void {
  _config = undefined;
}

/**
 * Create minimal configuration (alias for createTestConfig)
 */
export function createMinimalConfig(): ApplicationConfig {
  return createTestConfig();
}

/**
 * Get configuration summary (alias for getConfigurationSummary)
 */
export function getConfigSummary(configInstance: ApplicationConfig): Record<string, unknown> {
  return getConfigurationSummary(configInstance);
}

/**
 * Export configuration helpers
 */
export { ConfigHelpers };
