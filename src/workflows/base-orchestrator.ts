import type { Logger } from 'pino';
import { Result, Success, Failure } from '../domain/types/result.js';
import type { ResourceManager } from '../mcp/resources/types.js';
import type { ProgressNotifier } from '../mcp/events/types.js';
import type { MCPConfig } from '../config/mcp-config.js';
import { ProgressTracker } from '../mcp/events/emitter.js';

export interface ExecutionContext {
  sessionId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  timeout?: number;
}

export interface OrchestratorResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata: {
    executionTime: number;
    resourcesCreated: string[];
    progressToken: string;
    sessionId?: string;
  };
}

/**
 * Base class for all MCP orchestrators
 * Provides common functionality for resource management, progress tracking, and error handling
 */
export abstract class BaseOrchestrator<TInput = unknown, TOutput = unknown> {
  protected readonly resourceManager: ResourceManager;
  protected readonly progressNotifier: ProgressNotifier;
  protected readonly config: MCPConfig;
  protected readonly logger: Logger;

  constructor(
    resourceManager: ResourceManager,
    progressNotifier: ProgressNotifier,
    config: MCPConfig,
    logger: Logger,
  ) {
    this.resourceManager = resourceManager;
    this.progressNotifier = progressNotifier;
    this.config = config;
    this.logger = logger.child({ component: this.constructor.name });
  }

  /**
   * Execute the orchestration workflow
   */
  async execute(
    input: TInput,
    context: ExecutionContext = {},
  ): Promise<Result<OrchestratorResult<TOutput>>> {
    const startTime = Date.now();
    const progressToken = this.progressNotifier.generateToken(this.constructor.name.toLowerCase());
    const resourcesCreated: string[] = [];

    try {
      this.logger.info(
        {
          progressToken,
          sessionId: context.sessionId,
          timeout: context.timeout,
        },
        'Starting orchestration',
      );

      // Create progress tracker
      const tracker = this.createProgressTracker(progressToken);

      // Set up timeout if specified
      const timeoutPromise = context.timeout
        ? this.createTimeoutPromise(context.timeout, progressToken)
        : null;

      // Execute the workflow
      const workflowPromise = this.executeWorkflow(input, context, tracker, resourcesCreated);

      // Wait for either completion or timeout
      const result = timeoutPromise
        ? await Promise.race([workflowPromise, timeoutPromise])
        : await workflowPromise;

      if (!result.success) {
        tracker.error(result.error);
        return result;
      }

      tracker.complete(result.data);

      const executionTime = Date.now() - startTime;

      this.logger.info(
        {
          progressToken,
          sessionId: context.sessionId,
          executionTime,
          resourceCount: resourcesCreated.length,
        },
        'Orchestration completed successfully',
      );

      return Success({
        success: true,
        data: result.data,
        metadata: {
          executionTime,
          resourcesCreated,
          progressToken,
          sessionId: context.sessionId,
        },
      });
    } catch (error) {
      const executionTime = Date.now() - startTime;

      this.logger.error(
        {
          error,
          progressToken,
          sessionId: context.sessionId,
          executionTime,
        },
        'Orchestration failed',
      );

      this.progressNotifier.notifyError(progressToken, error.message);

      return Success({
        success: false,
        error: error.message,
        metadata: {
          executionTime,
          resourcesCreated,
          progressToken,
          sessionId: context.sessionId,
        },
      });
    }
  }

  /**
   * Abstract method that subclasses must implement
   */
  protected abstract executeWorkflow(
    input: TInput,
    context: ExecutionContext,
    tracker: ProgressTracker,
    resourcesCreated: string[],
  ): Promise<Result<TOutput>>;

  /**
   * Publish content to a resource URI and track it
   */
  protected async publishResource(
    content: unknown,
    type: string,
    ttl?: number,
    resourcesCreated?: string[],
  ): Promise<Result<string>> {
    try {
      const scheme = this.getResourceScheme(type);
      const path = this.generateResourcePath(type);
      const uri = `${scheme}://${path}`;

      const result = await this.resourceManager.publish(uri, content, ttl);

      if (result.success && resourcesCreated) {
        resourcesCreated.push(result.data);
      }

      return result;
    } catch (error) {
      this.logger.error({ error, type }, 'Failed to publish resource');
      return Failure(`Failed to publish resource: ${error.message}`);
    }
  }

  /**
   * Read a resource with error handling
   */
  protected async readResource(uri: string): Promise<Result<unknown>> {
    try {
      const result = await this.resourceManager.read(uri);

      if (!result.success) {
        return result;
      }

      if (!result.data) {
        return Failure(`Resource not found: ${uri}`);
      }

      return Success(result.data.content);
    } catch (error) {
      this.logger.error({ error, uri }, 'Failed to read resource');
      return Failure(`Failed to read resource: ${error.message}`);
    }
  }

  /**
   * Create a progress tracker with predefined steps
   */
  protected createProgressTracker(token: string): ProgressTracker {
    return new ProgressTracker(this.progressNotifier, token, this.logger);
  }

  /**
   * Handle errors consistently across orchestrators
   */
  protected handleError(error: Error, context?: ExecutionContext): Result<never> {
    this.logger.error(
      {
        error: error.message,
        stack: error.stack,
        sessionId: context?.sessionId,
      },
      'Orchestrator error',
    );

    return Failure(error.message);
  }

  /**
   * Validate input before processing
   */
  protected validateInput(input: TInput): Result<void> {
    if (input === null || input === undefined) {
      return Failure('Input cannot be null or undefined');
    }

    return Success(undefined);
  }

  /**
   * Get appropriate resource scheme based on content type
   */
  private getResourceScheme(type: string): string {
    switch (type.toLowerCase()) {
      case 'cache':
      case 'temporary':
        return 'cache';
      case 'session':
        return 'session';
      default:
        return 'mcp';
    }
  }

  /**
   * Generate a unique resource path
   */
  private generateResourcePath(type: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${type}/${timestamp}-${random}`;
  }

  /**
   * Create a timeout promise that rejects after the specified time
   */
  private createTimeoutPromise<T>(timeoutMs: number, progressToken: string): Promise<Result<T>> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        this.progressNotifier.notifyError(
          progressToken,
          `Operation timed out after ${timeoutMs}ms`,
        );
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * Cleanup resources created during execution
   */
  protected async cleanup(resourcesCreated: string[]): Promise<void> {
    if (resourcesCreated.length === 0) {
      return;
    }

    this.logger.debug({ resourceCount: resourcesCreated.length }, 'Cleaning up created resources');

    for (const uri of resourcesCreated) {
      try {
        await this.resourceManager.invalidate(uri);
      } catch (error) {
        this.logger.warn({ error, uri }, 'Failed to cleanup resource');
      }
    }
  }

  /**
   * Get orchestrator metrics for monitoring
   */
  getMetrics(): {
    name: string;
    version: string;
    features: string[];
  } {
    return {
      name: this.constructor.name,
      version: '1.0.0',
      features: this.getSupportedFeatures(),
    };
  }

  /**
   * Get supported features (to be overridden by subclasses)
   */
  protected getSupportedFeatures(): string[] {
    return ['base-orchestration', 'resource-management', 'progress-tracking'];
  }
}
