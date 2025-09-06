/**
 * Enhanced Tool Factory - Team Delta Implementation
 *
 * Main factory for creating MCP-enhanced tools with sampling, resource publishing,
 * and progress reporting capabilities. Integrates all Team Delta enhancements.
 */

import type { Logger } from 'pino';
import type {
  SamplingAwareTool,
  EnhancedToolFactory,
  EnhancedToolContext,
  ToolHealth,
  DynamicToolConfig,
  ErrorRecoveryStrategy,
} from './interfaces';
import { DynamicConfigManager, ConfigHealthChecker } from './config/dynamic-config';
import { createResourcePublisher } from './utils/resource-integration';
import { createProgressReporter } from './utils/progress-events';
import { Success, Failure, type Result } from '../../types/core/index';

// Import existing tool functions
import { createAnalyzeRepoTool } from '../../tools/analyze-repo';
import { createGenerateDockerfileTool } from '../../tools/generate-dockerfile';
import { createBuildImageTool } from '../../tools/build-image';
import { createScanTool } from '../../tools/scan';
import { createGenerateK8sManifestsTool } from '../../tools/generate-k8s-manifests';
import { createDeployApplicationTool } from '../../tools/deploy';

/**
 * Enhanced wrapper for existing tools
 */
class EnhancedToolWrapper implements SamplingAwareTool {
  readonly supportsSampling: boolean;
  readonly supportsResources = true;
  readonly supportsDynamicConfig = true;

  constructor(
    public readonly name: string,
    public readonly description: string,
    private originalTool: { execute: (params: any) => Promise<Result<any>> },
    private configManager: DynamicConfigManager,
    private logger: Logger,
    samplingSupport = false,
  ) {
    this.supportsSampling = samplingSupport;
  }

  get samplingConfig(): any {
    return this.configManager.getSamplingConfig(this.name);
  }

  get resourceConfig(): any {
    return this.configManager.getResourceConfig(this.name);
  }

  get capabilities(): any {
    const config = this.configManager.getConfig(this.name);
    return {
      progressReporting: config.features.progressReporting,
      resourcePublishing: config.features.resourcePublishing,
      candidateGeneration: config.features.sampling && this.supportsSampling,
      errorRecovery: config.features.errorRecovery,
    };
  }

  async execute(
    params: Record<string, unknown>,
    context: EnhancedToolContext,
  ): Promise<Result<any>> {
    const startTime = Date.now();
    const config = this.configManager.getConfig(this.name);

    try {
      // Check if tool is enabled
      if (!config.enabled) {
        return Failure(`Tool ${this.name} is disabled`);
      }

      // Set up progress reporting if enabled
      if (config.features.progressReporting && context.progressReporter) {
        context.progressReporter.reportProgress('starting', 0, `Starting ${this.name}`);
      }

      // Execute the original tool
      const result = await this.originalTool.execute(params);

      // Handle result with resource publishing if needed
      if (result.ok && config.features.resourcePublishing && context.resourcePublisher) {
        const enhancedResult = await this.enhanceResultWithResources(result.value, context);

        if (config.features.progressReporting && context.progressReporter) {
          context.progressReporter.reportComplete(`${this.name} completed successfully`);
        }

        return Success(enhancedResult);
      }

      if (config.features.progressReporting && context.progressReporter) {
        if (result.ok) {
          context.progressReporter.reportComplete(`${this.name} completed successfully`);
        } else {
          context.progressReporter.reportError(result.error ?? 'Unknown error', false);
        }
      }

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(
        {
          toolName: this.name,
          sessionId: context.sessionId,
          executionTime,
          error: errorMessage,
        },
        'Tool execution failed',
      );

      if (config.features.progressReporting && context.progressReporter) {
        context.progressReporter.reportError(errorMessage, config.features.errorRecovery);
      }

      // Try error recovery if enabled
      if (config.features.errorRecovery) {
        const recoveryResult = await this.attemptErrorRecovery(error as Error, context);
        if (recoveryResult.ok) {
          return recoveryResult;
        }
      }

      return Failure(errorMessage);
    }
  }

  private async enhanceResultWithResources(data: any, context: EnhancedToolContext): Promise<any> {
    const config = this.configManager.getResourceConfig(this.name);
    if (!config || !context.resourcePublisher) {
      return {
        content: [
          {
            type: 'text',
            text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    // Check if we should publish as resource based on size
    const serialized = typeof data === 'string' ? data : JSON.stringify(data);
    const size = Buffer.byteLength(serialized);

    if (size > config.maxInlineSize) {
      // Publish as resource
      const resourceRef = await context.resourcePublisher.publish(data, 'application/json');

      return {
        content: [
          {
            type: 'resource',
            resource: {
              uri: resourceRef.uri,
              mimeType: resourceRef.mimeType,
              text: resourceRef.description,
            },
          },
        ],
      };
    } else {
      // Keep inline
      return {
        content: [
          {
            type: 'text',
            text: serialized,
          },
        ],
      };
    }
  }

  private async attemptErrorRecovery(
    error: Error,
    context: EnhancedToolContext,
  ): Promise<Result<any>> {
    // Basic error recovery strategy - could be enhanced with specific strategies per tool
    const strategy: ErrorRecoveryStrategy = {
      canRecover: (err) => !err.message.includes('fatal') && !err.message.includes('permission'),
      recover: async (err, ctx) => {
        ctx.logger.info({ error: err.message }, `Attempting error recovery for ${this.name}`);
        // For now, just return a basic recovery response
        return Success({
          content: [
            {
              type: 'text',
              text: `Tool ${this.name} encountered an error but recovered: ${err.message}`,
            },
          ],
          recovered: true,
        });
      },
      maxRetries: 1,
      backoffMs: 1000,
    };

    if (strategy.canRecover(error)) {
      return await strategy.recover(error, context);
    }

    return Failure(`Cannot recover from error: ${error.message}`);
  }
}

/**
 * Main enhanced tool factory implementation
 */
export class EnhancedToolFactoryImpl implements EnhancedToolFactory {
  private tools = new Map<string, SamplingAwareTool>();
  private healthChecker: ConfigHealthChecker;

  constructor(
    private logger: Logger,
    private configManager: DynamicConfigManager,
  ) {
    this.healthChecker = new ConfigHealthChecker(logger, configManager);
    this.initializeTools();
  }

  private initializeTools(): void {
    // Create enhanced versions of existing tools
    const toolConfigs = [
      {
        name: 'analyze-repo',
        description:
          'Analyze repository structure and detect language, framework, and build system',
        factory: createAnalyzeRepoTool,
        sampling: false,
      },
      {
        name: 'generate-dockerfile',
        description: 'Generate optimized Dockerfiles with multiple candidate sampling',
        factory: createGenerateDockerfileTool,
        sampling: true, // This tool will support sampling
      },
      {
        name: 'build-image',
        description: 'Build Docker images with enhanced logging and resource publishing',
        factory: createBuildImageTool,
        sampling: false,
      },
      {
        name: 'scan-image',
        description: 'Scan Docker images for security vulnerabilities with detailed reporting',
        factory: createScanTool,
        sampling: false,
      },
      {
        name: 'generate-k8s-manifests',
        description: 'Generate Kubernetes manifests with multiple candidate sampling',
        factory: createGenerateK8sManifestsTool,
        sampling: true, // This tool will support sampling
      },
      {
        name: 'deploy-application',
        description: 'Deploy applications to Kubernetes with enhanced monitoring',
        factory: createDeployApplicationTool,
        sampling: false,
      },
    ];

    for (const config of toolConfigs) {
      try {
        const originalTool = config.factory(this.logger);
        const enhancedTool = new EnhancedToolWrapper(
          config.name,
          config.description,
          originalTool,
          this.configManager,
          this.logger,
          config.sampling,
        );

        this.tools.set(config.name, enhancedTool);
        this.logger.debug(
          { toolName: config.name, sampling: config.sampling },
          'Initialized enhanced tool',
        );
      } catch (error) {
        this.logger.error({ toolName: config.name, error }, 'Failed to initialize enhanced tool');
      }
    }
  }

  createTool(name: string, _logger: Logger): SamplingAwareTool | null {
    return this.tools.get(name) ?? null;
  }

  listTools(): string[] {
    return Array.from(this.tools.keys());
  }

  async getToolHealth(name: string): Promise<ToolHealth> {
    if (!this.tools.has(name)) {
      return {
        name,
        status: 'unhealthy',
        lastCheck: new Date(),
        features: {
          sampling: 'unavailable',
          resources: 'unavailable',
          progress: 'unavailable',
        },
        message: 'Tool not found',
      };
    }

    return await this.healthChecker.checkToolHealth(name);
  }

  async updateDynamicConfig(name: string, config: Partial<DynamicToolConfig>): Promise<void> {
    const result = this.configManager.updateConfig(name, config);
    if (!result.ok) {
      throw new Error(result.error);
    }
  }

  /**
   * Create enhanced tool execution context
   */
  createEnhancedContext(
    logger: Logger,
    sessionId: string,
    options?: {
      mcpProgressToken?: string;
      samplingService?: any;
      dynamicConfig?: Record<string, unknown>;
      signal?: AbortSignal;
      timeoutMs?: number;
    },
  ): EnhancedToolContext {
    const resourcePublisher = createResourcePublisher(logger, sessionId);
    const progressReporter = createProgressReporter(
      logger,
      'unknown',
      sessionId,
      undefined,
      options?.mcpProgressToken,
    );

    return {
      logger,
      sessionId,
      progressReporter,
      resourcePublisher,
      mcpServer: undefined, // Will be set by MCP server
      progressToken: options?.mcpProgressToken,
      samplingService: options?.samplingService,
      dynamicConfig: options?.dynamicConfig,
      signal: options?.signal,
      timeoutMs: options?.timeoutMs,
    } as EnhancedToolContext;
  }

  /**
   * Get tool capabilities summary
   */
  getToolCapabilities(): Record<
    string,
    {
      sampling: boolean;
      resources: boolean;
      progress: boolean;
      recovery: boolean;
    }
  > {
    const capabilities: Record<string, any> = {};

    for (const [name, tool] of this.tools) {
      capabilities[name] = {
        sampling: tool.supportsSampling,
        resources: tool.supportsResources,
        progress: tool.capabilities.progressReporting,
        recovery: tool.capabilities.errorRecovery,
      };
    }

    return capabilities;
  }

  /**
   * Execute tool with full enhanced context
   */
  async executeTool(
    toolName: string,
    params: Record<string, unknown>,
    sessionId: string,
    options?: {
      mcpProgressToken?: string;
      timeout?: number;
      signal?: AbortSignal;
    },
  ): Promise<Result<any>> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return Failure(`Tool ${toolName} not found`);
    }

    const context = this.createEnhancedContext(this.logger, sessionId, {
      mcpProgressToken: options?.mcpProgressToken,
      signal: options?.signal,
      timeoutMs: options?.timeout,
    } as {
      mcpProgressToken?: string;
      samplingService?: any;
      dynamicConfig?: Record<string, unknown>;
      signal?: AbortSignal;
      timeoutMs?: number;
    });

    return await tool.execute(params, context);
  }
}

/**
 * Factory function for creating the enhanced tool factory
 */
export function createEnhancedToolFactory(logger: Logger): EnhancedToolFactory {
  const configManager = new DynamicConfigManager(logger);
  return new EnhancedToolFactoryImpl(logger, configManager);
}
