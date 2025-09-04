/**
 * Configuration Resource Provider for MCP SDK
 * Provides access to server configuration, capabilities, and settings
 */

import type { Logger } from 'pino';
import type { ApplicationConfig } from '../../config/index.js';

/**
 * MCP Resource interface
 */
export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  handler: () => {
    content: Array<{
      type: string;
      text: string;
    }>;
  };
}

export class ConfigResourceProvider {
  // Maximum recursion depth for sanitization to prevent stack overflow
  private static readonly MAX_RECURSION_DEPTH = 10;

  constructor(
    private config: ApplicationConfig,
    private logger: Logger,
  ) {
    this.logger = logger.child({ component: 'ConfigResourceProvider' });
  }

  /**
   * Get configuration-related MCP resources
   */
  getResources(): Array<MCPResource> {
    return [
      {
        uri: 'config://current',
        name: 'Current Server Configuration',
        description: 'Current server configuration and settings (sanitized)',
        mimeType: 'application/json',
        handler: () => {
          try {
            // Create sanitized configuration (remove sensitive data)
            const sanitizedConfig = this.sanitizeConfiguration(this.config);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      server: sanitizedConfig.server,
                      features: sanitizedConfig.features,
                      infrastructure: sanitizedConfig.infrastructure,
                      session: sanitizedConfig.session,
                      timestamp: new Date().toISOString(),
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          } catch (error) {
            this.logger.error({ error }, 'Failed to get server configuration');
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      status: 'error',
                      message: error instanceof Error ? error.message : 'Unknown error',
                      timestamp: new Date().toISOString(),
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }
        },
      },
      {
        uri: 'config://capabilities',
        name: 'Server Capabilities',
        description: 'Server capabilities and feature flags',
        mimeType: 'application/json',
        handler: () => {
          try {
            const capabilities = {
              mcp: {
                version: '2025-01-01',
                features: {
                  tools: true,
                  resources: true,
                  prompts: true,
                  logging: true,
                  progress: true,
                  sampling: false, // Would be true if AI sampling is enabled
                },
              },
              containerization: {
                docker: {
                  enabled: this.config.infrastructure?.docker != null,
                  buildSupport: true,
                  imageManagement: true,
                  registryPush: true,
                },
                kubernetes: {
                  enabled: this.config.infrastructure?.kubernetes != null,
                  manifestGeneration: true,
                  deployment: true,
                  monitoring: true,
                },
                workflows: {
                  fullWorkflow: true,
                  stepByStep: true,
                  recovery: true,
                  rollback: true,
                },
              },
              ai: {
                enabled: true,
                dockerfileGeneration: true,
                manifestGeneration: true,
                errorRecovery: true,
                contentValidation: true,
                repositoryAnalysis: true,
              },
              session: {
                enabled: true,
                storage: this.config.session?.store ?? 'memory',
                maxSessions: this.config.session?.maxSessions ?? 100,
                ttl: this.config.session?.ttl ?? 3600,
              },
              features: {
                enablePerformanceMonitoring:
                  this.config.features?.enablePerformanceMonitoring ?? false,
                enableDebugLogs: this.config.features?.enableDebugLogs ?? false,
                enableMetrics: this.config.features?.enableMetrics ?? false,
                enableTracing: this.config.features?.enableTracing ?? false,
              },
              timestamp: new Date().toISOString(),
            };

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(capabilities, null, 2),
                },
              ],
            };
          } catch (error) {
            this.logger.error({ error }, 'Failed to get server capabilities');
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      status: 'error',
                      message: error instanceof Error ? error.message : 'Unknown error',
                      timestamp: new Date().toISOString(),
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }
        },
      },
      {
        uri: 'config://environment',
        name: 'Server Environment',
        description: 'Server runtime environment and platform information',
        mimeType: 'application/json',
        handler: () => {
          try {
            const environment = {
              runtime: {
                node: process.version,
                platform: process.platform,
                arch: process.arch,
                pid: process.pid,
                uptime: process.uptime(),
              },
              environment: {
                nodeEnv: process.env.NODE_ENV ?? 'development',
                debug: process.env.DEBUG ?? false,
                logLevel: this.config.server?.logLevel ?? 'info',
              },
              paths: {
                cwd: process.cwd(),
                home: process.env.HOME ?? process.env.USERPROFILE,
                temp: process.env.TMPDIR ?? process.env.TEMP ?? '/tmp',
              },
              memory: {
                rss: process.memoryUsage().rss,
                heapTotal: process.memoryUsage().heapTotal,
                heapUsed: process.memoryUsage().heapUsed,
                external: process.memoryUsage().external,
              },
              timestamp: new Date().toISOString(),
            };

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(environment, null, 2),
                },
              ],
            };
          } catch (error) {
            this.logger.error({ error }, 'Failed to get environment information');
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      status: 'error',
                      message: error instanceof Error ? error.message : 'Unknown error',
                      timestamp: new Date().toISOString(),
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }
        },
      },
      {
        uri: 'config://validation',
        name: 'Configuration Validation',
        description: 'Validate current server configuration',
        mimeType: 'application/json',
        handler: () => {
          try {
            const validation = {
              valid: true,
              issues: [] as string[],
              warnings: [] as string[],
              checks: {
                server: this.validateServerConfig(),
                infrastructure: this.validateInfrastructureConfig(),
                session: this.validateSessionConfig(),
                features: this.validateFeatureConfig(),
              },
              timestamp: new Date().toISOString(),
            };

            // Aggregate issues and warnings
            for (const check of Object.values(validation.checks)) {
              if (check.issues && check.issues.length > 0) validation.issues.push(...check.issues);
              if (check.warnings && check.warnings.length > 0)
                validation.warnings.push(...check.warnings);
              if (!check.valid) validation.valid = false;
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(validation, null, 2),
                },
              ],
            };
          } catch (error) {
            this.logger.error({ error }, 'Failed to validate configuration');
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      status: 'error',
                      message: error instanceof Error ? error.message : 'Unknown error',
                      timestamp: new Date().toISOString(),
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }
        },
      },
    ];
  }

  /**
   * Sanitize configuration to remove sensitive data
   */
  private sanitizeConfiguration(config: ApplicationConfig): Record<string, unknown> {
    const sanitized = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;

    // Remove sensitive fields
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'credential', 'auth'];

    const removeSensitive = (
      obj: unknown,
      depth = 0,
      maxDepth = ConfigResourceProvider.MAX_RECURSION_DEPTH,
    ): void => {
      if (typeof obj !== 'object' || obj === null) return;

      if (depth > maxDepth) {
        this.logger.warn({ depth }, 'Maximum recursion depth reached in sanitization');
        return;
      }

      const record = obj as Record<string, unknown>;
      for (const key in record) {
        if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
          record[key] = '[REDACTED]';
        } else if (typeof record[key] === 'object' && record[key] !== null) {
          removeSensitive(record[key], depth + 1, maxDepth);
        }
      }
    };

    removeSensitive(sanitized);
    return sanitized;
  }

  /**
   * Validate server configuration
   */
  private validateServerConfig(): { valid: boolean; issues?: string[]; warnings?: string[] } {
    const issues: string[] = [];
    const warnings: string[] = [];

    if (this.config.server == null) {
      issues.push('Server configuration is missing');
      return { valid: false, issues };
    }

    if (
      this.config.server.port == null ||
      this.config.server.port < 1 ||
      this.config.server.port > 65535
    ) {
      warnings.push('Server port is not configured or invalid, using default');
    }

    if (!this.config.server.logLevel) {
      warnings.push('Log level not configured, using default');
    }

    const result: { valid: boolean; issues?: string[]; warnings?: string[] } = {
      valid: issues.length === 0,
    };

    if (issues.length > 0) {
      result.issues = issues;
    }

    if (warnings.length > 0) {
      result.warnings = warnings;
    }

    return result;
  }

  /**
   * Validate infrastructure configuration
   */
  private validateInfrastructureConfig(): {
    valid: boolean;
    issues?: string[];
    warnings?: string[];
  } {
    const issues: string[] = [];
    const warnings: string[] = [];

    if (this.config.infrastructure == null) {
      warnings.push('Infrastructure configuration is missing, using defaults');
      return { valid: true, warnings };
    }

    // Validate Docker config
    if (this.config.infrastructure.docker != null) {
      if (
        this.config.infrastructure.docker.socketPath == null &&
        !this.config.infrastructure.docker.host
      ) {
        warnings.push('Docker connection not configured, will attempt default socket');
      }
    } else {
      warnings.push('Docker configuration missing, Docker features may not work');
    }

    // Validate Kubernetes config
    if (this.config.infrastructure.kubernetes != null) {
      if (!this.config.infrastructure.kubernetes.kubeconfig) {
        warnings.push('Kubernetes config path not specified, will use default');
      }
    } else {
      warnings.push('Kubernetes configuration missing, K8s features may not work');
    }

    const result: { valid: boolean; issues?: string[]; warnings?: string[] } = {
      valid: issues.length === 0,
    };

    if (issues.length > 0) {
      result.issues = issues;
    }

    if (warnings.length > 0) {
      result.warnings = warnings;
    }

    return result;
  }

  /**
   * Validate session configuration
   */
  private validateSessionConfig(): { valid: boolean; issues?: string[]; warnings?: string[] } {
    const issues: string[] = [];
    const warnings: string[] = [];

    if (this.config.session == null) {
      warnings.push('Session configuration is missing, using defaults');
      return { valid: true, warnings };
    }

    if (this.config.session.store !== 'memory' && this.config.session.store !== 'file') {
      issues.push(`Invalid session store type: ${this.config.session.store}`);
    }

    if (this.config.session.ttl && this.config.session.ttl < 60) {
      warnings.push('Session TTL is very short (< 60 seconds)');
    }

    if (this.config.session.maxSessions && this.config.session.maxSessions < 10) {
      warnings.push('Max sessions limit is very low (< 10)');
    }

    const result: { valid: boolean; issues?: string[]; warnings?: string[] } = {
      valid: issues.length === 0,
    };

    if (issues.length > 0) {
      result.issues = issues;
    }

    if (warnings.length > 0) {
      result.warnings = warnings;
    }

    return result;
  }

  /**
   * Validate feature configuration
   */
  private validateFeatureConfig(): { valid: boolean; issues?: string[]; warnings?: string[] } {
    const warnings: string[] = [];

    if (this.config.features == null) {
      warnings.push('Feature flags not configured, using defaults');
      return { valid: true, warnings };
    }

    if (this.config.features.enableDebugLogs && this.config.server?.nodeEnv === 'production') {
      warnings.push('Debug logging enabled in production environment');
    }

    const result: { valid: boolean; issues?: string[]; warnings?: string[] } = {
      valid: true,
    };

    if (warnings.length > 0) {
      result.warnings = warnings;
    }

    return result;
  }
}
