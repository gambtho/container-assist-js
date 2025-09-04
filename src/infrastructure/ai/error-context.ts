/**
 * AI Error Recovery Context System
 * Provides rich context propagation for error recovery scenarios
 */

import type { AIRequest } from '../ai-request-builder.js';

/**
 * Comprehensive error context for AI recovery operations
 */
export interface ErrorContext {
  /** Current attempt number (1-based) */
  attempt: number;

  /** Previous error messages in chronological order */
  previousErrors: string[];

  /** Partial result from failed attempts (useful for JSON repair) */
  partialResult?: unknown;

  /** Recovery suggestions from previous analysis */
  suggestions?: string[];

  /** Original template ID that failed */
  templateId: string;

  /** Original variables passed to the template */
  originalVariables: Record<string, any>;

  /** Original request configuration */
  originalRequest?: Partial<AIRequest>;

  /** Error classification */
  errorType?: ErrorType;

  /** Failure patterns detected */
  patterns?: FailurePattern[];

  /** Recovery strategy history */
  strategiesUsed?: string[];

  /** Metadata for debugging and monitoring */
  metadata?: {
    totalElapsedMs?: number;
    firstErrorTimestamp?: number;
    lastErrorTimestamp?: number;
    tokensUsed?: number;
    modelsAttempted?: string[];
  };
}

/**
 * Types of errors that can occur during AI operations
 */
export enum ErrorType {
  PARSING_ERROR = 'parsing',
  SCHEMA_VALIDATION = 'validation',
  TIMEOUT = 'timeout',
  RATE_LIMIT = 'rate_limit',
  CONTENT_FILTER = 'content_filter',
  NETWORK_ERROR = 'network',
  MODEL_ERROR = 'model',
  TEMPLATE_ERROR = 'template',
  UNKNOWN = 'unknown'
}

/**
 * Common failure patterns detected in error messages
 */
export interface FailurePattern {
  type: 'json_syntax' | 'incomplete_response' | 'wrong_format' | 'missing_field' | 'invalid_value';
  confidence: number; // 0.0 - 1.0
  description: string;
  suggestedFix?: string;
}

/**
 * Factory for creating and managing error contexts
 */
export class ErrorContextFactory {
  /**
   * Create initial error context for first failure
   * @param templateId - Template that failed
   * @param originalVariables - Variables passed to template
   * @param originalRequest - Full original request
   * @param error - The error that occurred
   */
  static createInitial(
    templateId: string,
    originalVariables: Record<string, any>,
    originalRequest: Partial<AIRequest>,
    error: Error,
  ): ErrorContext {
    const errorType = this.classifyError(error);
    const patterns = this.detectPatterns(error.message);

    return {
      attempt: 1,
      previousErrors: [error.message],
      templateId,
      originalVariables: { ...originalVariables },
      originalRequest: { ...originalRequest },
      errorType,
      patterns,
      strategiesUsed: [],
      metadata: {
        firstErrorTimestamp: Date.now(),
        lastErrorTimestamp: Date.now(),
        totalElapsedMs: 0,
        modelsAttempted: originalRequest.model ? [originalRequest.model] : [],
      },
    };
  }

  /**
   * Update context for subsequent failure
   * @param context - Existing error context
   * @param error - New error that occurred
   * @param strategyUsed - Recovery strategy that was attempted
   * @param partialResult - Any partial result from the attempt
   */
  static updateForFailure(
    context: ErrorContext,
    error: Error,
    strategyUsed: string,
    partialResult?: unknown,
  ): ErrorContext {
    const newErrorType = this.classifyError(error);
    const newPatterns = this.detectPatterns(error.message);
    const now = Date.now();

    const result: ErrorContext = {
      ...context,
      attempt: context.attempt + 1,
      previousErrors: [...context.previousErrors, error.message],
      strategiesUsed: [...(context.strategiesUsed ?? []), strategyUsed],
      metadata: {
        ...context.metadata,
        lastErrorTimestamp: now,
        totalElapsedMs: context.metadata?.firstErrorTimestamp
          ? now - context.metadata.firstErrorTimestamp
          : 0,
      },
    };

    // Add partialResult if provided or exists
    if (partialResult ?? context.partialResult) {
      result.partialResult = partialResult ?? context.partialResult;
    }

    // Update error type if we have a more specific one
    if (newErrorType !== ErrorType.UNKNOWN) {
      result.errorType = newErrorType;
    } else if (context.errorType != null) {
      result.errorType = context.errorType;
    }

    // Update patterns
    if (context.patterns ?? newPatterns.length > 0) {
      result.patterns = this.mergePatterns(context.patterns ?? [], newPatterns);
    }

    return result;
  }

  /**
   * Add suggestions to context (from error analysis)
   * @param context - Existing error context
   * @param suggestions - New suggestions to add
   */
  static addSuggestions(context: ErrorContext, suggestions: string[]): ErrorContext {
    const existingSuggestions = context.suggestions ?? [];
    const uniqueSuggestions = [
      ...existingSuggestions,
      ...suggestions.filter((s) => !existingSuggestions.includes(s)),
    ];

    return {
      ...context,
      suggestions: uniqueSuggestions,
    };
  }

  /**
   * Update token usage in context
   * @param context - Existing error context
   * @param tokensUsed - Additional tokens consumed
   * @param model - Model that was used
   */
  static updateTokenUsage(context: ErrorContext, tokensUsed: number, model?: string): ErrorContext {
    const currentTokens = context.metadata?.tokensUsed ?? 0;
    const modelsAttempted = context.metadata?.modelsAttempted ?? [];

    return {
      ...context,
      metadata: {
        ...context.metadata,
        tokensUsed: currentTokens + tokensUsed,
        modelsAttempted:
          model && !modelsAttempted.includes(model) ? [...modelsAttempted, model] : modelsAttempted,
      },
    };
  }

  /**
   * Check if context indicates recovery should be abandoned
   * @param context - Error context to evaluate
   */
  static shouldAbandonRecovery(context: ErrorContext): boolean {
    // Too many attempts
    if (context.attempt > 5) {
      return true;
    }

    // Taking too long
    if (context.metadata?.totalElapsedMs && context.metadata.totalElapsedMs > 60000) {
      // 60 seconds
      return true;
    }

    // Same error repeating (no progress)
    const recentErrors = context.previousErrors.slice(-3);
    if (recentErrors.length >= 3 && recentErrors.every((err) => err === recentErrors[0])) {
      return true;
    }

    // Too many tokens used
    if (context.metadata?.tokensUsed && context.metadata.tokensUsed > 10000) {
      return true;
    }

    return false;
  }

  /**
   * Get recovery priority suggestions based on context
   * @param context - Error context to analyze
   */
  static getRecoveryPriorities(context: ErrorContext): string[] {
    const priorities: string[] = [];

    // Based on error type
    switch (context.errorType) {
      case ErrorType.PARSING_ERROR:
        priorities.push('json_repair', 'simplification');
        break;
      case ErrorType.SCHEMA_VALIDATION:
        priorities.push('schema_guidance', 'json_repair');
        break;
      case ErrorType.TIMEOUT:
        priorities.push('simplification', 'alternative_template');
        break;
      case ErrorType.CONTENT_FILTER:
        priorities.push('alternative_template', 'content_sanitization');
        break;
      default:
        priorities.push('simplification', 'alternative_template');
    }

    // Based on patterns
    context.patterns?.forEach((pattern) => {
      switch (pattern.type) {
        case 'json_syntax':
          if (!priorities.includes('json_repair')) priorities.unshift('json_repair');
          break;
        case 'incomplete_response':
          if (!priorities.includes('increase_tokens')) priorities.push('increase_tokens');
          break;
        case 'wrong_format':
          if (!priorities.includes('format_guidance')) priorities.push('format_guidance');
          break;
      }
    });

    // Based on attempt history
    if (context.attempt > 2) {
      priorities.push('fallback_default');
    }

    return priorities;
  }

  /**
   * Classify error type based on error message and properties
   * @param error - Error to classify
   */
  private static classifyError(error: Error): ErrorType {
    const message = error.message.toLowerCase();

    if (message.includes('json') || message.includes('parse') || message.includes('syntax')) {
      return ErrorType.PARSING_ERROR;
    }
    if (
      message.includes('validation') ||
      message.includes('schema') ||
      message.includes('required')
    ) {
      return ErrorType.SCHEMA_VALIDATION;
    }
    if (message.includes('timeout') || message.includes('timed out')) {
      return ErrorType.TIMEOUT;
    }
    if (message.includes('rate limit') || message.includes('quota')) {
      return ErrorType.RATE_LIMIT;
    }
    if (message.includes('content') && message.includes('filter')) {
      return ErrorType.CONTENT_FILTER;
    }
    if (message.includes('network') || message.includes('connection')) {
      return ErrorType.NETWORK_ERROR;
    }
    if (message.includes('model') || message.includes('llm')) {
      return ErrorType.MODEL_ERROR;
    }
    if (message.includes('template') || message.includes('variable')) {
      return ErrorType.TEMPLATE_ERROR;
    }

    return ErrorType.UNKNOWN;
  }

  /**
   * Detect failure patterns in error messages
   * @param errorMessage - Error message to analyze
   */
  private static detectPatterns(errorMessage: string): FailurePattern[] {
    const patterns: FailurePattern[] = [];
    const message = errorMessage.toLowerCase();

    // JSON syntax patterns
    if (message.includes('unexpected token') || message.includes('invalid json')) {
      patterns.push({
        type: 'json_syntax',
        confidence: 0.9,
        description: 'Invalid JSON syntax detected',
        suggestedFix: 'Use json_repair strategy to fix syntax issues',
      });
    }

    // Incomplete response patterns
    if (
      message.includes('truncated') ||
      message.includes('incomplete') ||
      message.includes('cut off')
    ) {
      patterns.push({
        type: 'incomplete_response',
        confidence: 0.8,
        description: 'Response appears to be incomplete',
        suggestedFix: 'Increase max tokens or use continuation strategy',
      });
    }

    // Wrong format patterns
    if (
      message.includes('expected') &&
      (message.includes('format') || message.includes('structure'))
    ) {
      patterns.push({
        type: 'wrong_format',
        confidence: 0.7,
        description: 'Response format does not match expectations',
        suggestedFix: 'Add explicit format instructions to prompt',
      });
    }

    // Missing field patterns
    if (message.includes('required') && message.includes('missing')) {
      patterns.push({
        type: 'missing_field',
        confidence: 0.8,
        description: 'Required fields missing from response',
        suggestedFix: 'Add schema validation guidance to prompt',
      });
    }

    // Invalid value patterns
    if (message.includes('invalid') && message.includes('value')) {
      patterns.push({
        type: 'invalid_value',
        confidence: 0.7,
        description: 'Invalid values in response fields',
        suggestedFix: 'Add value validation examples to prompt',
      });
    }

    return patterns;
  }

  /**
   * Merge pattern arrays, preferring higher confidence patterns
   * @param existing - Existing patterns
   * @param newPatterns - New patterns to merge
   */
  private static mergePatterns(
    existing: FailurePattern[],
    newPatterns: FailurePattern[],
  ): FailurePattern[] {
    const merged = [...existing];

    for (const newPattern of newPatterns) {
      const existingIndex = merged.findIndex((p) => p.type === newPattern.type);

      if (existingIndex >= 0) {
        const existing = merged[existingIndex];
        if (existing) {
          // Update if new pattern has higher confidence
          if (newPattern.confidence > existing.confidence) {
            merged[existingIndex] = newPattern;
          }
        }
      } else {
        // Add new pattern
        merged.push(newPattern);
      }
    }

    // Sort by confidence descending
    return merged.sort((a, b) => b.confidence - a.confidence);
  }
}

/**
 * Utility functions for working with error contexts
 */
export class ErrorContextUtils {
  /**
   * Get human-readable summary of error context
   * @param context - Error context to summarize
   */
  static getSummary(context: ErrorContext): string {
    const { attempt, errorType } = context;
    const duration = context.metadata?.totalElapsedMs
      ? `${Math.round(context.metadata.totalElapsedMs / 1000)}s`
      : 'unknown';

    let summary = `Attempt ${attempt} failed after ${duration}`;

    if (errorType != null && errorType !== ErrorType.UNKNOWN) {
      summary += ` (${errorType})`;
    }

    if (context.patterns && context.patterns.length > 0) {
      const topPattern = context.patterns[0];
      if (topPattern) {
        summary += `. ${topPattern.description}`;
      }
    }

    return summary;
  }

  /**
   * Get the most recent error message
   * @param context - Error context
   */
  static getLastError(context: ErrorContext): string {
    return context.previousErrors[context.previousErrors.length - 1] || 'Unknown error';
  }

  /**
   * Check if a specific strategy has been tried
   * @param context - Error context
   * @param strategy - Strategy name to check
   */
  static hasTriedStrategy(context: ErrorContext, strategy: string): boolean {
    return (context.strategiesUsed ?? []).includes(strategy);
  }

  /**
   * Get unused strategies from a list
   * @param context - Error context
   * @param availableStrategies - List of available strategies
   */
  static getUnusedStrategies(context: ErrorContext, availableStrategies: string[]): string[] {
    const usedStrategies = context.strategiesUsed ?? [];
    return availableStrategies.filter((strategy) => !usedStrategies.includes(strategy));
  }

  /**
   * Create context for debugging/logging
   * @param context - Error context
   */
  static getDebugInfo(context: ErrorContext): Record<string, any> {
    return {
      attempt: context.attempt,
      errorType: context.errorType,
      patterns: context.patterns?.map((p) => ({ type: p.type, confidence: p.confidence })),
      strategiesUsed: context.strategiesUsed,
      tokensUsed: context.metadata?.tokensUsed,
      elapsedMs: context.metadata?.totalElapsedMs,
      modelsAttempted: context.metadata?.modelsAttempted,
      errorCount: context.previousErrors.length,
      hasPartialResult: !!context.partialResult,
    };
  }
}
