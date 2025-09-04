/**
 * Unified Configuration Module
 */

// Export all types
export type {
  ApplicationConfig,
  ServerConfig,
  McpConfig,
  WorkspaceConfig,
  DockerConfig,
  KubernetesConfig,
  AIConfig,
  SamplerConfig,
  MockConfig,
  SessionConfig,
  LoggingConfig,
  ScanningConfig,
  BuildConfig,
  JavaConfig,
  InfrastructureConfig,
  AIServicesConfig,
  WorkflowConfig,
  FeatureFlags,
  NodeEnv,
  LogLevel,
  WorkflowMode,
  StoreType,
  SamplerMode
} from './types';

// Export configuration functions
export {
  createConfiguration,
  createConfigurationForEnv,
  validateConfiguration,
  getConfigurationSummary
} from './config';

// Import configuration
import { createConfiguration, createConfigurationForEnv, getConfigurationSummary } from './config';
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

/**
 * Reset configuration (mainly for testing)
 */
export function resetConfig(): void {
  _config = undefined;
}

export const config = new Proxy({} as ApplicationConfig, {
  get(_target, prop) {
    return getConfig()[prop as keyof ApplicationConfig];
  },
  set(_target, prop, value) {
    getConfig()[prop as keyof ApplicationConfig] = value;
    return true;
  }
});

/**
 * Create configuration with defaults
 */
export const createConfig = createConfiguration;

/**
 * Create configuration for testing
 */
export const createTestConfig = (): ApplicationConfig => createConfigurationForEnv('test');

/**
 * Create minimal configuration
 */
export const createMinimalConfig = (): ApplicationConfig => createConfigurationForEnv('test');

/**
 * Get configuration summary
 */
export const getConfigSummary = getConfigurationSummary;

/**
 * Development helper: log configuration summary on startup
 * This is moved to be called explicitly in CLI to avoid side effects during import
 *
 * Usage: logConfigSummaryIfDev(config)
 */
export function logConfigSummaryIfDev(configInstance: ApplicationConfig): void {
  if (configInstance.server.nodeEnv === 'development' && configInstance.features.enableDebugLogs) {
    console.log('Configuration loaded:', getConfigurationSummary(configInstance));
  }
}

/**
 * Configuration helper functions
 */
export const ConfigHelpers = {
  /**
   * Check if running in production
   */
  isProduction: (config: ApplicationConfig) => config.server.nodeEnv === 'production',

  /**
   * Check if running in development
   */
  isDevelopment: (config: ApplicationConfig) => config.server.nodeEnv === 'development',

  /**
   * Check if running in test mode
   */
  isTest: (config: ApplicationConfig) => config.server.nodeEnv === 'test',

  /**
   * Check if AI services are available
   */
  hasAI: (config: ApplicationConfig) =>
    config.features.aiEnabled && (config.aiServices.ai.apiKey != null ?? config.features.mockMode),

  /**
   * Parse TTL string to milliseconds
   */
  parseTTL: (ttl: string) => {
    const match = ttl.match(/^(\d+)(h|m|s)$/);
    if (!match) throw new Error(`Invalid TTL format: ${ttl}`);
    const [, value, unit] = match;
    if (!value) throw new Error(`Invalid TTL format: ${ttl}`);
    const num = parseInt(value, 10);
    return unit === 'h' ? num * 3600000 : unit === 'm' ? num * 60000 : num * 1000;
  }
};
