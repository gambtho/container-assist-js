/**
 * Enhanced Error Recovery Service
 * Integrates error context, recovery strategies, and coordination logic
 */

import type { Logger } from 'pino';
import type { AIRequest } from '../ai-request-builder';
import { ErrorContext, ErrorContextFactory, ErrorContextUtils } from './error-context';
import { RecoveryCoordinator, type RecoveryStrategy } from './recovery-strategy';
import { DEFAULT_RECOVERY_STRATEGIES } from './recovery-strategies';

/**
 * Enhanced error recovery options
 */
export interface EnhancedRecoveryOptions {
  /** Maximum number of recovery attempts */
  maxAttempts?: number;

  /** Maximum time to spend on recovery (ms) */
  maxRecoveryTimeMs?: number;

  /** Maximum tokens to consume during recovery */
  maxTokenBudget?: number;

  /** Custom recovery strategies to use */
  customStrategies?: RecoveryStrategy[];

  /** Whether to enable detailed logging */
  enableDetailedLogging?: boolean;

  /** Callback for recovery progress updates */
  onRecoveryProgress?: (context: ErrorContext, strategy?: string) => void;
}

/**
 * Recovery attempt result
 */
export interface RecoveryAttemptResult<T = any> {
  /** Whether the recovery was successful */
  success: boolean;

  /** The result data if successful */
  data?: T;

  /** Error if recovery failed */
  error?: Error;

  /** Updated error context */
  context: ErrorContext;

  /** Strategy that was used */
  strategy?: RecoveryStrategy;

  /** Metadata about the attempt */
  metadata: {
    /** Duration of this attempt (ms) */
    attemptDurationMs: number;

    /** Tokens consumed in this attempt */
    tokensUsed?: number;

    /** Confidence in this attempt */
    confidence: number;

    /** Whether this was the final attempt */
    wasFinalAttempt: boolean;
  };
}

/**
 * Complete recovery session result
 */
export interface RecoverySessionResult<T = any> {
  /** Whether any recovery attempt succeeded */
  success: boolean;

  /** Final result if successful */
  data?: T | undefined;

  /** Final error if all attempts failed */
  finalError?: Error | undefined;

  /** Complete error context history */
  context: ErrorContext;

  /** Summary of all attempts */
  attempts: Array<{
    strategy: string;
    success: boolean;
    durationMs: number;
    confidence: number;
  }>;

  /** Session metadata */
  metadata: {
    /** Total session duration (ms) */
    totalDurationMs: number;

    /** Total tokens consumed */
    totalTokensUsed: number;

    /** Strategies attempted */
    strategiesUsed: string[];

    /** Recovery insights */
    insights: string[];

    /** Reason recovery was abandoned (if unsuccessful) */
    abandonReason?: string;
  };
}

/**
 * Enhanced AI Error Recovery Service
 * Provides sophisticated error recovery with context tracking and multiple strategies
 */
export class EnhancedErrorRecovery {
  private coordinator: RecoveryCoordinator;
  private options: Required<EnhancedRecoveryOptions>;
  private logger: Logger;

  constructor(logger: Logger, options: EnhancedRecoveryOptions = {}) {
    this.logger = logger.child({ service: 'enhanced-error-recovery' });
    this.options = {
      maxAttempts: 5,
      maxRecoveryTimeMs: 60000, // 60 seconds
      maxTokenBudget: 10000,
      customStrategies: [],
      enableDetailedLogging: false,
      onRecoveryProgress: () => {},
      ...options
    };

    // Initialize coordinator with default + custom strategies
    const allStrategies = [...DEFAULT_RECOVERY_STRATEGIES, ...this.options.customStrategies];
    this.coordinator = new RecoveryCoordinator(allStrategies);
  }

  /**
   * Execute comprehensive error recovery
   * @param originalRequest - The original AI request that failed
   * @param initialError - The initial error that occurred
   * @param templateId - Template ID that failed
   * @param variables - Original template variables
   * @param executor - Function to execute recovery attempts
   */
  async recoverWithContext<T>(
    originalRequest: AIRequest,
    initialError: Error,
    templateId: string,
    variables: Record<string, any>,
    executor: (request: AIRequest) => Promise<T>
  ): Promise<RecoverySessionResult<T>> {
    const sessionStartTime = Date.now();
    const attempts: RecoverySessionResult<T>['attempts'] = [];
    const insights: string[] = [];

    // Create initial error context
    let context = ErrorContextFactory.createInitial(
      templateId,
      variables,
      originalRequest,
      initialError
    );

    this.logRecoveryStart(context);
    this.options.onRecoveryProgress(context);

    // Recovery loop
    while (context.attempt <= this.options.maxAttempts) {
      // Check if we should abandon recovery
      if (this.shouldAbandonRecovery(context, sessionStartTime)) {
        const abandonReason = this.getAbandonReason(context, sessionStartTime);
        this.logger.warn(
          {
            reason: abandonReason,
            context: ErrorContextUtils.getDebugInfo(context)
          },
          'Recovery abandoned'
        );

        const result: RecoverySessionResult<T> = {
          success: false,
          finalError: new Error(`Recovery abandoned: ${abandonReason}`),
          context,
          attempts,
          metadata: {
            totalDurationMs: Date.now() - sessionStartTime,
            totalTokensUsed: context.metadata?.tokensUsed ?? 0,
            strategiesUsed: context.strategiesUsed ?? [],
            insights
          }
        };

        if (abandonReason) {
          result.metadata.abandonReason = abandonReason;
        }

        return result;
      }

      // Execute recovery attempt
      const lastError = new Error(ErrorContextUtils.getLastError(context));
      const attemptResult = await this.executeRecoveryAttempt(
        originalRequest,
        lastError,
        context,
        executor
      );

      await attempts.push({
        strategy: attemptResult.strategy?.name ?? 'unknown',
        success: attemptResult.success,
        durationMs: attemptResult.metadata.attemptDurationMs,
        confidence: attemptResult.metadata.confidence
      });

      // If successful, return result
      if (attemptResult.success && attemptResult.success.length > 0) {
        this.logger.info(
          {
            strategy: attemptResult.strategy?.name,
            attempt: context.attempt,
            totalDurationMs: Date.now() - sessionStartTime
          },
          'Recovery successful'
        );

        return {
          success: true,
          data: attemptResult.data,
          context: attemptResult.context,
          attempts,
          metadata: {
            totalDurationMs: Date.now() - sessionStartTime,
            totalTokensUsed: attemptResult.context.metadata?.tokensUsed ?? 0,
            strategiesUsed: attemptResult.context.strategiesUsed ?? [],
            insights
          }
        };
      }

      // Update context for next attempt
      context = attemptResult.context;

      // Collect insights from failed attempt
      if (attemptResult.strategy?.analyzeFailure && attemptResult.error) {
        const strategyInsights = attemptResult.strategy.analyzeFailure(
          attemptResult.error,
          context
        );
        await insights.push(...strategyInsights);
      }

      this.options.onRecoveryProgress(context, attemptResult.strategy?.name);

      if (this.options.enableDetailedLogging) {
        this.logger.debug(
          {
            attempt: context.attempt,
            strategy: attemptResult.strategy?.name,
            error: attemptResult.error?.message,
            confidence: attemptResult.metadata.confidence
          },
          'Recovery attempt failed'
        );
      }
    }

    // All attempts exhausted
    this.logger.warn(
      {
        attempts: context.attempt,
        strategies: context.strategiesUsed,
        totalDurationMs: Date.now() - sessionStartTime
      },
      'All recovery attempts exhausted'
    );

    return {
      success: false,
      finalError: new Error('All recovery attempts exhausted'),
      context,
      attempts,
      metadata: {
        totalDurationMs: Date.now() - sessionStartTime,
        totalTokensUsed: context.metadata?.tokensUsed ?? 0,
        strategiesUsed: context.strategiesUsed ?? [],
        insights,
        abandonReason: 'Max attempts reached'
      }
    };
  }

  /**
   * Execute a single recovery attempt
   */
  private async executeRecoveryAttempt<T>(
    originalRequest: AIRequest,
    error: Error,
    context: ErrorContext,
    executor: (request: AIRequest) => Promise<T>
  ): Promise<RecoveryAttemptResult<T>> {
    const attemptStart = Date.now();

    // Get recovery strategy
    const recoveryResult = await this.coordinator.executeRecovery(originalRequest, error, context);

    if (!recoveryResult) {
      return {
        success: false,
        error: new Error('No recovery strategy available'),
        context: ErrorContextFactory.updateForFailure(
          context,
          new Error('No recovery strategy available'),
          'none'
        ),
        metadata: {
          attemptDurationMs: Date.now() - attemptStart,
          confidence: 0,
          wasFinalAttempt: true
        }
      };
    }

    try {
      // Execute recovery attempt
      const result = await executor(recoveryResult.request);

      // Validate result if strategy provides validation
      const isValid = recoveryResult.strategy.validateResult
        ? recoveryResult.strategy.validateResult(result, context)
        : true;

      if (!isValid) {
        throw new Error('Recovery result failed validation');
      }

      // Success - update context with token usage if available
      const updatedContext =
        context.metadata?.tokensUsed !== undefined
          ? (ErrorContextUtils.getDebugInfo(context) as unknown) // Type assertion for metadata access
          : context;

      return {
        success: true,
        data: result,
        context: updatedContext,
        strategy: recoveryResult.strategy,
        metadata: {
          attemptDurationMs: Date.now() - attemptStart,
          confidence: recoveryResult.metadata.confidence,
          wasFinalAttempt: recoveryResult.metadata.isFinalAttempt ?? false
        }
      };
    } catch (attemptError) {
      // Recovery attempt failed
      const newError =
        attemptError instanceof Error ? attemptError : new Error(String(attemptError));
      const updatedContext = ErrorContextFactory.updateForFailure(
        context,
        newError,
        recoveryResult.strategy.name
      );

      return {
        success: false,
        error: newError,
        context: updatedContext,
        strategy: recoveryResult.strategy,
        metadata: {
          attemptDurationMs: Date.now() - attemptStart,
          confidence: recoveryResult.metadata.confidence,
          wasFinalAttempt: recoveryResult.metadata.isFinalAttempt ?? false
        }
      };
    }
  }

  /**
   * Check if recovery should be abandoned
   */
  private shouldAbandonRecovery(context: ErrorContext, sessionStart: number): boolean {
    // Use factory method for standard checks
    if (ErrorContextFactory.shouldAbandonRecovery(context)) {
      return true;
    }

    // Additional checks based on options
    const elapsed = Date.now() - sessionStart;
    if (elapsed > this.options.maxRecoveryTimeMs) {
      return true;
    }

    const tokensUsed = context.metadata?.tokensUsed ?? 0;
    if (tokensUsed > this.options.maxTokenBudget) {
      return true;
    }

    return false;
  }

  /**
   * Get reason for abandoning recovery
   */
  private getAbandonReason(context: ErrorContext, sessionStart: number): string {
    if (context.attempt > this.options.maxAttempts) {
      return `Max attempts exceeded (${this.options.maxAttempts})`;
    }

    const elapsed = Date.now() - sessionStart;
    if (elapsed > this.options.maxRecoveryTimeMs) {
      return `Max time exceeded (${this.options.maxRecoveryTimeMs}ms)`;
    }

    const tokensUsed = context.metadata?.tokensUsed ?? 0;
    if (tokensUsed > this.options.maxTokenBudget) {
      return `Token budget exceeded (${this.options.maxTokenBudget})`;
    }

    // Check factory reasons
    if (context.metadata?.totalElapsedMs && context.metadata.totalElapsedMs > 60000) {
      return 'Timeout exceeded';
    }

    const recentErrors = context.previousErrors.slice(-3);
    if (recentErrors.length >= 3 && recentErrors.every((err) => err === recentErrors[0])) {
      return 'Repeating errors with no progress';
    }

    return 'Unknown reason';
  }

  /**
   * Log recovery session start
   */
  private logRecoveryStart(context: ErrorContext): void {
    this.logger.info(
      {
        templateId: context.templateId,
        errorType: context.errorType,
        initialError: ErrorContextUtils.getLastError(context),
        maxAttempts: this.options.maxAttempts,
        strategies: this.coordinator.getAvailableStrategies(
          new Error(ErrorContextUtils.getLastError(context)),
          context
        )
      },
      'Starting error recovery session'
    );
  }

  /**
   * Add custom recovery strategy
   */
  addStrategy(strategy: RecoveryStrategy): void {
    this.coordinator.addStrategy(strategy);
  }

  /**
   * Get available strategies for error context (for debugging)
   */
  getAvailableStrategies(error: Error, context: ErrorContext): string[] {
    return this.coordinator.getAvailableStrategies(error, context);
  }

  /**
   * Get recovery statistics for monitoring
   */
  getRecoveryStats(sessionResult: RecoverySessionResult): Record<string, any> {
    return {
      success: sessionResult.success,
      totalAttempts: sessionResult.attempts.length,
      totalDurationMs: sessionResult.metadata.totalDurationMs,
      totalTokensUsed: sessionResult.metadata.totalTokensUsed,
      strategiesUsed: sessionResult.metadata.strategiesUsed,
      averageConfidence:
        sessionResult.attempts.reduce((sum, a) => sum + a.confidence, 0) /
        sessionResult.attempts.length,
      insightCount: sessionResult.metadata.insights.length,
      abandonReason: sessionResult.metadata.abandonReason ?? null
    };
  }
}

/**
 * Factory function for creating configured error recovery service
 */
export function createEnhancedErrorRecovery(
  logger: Logger,
  options?: EnhancedRecoveryOptions
): EnhancedErrorRecovery {
  return new EnhancedErrorRecovery(logger, options);
}

/**
 * Utility function to execute recovery with default configuration
 */
export async function executeWithEnhancedRecovery<T>(
  request: AIRequest,
  templateId: string,
  variables: Record<string, any>,
  executor: (request: AIRequest) => Promise<T>,
  logger: Logger,
  options?: EnhancedRecoveryOptions
): Promise<T> {
  try {
    // Try original request first
    return await executor(request);
  } catch (initialError) {
    // Execute recovery
    const recovery = createEnhancedErrorRecovery(logger, options);
    const result = await recovery.recoverWithContext(
      request,
      initialError as Error,
      templateId,
      variables,
      executor
    );

    if (result.success && result.data !== undefined) {
      return result.data;
    }

    // Recovery failed - throw with context
    const finalError = result.finalError ?? new Error('Recovery failed');
    const contextInfo = ErrorContextUtils.getDebugInfo(result.context);
    finalError.message += ` (Recovery failed after ${result.attempts.length} attempts: ${JSON.stringify(contextInfo)})`;
    throw finalError;
  }
}
