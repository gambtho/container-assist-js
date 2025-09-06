/**
 * Dynamic Tool Configuration - Team Delta Implementation
 *
 * Provides runtime configuration management for enhanced MCP tools,
 * supporting feature flags, resource limits, and capability toggles.
 */

import { z } from 'zod';
import type { Logger } from 'pino';
import type { DynamicToolConfig, ToolHealth } from '../interfaces';
import { Success, Failure, type Result } from '../../../types/core/index';

/**
 * Zod schemas for configuration validation
 */
export const SamplingConfigSchema = z.object({
  maxCandidates: z.number().min(1).max(10).default(3),
  scoringWeights: z.record(z.string(), z.number().min(0).max(1)).default({}),
  timeoutMs: z.number().min(1000).max(300000).default(30000), // 30 seconds default
  cachingEnabled: z.boolean().default(true),
  deterministicSeed: z.string().optional(),
});

export const ResourceConfigSchema = z.object({
  maxInlineSize: z
    .number()
    .min(1024)
    .max(5 * 1024 * 1024)
    .default(1024 * 1024), // 1MB default
  defaultTTL: z
    .number()
    .min(60)
    .max(86400 * 7)
    .default(3600), // 1 hour default
  supportedMimeTypes: z
    .array(z.string())
    .default(['application/json', 'text/plain', 'text/yaml', 'text/dockerfile', 'text/x-log']),
  enableCompression: z.boolean().default(true),
});

export const FeatureFlagsSchema = z.object({
  sampling: z.boolean().default(false),
  resourcePublishing: z.boolean().default(true),
  progressReporting: z.boolean().default(true),
  errorRecovery: z.boolean().default(true),
  dynamicConfig: z.boolean().default(true),
  mcpIntegration: z.boolean().default(true),
});

export const LimitsSchema = z.object({
  maxExecutionTimeMs: z.number().min(1000).max(600000).default(300000), // 5 minutes default
  maxResourceSizeMB: z.number().min(1).max(100).default(50), // 50MB default
  maxCandidates: z.number().min(1).max(20).default(5),
  maxConcurrentOperations: z.number().min(1).max(10).default(3),
  maxRetries: z.number().min(0).max(5).default(3),
});

export const DynamicToolConfigSchema = z.object({
  enabled: z.boolean().default(true),
  features: FeatureFlagsSchema.default({}),
  limits: LimitsSchema.default({}),
  sampling: SamplingConfigSchema.optional(),
  resources: ResourceConfigSchema.optional(),
  overrides: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Tool-specific configuration schemas
 */
export const ToolConfigSchemas = {
  'analyze-repo': DynamicToolConfigSchema.extend({
    features: FeatureFlagsSchema.extend({
      sampling: z.boolean().default(false), // Analysis doesn't use sampling
    }),
    limits: LimitsSchema.extend({
      maxExecutionTimeMs: z.number().default(60000), // 1 minute for analysis
    }),
  }),

  'generate-dockerfile': DynamicToolConfigSchema.extend({
    features: FeatureFlagsSchema.extend({
      sampling: z.boolean().default(true), // Dockerfile generation uses sampling
    }),
    sampling: SamplingConfigSchema.extend({
      maxCandidates: z.number().default(3),
      scoringWeights: z.record(z.string(), z.number()).default({
        security: 0.3,
        size: 0.2,
        performance: 0.2,
        maintainability: 0.3,
      }),
    }),
  }),

  'build-image': DynamicToolConfigSchema.extend({
    features: FeatureFlagsSchema.extend({
      sampling: z.boolean().default(false), // Build doesn't use sampling
    }),
    limits: LimitsSchema.extend({
      maxExecutionTimeMs: z.number().default(600000), // 10 minutes for build
      maxResourceSizeMB: z.number().default(100), // Build logs can be large
    }),
  }),

  'scan-image': DynamicToolConfigSchema.extend({
    features: FeatureFlagsSchema.extend({
      sampling: z.boolean().default(false), // Scan doesn't use sampling
    }),
    limits: LimitsSchema.extend({
      maxExecutionTimeMs: z.number().default(300000), // 5 minutes for scan
    }),
  }),

  'generate-k8s-manifests': DynamicToolConfigSchema.extend({
    features: FeatureFlagsSchema.extend({
      sampling: z.boolean().default(true), // K8s manifest generation uses sampling
    }),
    sampling: SamplingConfigSchema.extend({
      maxCandidates: z.number().default(3),
      scoringWeights: z.record(z.string(), z.number()).default({
        security: 0.25,
        scalability: 0.25,
        reliability: 0.25,
        efficiency: 0.25,
      }),
    }),
  }),

  'deploy-application': DynamicToolConfigSchema.extend({
    features: FeatureFlagsSchema.extend({
      sampling: z.boolean().default(false), // Deploy doesn't use sampling
    }),
    limits: LimitsSchema.extend({
      maxExecutionTimeMs: z.number().default(900000), // 15 minutes for deploy
    }),
  }),
} as const;

/**
 * Configuration manager for dynamic tool configuration
 */
export class DynamicConfigManager {
  private configs = new Map<string, DynamicToolConfig>();
  private defaultConfig: DynamicToolConfig;

  constructor(
    private logger: Logger,
    defaultConfig?: Partial<DynamicToolConfig>,
  ) {
    this.defaultConfig = DynamicToolConfigSchema.parse(defaultConfig ?? {});
  }

  /**
   * Get configuration for a specific tool
   */
  getConfig(toolName: string): DynamicToolConfig {
    const stored = this.configs.get(toolName);
    if (stored) {
      return stored;
    }

    // Get tool-specific schema if available
    const schema =
      ToolConfigSchemas[toolName as keyof typeof ToolConfigSchemas] ?? DynamicToolConfigSchema;

    try {
      const config = schema.parse(this.defaultConfig);
      this.configs.set(toolName, config);
      return config;
    } catch (error) {
      this.logger.warn({ toolName, error }, 'Failed to parse tool config, using default');
      this.configs.set(toolName, this.defaultConfig);
      return this.defaultConfig;
    }
  }

  /**
   * Update configuration for a tool
   */
  updateConfig(toolName: string, updates: Partial<DynamicToolConfig>): Result<DynamicToolConfig> {
    try {
      const currentConfig = this.getConfig(toolName);
      const schema =
        ToolConfigSchemas[toolName as keyof typeof ToolConfigSchemas] ?? DynamicToolConfigSchema;

      const newConfig = schema.parse({
        ...currentConfig,
        ...updates,
        features: { ...currentConfig.features, ...updates.features },
        limits: { ...currentConfig.limits, ...updates.limits },
      });

      this.configs.set(toolName, newConfig);

      this.logger.info({ toolName, updates }, 'Updated tool configuration');
      return Success(newConfig);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ toolName, updates, error }, 'Failed to update tool configuration');
      return Failure(`Configuration update failed: ${message}`);
    }
  }

  /**
   * Reset tool configuration to default
   */
  resetConfig(toolName: string): DynamicToolConfig {
    this.configs.delete(toolName);
    const config = this.getConfig(toolName); // This will recreate with defaults
    this.logger.info({ toolName }, 'Reset tool configuration to default');
    return config;
  }

  /**
   * Get all tool configurations
   */
  getAllConfigs(): Record<string, DynamicToolConfig> {
    const result: Record<string, DynamicToolConfig> = {};
    for (const [toolName, config] of this.configs) {
      result[toolName] = config;
    }
    return result;
  }

  /**
   * Validate configuration against schema
   */
  validateConfig(toolName: string, config: unknown): Result<DynamicToolConfig> {
    try {
      const schema =
        ToolConfigSchemas[toolName as keyof typeof ToolConfigSchemas] ?? DynamicToolConfigSchema;
      const validConfig = schema.parse(config);
      return Success(validConfig);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Failure(`Configuration validation failed: ${message}`);
    }
  }

  /**
   * Check if a feature is enabled for a tool
   */
  isFeatureEnabled(toolName: string, feature: keyof DynamicToolConfig['features']): boolean {
    const config = this.getConfig(toolName);
    return config.enabled && config.features[feature];
  }

  /**
   * Get resource limits for a tool
   */
  getLimits(toolName: string): DynamicToolConfig['limits'] {
    return this.getConfig(toolName).limits;
  }

  /**
   * Get sampling configuration for a tool
   */
  getSamplingConfig(toolName: string): z.infer<typeof SamplingConfigSchema> | null {
    const config = this.getConfig(toolName);
    if (!config.enabled || !config.features.sampling) {
      return null;
    }
    return SamplingConfigSchema.parse(config.sampling ?? {});
  }

  /**
   * Get resource configuration for a tool
   */
  getResourceConfig(toolName: string): z.infer<typeof ResourceConfigSchema> | null {
    const config = this.getConfig(toolName);
    if (!config.enabled || !config.features.resourcePublishing) {
      return null;
    }
    return ResourceConfigSchema.parse(config.resources ?? {});
  }
}

/**
 * Health checker for tool configurations
 */
export class ConfigHealthChecker {
  constructor(
    private logger: Logger,
    private configManager: DynamicConfigManager,
  ) {}

  /**
   * Check health of tool configuration
   */
  async checkToolHealth(toolName: string): Promise<ToolHealth> {
    const config = this.configManager.getConfig(toolName);
    const now = new Date();

    try {
      // Basic configuration validation
      const validationResult = this.configManager.validateConfig(toolName, config);
      if (!validationResult.ok) {
        return {
          name: toolName,
          status: 'unhealthy',
          lastCheck: now,
          features: {
            sampling: 'unavailable',
            resources: 'unavailable',
            progress: 'unavailable',
          },
          message: `Configuration validation failed: ${validationResult.error}`,
        };
      }

      // Check feature availability
      const features = {
        sampling: this.checkFeatureHealth(config, 'sampling'),
        resources: this.checkFeatureHealth(config, 'resourcePublishing'),
        progress: this.checkFeatureHealth(config, 'progressReporting'),
      };

      const overallStatus = this.calculateOverallStatus(features);

      return {
        name: toolName,
        status: overallStatus,
        lastCheck: now,
        features,
        message: overallStatus === 'healthy' ? 'All systems operational' : 'Some features degraded',
      };
    } catch (error) {
      this.logger.error({ toolName, error }, 'Health check failed');
      return {
        name: toolName,
        status: 'unhealthy',
        lastCheck: now,
        features: {
          sampling: 'unavailable',
          resources: 'unavailable',
          progress: 'unavailable',
        },
        message: `Health check error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private checkFeatureHealth(
    config: DynamicToolConfig,
    feature: keyof DynamicToolConfig['features'],
  ): 'available' | 'degraded' | 'unavailable' {
    if (!config.enabled) return 'unavailable';
    if (!config.features[feature]) return 'unavailable';

    // Additional feature-specific checks could go here
    // For now, if enabled, assume available
    return 'available';
  }

  private calculateOverallStatus(
    features: Record<string, 'available' | 'degraded' | 'unavailable'>,
  ): 'healthy' | 'degraded' | 'unhealthy' {
    const values = Object.values(features);

    if (values.every((status) => status === 'available')) {
      return 'healthy';
    }

    if (values.some((status) => status === 'available')) {
      return 'degraded';
    }

    return 'unhealthy';
  }
}

/**
 * Environment-based configuration loader
 */
export function loadConfigFromEnvironment(): Partial<DynamicToolConfig> {
  return {
    enabled: process.env.TOOLS_ENABLED !== 'false',
    features: {
      sampling: process.env.ENABLE_SAMPLING === 'true',
      resourcePublishing: process.env.ENABLE_RESOURCE_PUBLISHING !== 'false',
      progressReporting: process.env.ENABLE_PROGRESS_REPORTING !== 'false',
      errorRecovery: process.env.ENABLE_ERROR_RECOVERY !== 'false',
      dynamicConfig: process.env.ENABLE_DYNAMIC_CONFIG !== 'false',
      mcpIntegration: process.env.ENABLE_MCP_INTEGRATION !== 'false',
    },
    limits: {
      maxExecutionTimeMs: parseInt(process.env.MAX_EXECUTION_TIME_MS ?? '300000'),
      maxResourceSizeMB: parseInt(process.env.MAX_RESOURCE_SIZE_MB ?? '50'),
      maxCandidates: parseInt(process.env.MAX_CANDIDATES ?? '5'),
      maxConcurrentOperations: parseInt(process.env.MAX_CONCURRENT_OPERATIONS ?? '3'),
      maxRetries: parseInt(process.env.MAX_RETRIES ?? '3'),
    },
  };
}

/**
 * Factory for creating configuration manager
 */
export function createDynamicConfigManager(logger: Logger): DynamicConfigManager {
  const envConfig = loadConfigFromEnvironment();
  return new DynamicConfigManager(logger, envConfig);
}
