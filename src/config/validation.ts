/**
 * Configuration Validation
 * 
 * Provides comprehensive validation for application configuration using Zod schemas.
 * Validates both structure and business logic constraints.
 */

import { z } from 'zod'
import type { ApplicationConfig, ValidationResult, ValidationError, ValidationWarning } from './types.js'

// Zod schemas for validation
const NodeEnvSchema = z.enum(['development', 'production', 'test']),
const LogLevelSchema = z.enum(['error', 'warn', 'info', 'debug', 'trace']),
const WorkflowModeSchema = z.enum(['interactive', 'auto', 'batch']),
const StoreTypeSchema = z.enum(['memory', 'file', 'redis']),
const SamplerModeSchema = z.enum(['auto', 'mock', 'real']),

// TTL format validation (e.g., "24h", "30m", "3600s")
const TTLSchema = z.string().regex(/^\d+(h|m|s)$/, 'TTL must be in format like "24h", "30m", or "3600s"')

// Port number validation
const PortSchema = z.number().int().min(1).max(65535)

// Percentage validation
const PercentageSchema = z.number().min(0).max(100)

// Server Configuration Schema
const ServerConfigSchema = z.object({
  nodeEnv: NodeEnvSchema,
  logLevel: LogLevelSchema,
  port: PortSchema.optional(),
  host: z.string().optional(),
  shutdownTimeout: z.number().positive().optional(),
})

// MCP Configuration Schema
const McpConfigSchema = z.object({
  storePath: z.string().min(1),
  sessionTTL: TTLSchema,
  maxSessions: z.number().positive(),
  enableMetrics: z.boolean(),
  enableEvents: z.boolean(),
})

// Workspace Configuration Schema
const WorkspaceConfigSchema = z.object({
  workspaceDir: z.string().min(1),
  tempDir: z.string().optional(),
  cleanupOnExit: z.boolean().optional(),
})

// Docker Configuration Schema
const DockerConfigSchema = z.object({
  socketPath: z.string().min(1),
  registry: z.string().min(1),
  host: z.string().optional(),
  port: PortSchema.optional(),
  timeout: z.number().positive().optional(),
  apiVersion: z.string().optional(),
  buildArgs: z.record(z.string()).optional(),
})

// Kubernetes Configuration Schema
const KubernetesConfigSchema = z.object({
  kubeconfig: z.string().min(1),
  namespace: z.string().min(1),
  context: z.string().optional(),
  timeout: z.number().positive().optional(),
  dryRun: z.boolean().optional(),
})

// AI Configuration Schema
const AIConfigSchema = z.object({
  apiKey: z.string(),
  model: z.string().min(1),
  baseUrl: z.string().url(),
  timeout: z.number().positive().optional(),
  retryAttempts: z.number().min(0).optional(),
  retryDelayMs: z.number().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
})

// Sampler Configuration Schema
const SamplerConfigSchema = z.object({
  mode: SamplerModeSchema,
  templateDir: z.string().min(1),
  cacheEnabled: z.boolean(),
  retryAttempts: z.number().min(0),
  retryDelayMs: z.number().positive()
})

// Mock Configuration Schema
const MockConfigSchema = z.object({
  enabled: z.boolean(),
  responsesDir: z.string().optional(),
  deterministicMode: z.boolean(),
  simulateLatency: z.boolean(),
  errorRate: z.number().min(0).max(1),
  latencyRange: z.object({
    min: z.number().positive(),
    max: z.number().positive()
  }).optional(),
})

// Session Configuration Schema
const SessionConfigSchema = z.object({
  store: StoreTypeSchema,
  ttl: z.number().positive(),
  maxSessions: z.number().positive(),
  persistencePath: z.string().optional(),
  persistenceInterval: z.number().positive().optional(),
  cleanupInterval: z.number().positive().optional(),
})

// Logging Configuration Schema
const LoggingConfigSchema = z.object({
  level: LogLevelSchema,
  format: z.enum(['json', 'pretty']),
  destination: z.enum(['console', 'file', 'both']),
  filePath: z.string().optional(),
  maxFileSize: z.string().optional(),
  maxFiles: z.number().positive().optional(),
  enableColors: z.boolean().optional(),
})

// Scanning Configuration Schema
const ScanningConfigSchema = z.object({
  enabled: z.boolean(),
  scanner: z.enum(['trivy', 'grype', 'both']),
  severityThreshold: z.enum(['low', 'medium', 'high', 'critical']),
  failOnVulnerabilities: z.boolean(),
  skipUpdate: z.boolean().optional(),
  timeout: z.number().positive().optional(),
})

// Build Configuration Schema
const BuildConfigSchema = z.object({
  enableCache: z.boolean(),
  parallel: z.boolean(),
  maxParallel: z.number().positive().optional(),
  buildArgs: z.record(z.string()).optional(),
  labels: z.record(z.string()).optional(),
  target: z.string().optional(),
  squash: z.boolean().optional(),
})

// Java Configuration Schema
const JavaConfigSchema = z.object({
  defaultVersion: z.string().min(1),
  defaultJvmHeapPercentage: z.number().min(10).max(95),
  enableNativeImage: z.boolean(),
  enableJmx: z.boolean(),
  enableProfiling: z.boolean(),
})

// Infrastructure Configuration Schema
const InfrastructureConfigSchema = z.object({
  docker: DockerConfigSchema,
  kubernetes: KubernetesConfigSchema,
  scanning: ScanningConfigSchema,
  build: BuildConfigSchema,
  java: JavaConfigSchema
})

// AI Services Configuration Schema
const AIServicesConfigSchema = z.object({
  ai: AIConfigSchema,
  sampler: SamplerConfigSchema,
  mock: MockConfigSchema
})

// Workflow Configuration Schema
const WorkflowConfigSchema = z.object({
  mode: WorkflowModeSchema,
  autoRetry: z.boolean(),
  maxRetries: z.number().min(0),
  retryDelayMs: z.number().positive(),
  parallelSteps: z.boolean(),
  skipOptionalSteps: z.boolean(),
})

// Feature Flags Schema
const FeatureFlagsSchema = z.object({
  aiEnabled: z.boolean(),
  mockMode: z.boolean(),
  enableMetrics: z.boolean(),
  enableEvents: z.boolean(),
  enablePerformanceMonitoring: z.boolean(),
  enableDebugLogs: z.boolean(),
  nonInteractive: z.boolean(),
})

// Main Application Configuration Schema
export const ApplicationConfigSchema = z.object({
  server: ServerConfigSchema,
  mcp: McpConfigSchema,
  workspace: WorkspaceConfigSchema,
  session: SessionConfigSchema,
  logging: LoggingConfigSchema,
  infrastructure: InfrastructureConfigSchema,
  aiServices: AIServicesConfigSchema,
  workflow: WorkflowConfigSchema,
  features: FeatureFlagsSchema
})

export class ConfigurationValidator {
  /**
   * Validate application configuration
   */
  validate(config: ApplicationConfig): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    try {
      // Schema validation
      ApplicationConfigSchema.parse(config)
    } catch (error) {
      if (error instanceof z.ZodError) {
        for (const issue of error.issues) {
          errors.push({
            path: issue.path.join('.'),
            message: issue.message,
            value: 'received' in issue ? (issue as any).received : undefined
          })
        }
      } else {
        errors.push({
          path: 'root',
          message: error instanceof Error ? error.message : 'Unknown validation error'
        })
      }
    }

    // Business logic validation
    this.validateBusinessLogic(config, errors, warnings)

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * Validate business logic constraints
   */
  private validateBusinessLogic(
    config: ApplicationConfig, 
    errors: ValidationError[], 
    warnings: ValidationWarning[]
  ): void {
    // Validate AI configuration consistency
    if (config.features.aiEnabled && !config.aiServices.ai.apiKey && !config.features.mockMode) {
      errors.push({
        path: 'aiServices.ai.apiKey',
        message: 'AI API key is required when AI is enabled and not in mock mode'
      })
    }

    // Validate file path accessibility
    if (config.logging.destination === 'file' || config.logging.destination === 'both') {
      if (!config.logging.filePath) {
        errors.push({
          path: 'logging.filePath',
          message: 'File path is required when logging to file'
        })
      }
    }

    // Validate session store configuration
    if (config.session.store === 'file' && !config.session.persistencePath) {
      errors.push({
        path: 'session.persistencePath',
        message: 'Persistence path is required for file-based session store'
      })
    }

    // Validate mock latency range
    if (config.aiServices.mock.latencyRange) {
      const { min, max } = config.aiServices.mock.latencyRange
      if (min >= max) {
        errors.push({
          path: 'aiServices.mock.latencyRange',
          message: 'Minimum latency must be less than maximum latency'
        })
      }
    }

    // Validate Docker registry format
    if (!this.isValidRegistryFormat(config.infrastructure.docker.registry)) {
      warnings.push({
        path: 'infrastructure.docker.registry',
        message: 'Registry format should be host:port (e.g., localhost:5000)',
        suggestion: 'Use format: hostname:port or registry.example.com'
      })
    }

    // Warn about production settings in development
    if (config.server.nodeEnv === 'development') {
      if (config.infrastructure.scanning.failOnVulnerabilities) {
        warnings.push({
          path: 'infrastructure.scanning.failOnVulnerabilities',
          message: 'Failing on vulnerabilities is enabled in development mode',
          suggestion: 'Consider disabling for faster development cycles'
        })
      }

      if (!config.features.enableDebugLogs) {
        warnings.push({
          path: 'features.enableDebugLogs',
          message: 'Debug logs are disabled in development mode',
          suggestion: 'Enable for better debugging experience'
        })
      }
    }

    // Warn about development settings in production
    if (config.server.nodeEnv === 'production') {
      if (config.features.enableDebugLogs) {
        warnings.push({
          path: 'features.enableDebugLogs',
          message: 'Debug logs are enabled in production mode',
          suggestion: 'Disable to reduce log volume and improve performance'
        })
      }

      if (config.features.mockMode) {
        warnings.push({
          path: 'features.mockMode',
          message: 'Mock mode is enabled in production',
          suggestion: 'Disable mock mode for production deployments'
        })
      }

      if (config.logging.level === 'debug' || config.logging.level === 'trace') {
        warnings.push({
          path: 'logging.level',
          message: 'Verbose logging enabled in production',
          suggestion: 'Use "warn" or "error" level for production'
        })
      }
    }

    // Validate resource limits
    if (config.infrastructure.build.maxParallel && config.infrastructure.build.maxParallel > 16) {
      warnings.push({
        path: 'infrastructure.build.maxParallel',
        message: 'Very high parallel build count may consume excessive resources',
        suggestion: 'Consider reducing to 4-8 for most systems'
      })
    }

    // Validate timeout values
    if (config.aiServices.ai.timeout && config.aiServices.ai.timeout > 300000) { // 5 minutes
      warnings.push({
        path: 'aiServices.ai.timeout',
        message: 'Very long AI timeout may cause poor user experience',
        suggestion: 'Consider reducing timeout for better responsiveness'
      })
    }
  }

  /**
   * Check if registry format is valid
   */
  private isValidRegistryFormat(registry: string): boolean {
    // Simple validation for registry format
    return /^[a-zA-Z0-9.-]+:\d+$/.test(registry) || 
           /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2}$/.test(registry)
  }

  /**
   * Validate partial configuration (for merging)
   */
  validatePartial(partialConfig: Partial<ApplicationConfig>): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    try {
      // Use deepPartial schema for partial validation
      ApplicationConfigSchema.deepPartial().parse(partialConfig)
    } catch (error) {
      if (error instanceof z.ZodError) {
        for (const issue of error.issues) {
          errors.push({
            path: issue.path.join('.'),
            message: issue.message,
            value: 'received' in issue ? (issue as any).received : undefined
          })
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    }
  }
}