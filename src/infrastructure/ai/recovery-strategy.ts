/**
 * AI Recovery Strategy Framework
 * Defines interfaces and base classes for pluggable error recovery strategies
 */

import type { AIRequest } from '../ai-request-builder.js';
import type { ErrorContext, FailurePattern } from './error-context';

/**
 * Base interface for all recovery strategies
 */
export interface RecoveryStrategy {
  /** Unique identifier for this strategy */
  readonly name: string;

  /** Strategy priority (lower = higher priority) */
  readonly priority: number;

  /** Human-readable description */
  readonly description: string;

  /** Maximum number of times this strategy should be attempted */
  readonly maxAttempts?: number;

  /**
   * Determine if this strategy can handle the given error context
   * @param error - The error that occurred
   * @param context - Rich error context
   */
  canHandle(error: Error, context: ErrorContext): boolean;

  /**
   * Create a recovery request based on the error context
   * @param originalRequest - The original request that failed
   * @param error - The error that occurred
   * @param context - Rich error context
   */
  recover(originalRequest: AIRequest, error: Error, context: ErrorContext): Promise<AIRequest>;

  /**
   * Optional: Provide custom validation for recovery results
   * @param result - The result from the recovery attempt
   * @param context - Error context
   */
  validateResult?(result: unknown, context: ErrorContext): boolean;

  /**
   * Optional: Extract insights from failed recovery attempts
   * @param error - Error from failed recovery
   * @param context - Error context
   */
  analyzeFailure?(error: Error, context: ErrorContext): string[];
}

/**
 * Abstract base class for recovery strategies with common functionality
 */
export abstract class BaseRecoveryStrategy implements RecoveryStrategy {
  abstract readonly name: string;
  abstract readonly priority: number;
  abstract readonly description: string;

  readonly maxAttempts: number = 3;

  /**
   * Default implementation checks if strategy hasn't been overused'
   */
  canHandle(error: Error, context: ErrorContext): boolean {
    // Check if this strategy has been used too many times
    const usageCount = (context.strategiesUsed ?? []).filter(
      (strategy) => strategy === this.name
    ).length;

    if (usageCount >= this.maxAttempts) {
      return false;
    }

    // Delegate to specific implementation
    return this.canHandleSpecific(error, context);
  }

  /**
   * Strategy-specific handling logic (to be implemented by subclasses)
   */
  protected abstract canHandleSpecific(error: Error, context: ErrorContext): boolean;

  /**
   * Default recovery implementation with common patterns
   */
  async recover(
    originalRequest: AIRequest,
    error: Error,
    context: ErrorContext
  ): Promise<AIRequest> {
    // Create base recovery request
    const recoveryRequest = await this.createRecoveryRequest(originalRequest, error, context);

    // Apply common modifications
    return this.applyCommonModifications(recoveryRequest, context);
  }

  /**
   * Strategy-specific recovery logic (to be implemented by subclasses)
   */
  protected abstract createRecoveryRequest(
    originalRequest: AIRequest,
    error: Error,
    context: ErrorContext
  ): Promise<AIRequest>;

  /**
   * Apply common modifications to recovery requests
   */
  protected applyCommonModifications(request: AIRequest, context: ErrorContext): AIRequest {
    const modifications: Partial<AIRequest> = {};

    // Adjust sampling parameters based on attempt number
    if (context.attempt > 1) {
      // Lower temperature for more deterministic results on retries
      modifications.temperature = Math.max(0.1, (request.temperature ?? 0.2) * 0.8);

      // Increase max tokens slightly for more complete responses
      modifications.maxTokens = Math.min(
        (request.maxTokens ?? 1000) * 1.2,
        (request.maxTokens ?? 1000) + 500
      );
    }

    // Add error context to request context
    const contextAdditions = {
      _errorRecovery: {
        attempt: context.attempt,
        strategy: this.name,
        previousError: context.previousErrors[context.previousErrors.length - 1],
        patterns: context.patterns?.map((p) => p.type) || []
      }
    };

    return {
      ...request,
      ...modifications,
      context: {
        ...request.context,
        ...contextAdditions
      }
    };
  }

  /**
   * Helper method to check error message patterns
   */
  protected errorContains(error: Error, patterns: string[]): boolean {
    const message = error.message.toLowerCase();
    return patterns.some((pattern) => message.includes(pattern.toLowerCase()));
  }

  /**
   * Helper method to check if specific failure patterns are present
   */
  protected hasPattern(context: ErrorContext, patternType: string): boolean {
    return context.patterns?.some((p) => p.type === patternType) || false;
  }

  /**
   * Helper method to get the most confident pattern of a specific type
   */
  protected getPattern(context: ErrorContext, patternType: string): FailurePattern | undefined {
    return context.patterns?.find((p) => p.type === patternType);
  }
}

/**
 * Strategy selector that chooses the best recovery strategy for a given context
 */
export class RecoveryStrategySelector {
  private strategies: RecoveryStrategy[] = [];

  /**
   * Register a recovery strategy
   * @param strategy - Strategy to register
   */
  registerStrategy(strategy: RecoveryStrategy): this {
    // Insert strategy in priority order
    const insertIndex = this.strategies.findIndex((s) => s.priority > strategy.priority);
    if (insertIndex === -1) {
      this.strategies.push(strategy);
    } else {
      this.strategies.splice(insertIndex, 0, strategy);
    }
    return this;
  }

  /**
   * Register multiple strategies
   * @param strategies - Strategies to register
   */
  registerStrategies(strategies: RecoveryStrategy[]): this {
    strategies.forEach((strategy) => this.registerStrategy(strategy));
    return this;
  }

  /**
   * Select the best strategy for the given error and context
   * @param error - The error that occurred
   * @param context - Rich error context
   */
  selectStrategy(error: Error, context: ErrorContext): RecoveryStrategy | null {
    return this.strategies.find((strategy) => strategy.canHandle(error, context)) || null;
  }

  /**
   * Get all strategies that can handle the error, ordered by priority
   * @param error - The error that occurred
   * @param context - Rich error context
   */
  getAvailableStrategies(error: Error, context: ErrorContext): RecoveryStrategy[] {
    return this.strategies.filter((strategy) => strategy.canHandle(error, context));
  }

  /**
   * Get all registered strategies
   */
  getAllStrategies(): RecoveryStrategy[] {
    return [...this.strategies];
  }

  /**
   * Remove a strategy by name
   * @param name - Name of strategy to remove
   */
  removeStrategy(name: string): boolean {
    const index = this.strategies.findIndex((s) => s.name === name);
    if (index !== -1) {
      this.strategies.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Clear all strategies
   */
  clearStrategies(): void {
    this.strategies = [];
  }

  /**
   * Get strategy by name
   * @param name - Strategy name
   */
  getStrategy(name: string): RecoveryStrategy | null {
    return this.strategies.find((s) => s.name === name) || null;
  }
}

/**
 * Recovery result that includes both the request and additional metadata
 */
export interface RecoveryResult {
  /** The modified request for recovery attempt */
  request: AIRequest;

  /** Strategy that was used */
  strategy: RecoveryStrategy;

  /** Additional context for the recovery attempt */
  metadata: {
    /** Confidence in this recovery approach (0.0-1.0) */
    confidence: number;

    /** Expected improvement from this strategy */
    expectedImprovement: string;

    /** Additional instructions for the recovery attempt */
    instructions?: string[];

    /** Whether this is likely the final attempt */
    isFinalAttempt?: boolean;
  };
}

/**
 * Enhanced recovery coordinator that manages the full recovery process
 */
export class RecoveryCoordinator {
  private selector: RecoveryStrategySelector;

  constructor(strategies: RecoveryStrategy[] = []) {
    this.selector = new RecoveryStrategySelector().registerStrategies(strategies);
  }

  /**
   * Register additional strategies
   */
  addStrategy(strategy: RecoveryStrategy): this {
    this.selector.registerStrategy(strategy);
    return this;
  }

  /**
   * Execute recovery for the given error and context
   * @param originalRequest - Original request that failed
   * @param error - Error that occurred
   * @param context - Rich error context
   */
  async executeRecovery(
    originalRequest: AIRequest,
    error: Error,
    context: ErrorContext
  ): Promise<RecoveryResult | null> {
    const strategy = this.selector.selectStrategy(error, context);

    if (!strategy) {
      return null;
    }

    const request = await strategy.recover(originalRequest, error, context);

    return {
      request,
      strategy,
      metadata: {
        confidence: this.calculateConfidence(strategy, context),
        expectedImprovement: this.getExpectedImprovement(strategy, error, context),
        instructions: this.getRecoveryInstructions(strategy, context),
        isFinalAttempt:
          context.attempt >= 4 ?? this.selector.getAvailableStrategies(error, context).length <= 1
      }
    };
  }

  /**
   * Calculate confidence in the selected strategy
   */
  private calculateConfidence(strategy: RecoveryStrategy, context: ErrorContext): number {
    let confidence = 0.7; // Base confidence

    // Reduce confidence for higher attempt numbers
    confidence -= (context.attempt - 1) * 0.1;

    // Increase confidence if we have clear failure patterns
    if (context.patterns && context.patterns.length > 0) {
      const maxPatternConfidence = Math.max(...context.patterns.map((p) => p.confidence));
      confidence = Math.max(confidence, maxPatternConfidence * 0.8);
    }

    // Reduce confidence if strategy has been used before
    const previousUses = (context.strategiesUsed || []).filter((s) => s === strategy.name).length;
    confidence -= previousUses * 0.15;

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Describe expected improvement from the strategy
   */
  private getExpectedImprovement(
    strategy: RecoveryStrategy,
    _error: Error,
    context: ErrorContext
  ): string {
    // This would be strategy-specific, but provide a generic fallback
    return (
      strategy.description ??
      `Attempting to resolve ${context.errorType != null || 'unknown'} error`
    );
  }

  /**
   * Get recovery instructions based on strategy and context
   */
  private getRecoveryInstructions(_strategy: RecoveryStrategy, context: ErrorContext): string[] {
    const instructions: string[] = [];

    // Add pattern-specific instructions
    context.patterns?.forEach((pattern) => {
      if (pattern.suggestedFix) {
        instructions.push(pattern.suggestedFix);
      }
    });

    // Add context-specific instructions
    if (context.suggestions && context.suggestions.length > 0) {
      instructions.push(...context.suggestions);
    }

    return instructions;
  }

  /**
   * Get available strategies for debugging
   */
  getAvailableStrategies(error: Error, context: ErrorContext): string[] {
    return this.selector.getAvailableStrategies(error, context).map((s) => s.name);
  }
}

/**
 * Default recovery coordinator factory with standard strategies
 */
export function createDefaultRecoveryCoordinator(): RecoveryCoordinator {
  // This will be populated when we implement the specific strategies
  return new RecoveryCoordinator();
}
