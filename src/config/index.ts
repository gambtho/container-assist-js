/**
 * Unified Configuration Module
 * 
 * Main entry point for all configuration functionality.
 * Provides a clean API for creating, validating, and managing application configuration.
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
  ConfigurationOptions,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ConfigurationProfile,
  NodeEnv,
  LogLevel,
  WorkflowMode,
  StoreType,
  SamplerMode
} from './types.js'

// Export factory and utilities
export { ConfigurationFactory, ConfigurationError } from './factory.js'
export { ConfigurationValidator, ApplicationConfigSchema } from './validation.js'
export { EnvironmentParser } from './env-parser.js'

// Export defaults and profiles
export { 
  BASE_CONFIG, 
  DEVELOPMENT_PROFILE, 
  PRODUCTION_PROFILE, 
  TEST_PROFILE, 
  CI_PROFILE,
  CONFIGURATION_PROFILES,
  getProfile 
} from './defaults.js'

// Export environment mapping
export { ENVIRONMENT_MAPPING, LEGACY_ENV_MAPPING } from './env-mapping.js'

// Create and export singleton configuration instance
import { ConfigurationFactory } from './factory.js'

/**
 * Default configuration instance
 * 
 * This is created automatically based on the current environment.
 * Use this for most application needs.
 */
export const config = ConfigurationFactory.createFromEnv()

/**
 * Create configuration with custom options
 * 
 * Use this when you need specific configuration behavior,
 * such as custom profiles or overrides.
 */
export const createConfig = ConfigurationFactory.create.bind(ConfigurationFactory)

/**
 * Create configuration for testing
 * 
 * Provides a configuration suitable for unit tests with minimal overhead.
 */
export const createTestConfig = ConfigurationFactory.createTestConfig.bind(ConfigurationFactory)

/**
 * Create minimal configuration
 * 
 * Provides the absolute minimum configuration needed for basic operation.
 */
export const createMinimalConfig = ConfigurationFactory.createMinimalConfig.bind(ConfigurationFactory)

/**
 * Validate configuration
 * 
 * Validates a configuration object and returns detailed results.
 */
export const validateConfig = ConfigurationFactory.validate.bind(ConfigurationFactory)

/**
 * Get configuration summary
 * 
 * Returns a summary of the configuration suitable for logging.
 */
export const getConfigSummary = ConfigurationFactory.getConfigurationSummary.bind(ConfigurationFactory)

/**
 * Configuration helper functions
 */
export const ConfigHelpers = {
  /**
   * Check if running in production
   */
  isProduction: ConfigurationFactory.isProduction.bind(ConfigurationFactory),

  /**
   * Check if running in development
   */
  isDevelopment: ConfigurationFactory.isDevelopment.bind(ConfigurationFactory),

  /**
   * Check if running in test mode
   */
  isTest: ConfigurationFactory.isTest.bind(ConfigurationFactory),

  /**
   * Check if AI services are available
   */
  hasAI: ConfigurationFactory.hasAIEnabled.bind(ConfigurationFactory),

  /**
   * Parse TTL string to milliseconds
   */
  parseTTL: ConfigurationFactory.parseTTLToMs.bind(ConfigurationFactory),

  /**
   * Convert milliseconds to TTL string
   */
  formatTTL: ConfigurationFactory.msToTTL.bind(ConfigurationFactory),

  /**
   * Get available configuration profiles
   */
  getProfiles: ConfigurationFactory.getAvailableProfiles.bind(ConfigurationFactory),

  /**
   * Get environment variable documentation
   */
  getEnvDocs: ConfigurationFactory.getEnvironmentDocumentation.bind(ConfigurationFactory),

  /**
   * Merge two configurations
   */
  merge: ConfigurationFactory.mergeConfigurations.bind(ConfigurationFactory)
}

// Development helper: log configuration summary on startup
if (config.server.nodeEnv === 'development' && config.features.enableDebugLogs) {
  console.log('Configuration loaded:', getConfigSummary(config))
}