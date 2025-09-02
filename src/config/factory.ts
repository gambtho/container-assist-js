/**
 * Configuration Factory
 * 
 * Creates and validates application configuration from multiple sources:
 * - Default values
 * - Environment variables  
 * - Profile-specific overrides
 * - Manual overrides
 */

// Use a simple merge function instead of lodash
function deepMerge(target: any, source: any): any {
  if (source === null || typeof source !== 'object') {
    return source
  }
  
  if (Array.isArray(source)) {
    return source
  }
  
  const result = { ...target }
  
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = deepMerge(target[key] || {}, source[key])
      } else {
        result[key] = source[key]
      }
    }
  }
  
  return result
}
import type { 
  ApplicationConfig, 
  ConfigurationOptions, 
  ValidationResult,
  ConfigurationProfile
} from './types.js'
import { BASE_CONFIG, getProfile, CONFIGURATION_PROFILES } from './defaults.js'
import { EnvironmentParser } from './env-parser.js'
import { ConfigurationValidator } from './validation.js'

export class ConfigurationFactory {
  private static validator = new ConfigurationValidator()
  private static envParser = new EnvironmentParser()

  /**
   * Create application configuration
   */
  static create(options: ConfigurationOptions = {}): ApplicationConfig {
    const {
      profile = process.env.NODE_ENV || 'development',
      overrides = {},
      validateOnCreate = true
    } = options

    // Start with base configuration
    let config = { ...BASE_CONFIG }

    // Apply profile-specific configuration
    const profileConfig = this.getProfileConfig(profile)
    if (profileConfig) {
      config = deepMerge(config, profileConfig)
    }

    // Parse environment variables
    const envResult = this.envParser.parse()
    if (envResult.errors.length > 0) {
      throw new ConfigurationError(
        'Environment variable parsing failed',
        envResult.errors
      )
    }

    // Apply environment configuration
    config = deepMerge(config, envResult.config)

    // Apply manual overrides
    config = deepMerge(config, overrides)

    // Log warnings from environment parsing
    if (envResult.warnings.length > 0) {
      console.warn('Configuration warnings:')
      envResult.warnings.forEach(warning => console.warn(`- ${warning}`))
    }

    // Validate configuration if requested
    if (validateOnCreate) {
      const validation = this.validator.validate(config)
      if (!validation.isValid) {
        throw new ConfigurationError(
          'Configuration validation failed',
          validation.errors.map(e => `${e.path}: ${e.message}`)
        )
      }

      // Log validation warnings
      if (validation.warnings.length > 0) {
        console.warn('Configuration validation warnings:')
        validation.warnings.forEach(warning => {
          console.warn(`- ${warning.path}: ${warning.message}`)
          if (warning.suggestion) {
            console.warn(`  Suggestion: ${warning.suggestion}`)
          }
        })
      }
    }

    return config as ApplicationConfig
  }

  /**
   * Create configuration from environment variables only
   */
  static createFromEnv(validateOnCreate = true): ApplicationConfig {
    return this.create({
      profile: process.env.NODE_ENV || 'development',
      validateOnCreate
    })
  }

  /**
   * Create configuration with specific profile
   */
  static createWithProfile(
    profileName: string, 
    overrides: Partial<ApplicationConfig> = {}
  ): ApplicationConfig {
    return this.create({
      profile: profileName,
      overrides,
      validateOnCreate: true
    })
  }

  /**
   * Validate configuration without creating it
   */
  static validate(config: ApplicationConfig): ValidationResult {
    return this.validator.validate(config)
  }

  /**
   * Validate partial configuration (useful for testing overrides)
   */
  static validatePartial(partialConfig: Partial<ApplicationConfig>): ValidationResult {
    return this.validator.validatePartial(partialConfig)
  }

  /**
   * Get profile configuration
   */
  private static getProfileConfig(profileName: string): any | null {
    const profile = getProfile(profileName)
    return profile?.config || null
  }

  /**
   * Merge configurations with deep merge
   */
  static mergeConfigurations(
    base: ApplicationConfig,
    override: Partial<ApplicationConfig>
  ): ApplicationConfig {
    return deepMerge({}, deepMerge(base, override))
  }

  /**
   * Get list of available profiles
   */
  static getAvailableProfiles(): string[] {
    return Object.keys(CONFIGURATION_PROFILES)
  }

  /**
   * Get profile details
   */
  static getProfile(profileName: string): ConfigurationProfile | null {
    return getProfile(profileName)
  }

  /**
   * Get environment variable documentation
   */
  static getEnvironmentDocumentation(): string {
    return EnvironmentParser.generateEnvDocumentation()
  }

  /**
   * Get list of environment variables that would be parsed
   */
  static getEnvironmentVariableNames(): string[] {
    return EnvironmentParser.getEnvironmentVariableNames()
  }

  /**
   * Parse TTL string to milliseconds
   */
  static parseTTLToMs(ttl: string): number {
    const match = ttl.match(/^(\d+)(h|m|s)$/)
    if (!match) {
      throw new Error(`Invalid TTL format: ${ttl}. Use format like "24h", "30m", or "3600s"`)
    }

    const [, value, unit] = match
    const num = parseInt(value, 10)

    switch (unit) {
      case 'h': return num * 60 * 60 * 1000
      case 'm': return num * 60 * 1000
      case 's': return num * 1000
      default: throw new Error(`Unknown time unit: ${unit}`)
    }
  }

  /**
   * Convert milliseconds to TTL string
   */
  static msToTTL(ms: number): string {
    if (ms % (60 * 60 * 1000) === 0) {
      return `${ms / (60 * 60 * 1000)}h`
    } else if (ms % (60 * 1000) === 0) {
      return `${ms / (60 * 1000)}m`
    } else {
      return `${ms / 1000}s`
    }
  }

  /**
   * Create configuration for testing
   */
  static createTestConfig(overrides: Partial<ApplicationConfig> = {}): ApplicationConfig {
    return this.create({
      profile: 'test',
      overrides,
      validateOnCreate: false
    })
  }

  /**
   * Create minimal configuration (for unit tests)
   */
  static createMinimalConfig(): ApplicationConfig {
    const minimal: Partial<ApplicationConfig> = {
      server: {
        nodeEnv: 'test',
        logLevel: 'error'
      },
      features: {
        aiEnabled: false,
        mockMode: true,
        enableMetrics: false,
        enableEvents: false,
        enablePerformanceMonitoring: false,
        enableDebugLogs: false,
        nonInteractive: true
      }
    }

    return this.create({
      profile: 'test',
      overrides: minimal,
      validateOnCreate: false
    })
  }

  /**
   * Check if configuration is for production
   */
  static isProduction(config: ApplicationConfig): boolean {
    return config.server.nodeEnv === 'production'
  }

  /**
   * Check if configuration is for development
   */
  static isDevelopment(config: ApplicationConfig): boolean {
    return config.server.nodeEnv === 'development'
  }

  /**
   * Check if configuration is for testing
   */
  static isTest(config: ApplicationConfig): boolean {
    return config.server.nodeEnv === 'test'
  }

  /**
   * Check if AI services are enabled
   */
  static hasAIEnabled(config: ApplicationConfig): boolean {
    return config.features.aiEnabled && Boolean(config.aiServices.ai.apiKey || config.features.mockMode)
  }

  /**
   * Get configuration summary for logging/debugging
   */
  static getConfigurationSummary(config: ApplicationConfig): Record<string, any> {
    return {
      nodeEnv: config.server.nodeEnv,
      logLevel: config.server.logLevel,
      workflowMode: config.workflow.mode,
      hasAI: this.hasAIEnabled(config),
      mockMode: config.features.mockMode,
      maxSessions: config.session.maxSessions,
      maxRetries: config.workflow.maxRetries,
      // Don't expose sensitive values
      aiApiKey: config.aiServices.ai.apiKey ? '[REDACTED]' : '',
      scanning: {
        enabled: config.infrastructure.scanning.enabled,
        scanner: config.infrastructure.scanning.scanner,
        threshold: config.infrastructure.scanning.severityThreshold
      },
      docker: {
        registry: config.infrastructure.docker.registry
      }
    }
  }
}

/**
 * Configuration Error class
 */
export class ConfigurationError extends Error {
  constructor(
    message: string,
    public details: string[] = []
  ) {
    super(message)
    this.name = 'ConfigurationError'
  }

  toString(): string {
    let result = `${this.name}: ${this.message}`
    if (this.details.length > 0) {
      result += '\nDetails:\n' + this.details.map(d => `  - ${d}`).join('\n')
    }
    return result
  }
}