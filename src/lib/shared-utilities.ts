import type { Logger } from 'pino';
import { Result, Success, Failure } from '../types/core.js';
import type { McpResourceManager } from '../mcp/resources/manager.js';
import type { ProgressNotifier } from '../mcp/events/types.js';

/**
 * Shared utilities and helpers for MCP operations
 */

/**
 * Resource validation utilities
 */
export class ResourceValidator {
  /**
   * Validate resource size against limits
   */
  static validateSize(content: unknown, maxSize: number): Result<number> {
    const size = this.getContentSize(content);
    if (size > maxSize) {
      return Failure(`Resource too large: ${size} bytes (max: ${maxSize})`);
    }
    return Success(size);
  }

  /**
   * Validate resource URI format
   */
  static validateUri(uri: string): Result<void> {
    try {
      const url = new URL(uri);
      const validSchemes = ['mcp', 'cache', 'session', 'temp'];

      if (!validSchemes.includes(url.protocol.slice(0, -1))) {
        return Failure(
          `Invalid URI scheme: ${url.protocol}. Must be one of: ${validSchemes.join(', ')}`,
        );
      }

      if (!url.pathname || url.pathname === '/') {
        return Failure('URI must have a valid path');
      }

      return Success(undefined);
    } catch (error) {
      return Failure(
        `Invalid URI format: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get content size in bytes
   */
  static getContentSize(content: unknown): number {
    if (typeof content === 'string') {
      return Buffer.byteLength(content, 'utf8');
    }

    if (Buffer.isBuffer(content)) {
      return content.length;
    }

    // For objects, stringify and measure
    return Buffer.byteLength(JSON.stringify(content), 'utf8');
  }

  /**
   * Validate content is JSON serializable
   */
  static validateJsonSerializable(content: unknown): Result<void> {
    try {
      JSON.stringify(content);
      return Success(undefined);
    } catch (error) {
      return Failure(
        `Content is not JSON serializable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * Progress tracking utilities
 */
export class ProgressUtils {
  /**
   * Create a progress reporter function for common operations
   */
  static createReporter(
    notifier: ProgressNotifier,
    token: string,
    operation: string,
    logger: Logger,
  ): (progress: number, message?: string) => void {
    return (progress: number, message?: string) => {
      const clampedProgress = Math.max(0, Math.min(100, progress));
      const reportMessage = message ?? `${operation} ${clampedProgress}%`;

      notifier.notifyProgress({
        token,
        value: clampedProgress,
        message: reportMessage,
      });

      logger.debug(
        { token, progress: clampedProgress, message: reportMessage },
        'Progress reported',
      );
    };
  }

  /**
   * Create a step-based progress tracker
   */
  static createStepTracker(
    notifier: ProgressNotifier,
    token: string,
    steps: string[],
    logger: Logger,
  ): {
    currentStep: number;
    nextStep: (message?: string) => void;
    complete: (result?: unknown) => void;
    error: (error: string) => void;
  } {
    let currentStep = 0;

    return {
      currentStep,
      nextStep: (message?: string) => {
        if (currentStep < steps.length) {
          const progress = Math.round((currentStep / steps.length) * 100);
          const stepMessage = message ?? `${steps[currentStep]}...`;

          notifier.notifyProgress({ token, value: progress, message: stepMessage });
          logger.debug({ token, step: currentStep, message: stepMessage }, 'Step progress');

          currentStep++;
        }
      },
      complete: (result?: unknown) => {
        notifier.notifyComplete(token, result);
        logger.info({ token, totalSteps: steps.length }, 'Operation completed');
      },
      error: (error: string) => {
        notifier.notifyError(token, error);
        logger.error({ token, error, completedSteps: currentStep }, 'Operation failed');
      },
    };
  }

  /**
   * Validate progress token format
   */
  static validateToken(token: string): Result<void> {
    if (!token || typeof token !== 'string') {
      return Failure('Progress token must be a non-empty string');
    }

    if (token.length < 3) {
      return Failure('Progress token must be at least 3 characters');
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(token)) {
      return Failure(
        'Progress token must contain only alphanumeric characters, underscores, and hyphens',
      );
    }

    return Success(undefined);
  }
}

/**
 * Error handling utilities
 */
export class ErrorUtils {
  /**
   * Create a standardized error result
   */
  static createError(
    message: string,
    code?: string,
    _details?: Record<string, unknown>,
  ): Result<never> {
    const errorMessage = code ? `[${code}] ${message}` : message;
    return Failure(errorMessage);
  }

  /**
   * Wrap async operations with error handling
   */
  static async safeExecute<T>(
    operation: () => Promise<T>,
    errorMessage: string,
    logger?: Logger,
  ): Promise<Result<T>> {
    try {
      const result = await operation();
      return Success(result);
    } catch (error) {
      const fullMessage = `${errorMessage}: ${error instanceof Error ? error.message : String(error)}`;
      if (logger) {
        logger.error({ error, originalMessage: errorMessage }, 'Safe execution failed');
      }
      return Failure(fullMessage);
    }
  }

  /**
   * Extract error message from various error types
   */
  static extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as { message: unknown }).message);
    }

    return 'Unknown error occurred';
  }

  /**
   * Create a retry wrapper for operations
   */
  static async withRetry<T>(
    operation: () => Promise<Result<T>>,
    maxAttempts: number,
    delayMs: number = 1000,
    logger?: Logger,
  ): Promise<Result<T>> {
    let lastError = '';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await operation();
        if (result.ok) {
          if (attempt > 1 && logger) {
            logger.info({ attempt, maxAttempts }, 'Operation succeeded after retry');
          }
          return result;
        }
        lastError = result.error;
      } catch (error) {
        lastError = this.extractErrorMessage(error);
      }

      if (attempt < maxAttempts) {
        if (logger) {
          logger.warn({ attempt, maxAttempts, error: lastError }, 'Operation failed, retrying...');
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return Failure(`Operation failed after ${maxAttempts} attempts. Last error: ${lastError}`);
  }
}

/**
 * Resource management utilities
 */
export class ResourceUtils {
  /**
   * Publish content with automatic size validation
   */
  static async publishWithValidation(
    resourceManager: McpResourceManager,
    uri: string,
    content: unknown,
    maxSize: number,
    ttl?: number,
    logger?: Logger,
  ): Promise<Result<string>> {
    // Validate URI
    const uriValidation = ResourceValidator.validateUri(uri);
    if (!uriValidation.ok) {
      return uriValidation;
    }

    // Validate size
    const sizeValidation = ResourceValidator.validateSize(content, maxSize);
    if (!sizeValidation.ok) {
      return sizeValidation;
    }

    // Validate JSON serializable
    const serializableValidation = ResourceValidator.validateJsonSerializable(content);
    if (!serializableValidation.ok) {
      return serializableValidation;
    }

    // Publish
    const result = await resourceManager.publish(uri, content, ttl);
    if (result.ok && logger) {
      logger.info(
        {
          uri,
          size: sizeValidation.value,
          ttl,
        },
        'Resource published with validation',
      );
    }

    return result;
  }

  /**
   * Read resource with error handling
   */
  static async safeRead(
    resourceManager: McpResourceManager,
    uri: string,
    logger?: Logger,
  ): Promise<Result<unknown>> {
    try {
      const result = await resourceManager.read(uri);

      if (!result.ok) {
        return result;
      }

      if (!result.value) {
        return Failure(`Resource not found: ${uri}`);
      }

      if (logger) {
        logger.debug({ uri }, 'Resource read successfully');
      }

      return Success(result.value.content);
    } catch (error) {
      const errorMessage = ErrorUtils.extractErrorMessage(error);
      if (logger) {
        logger.error({ error, uri }, 'Failed to read resource');
      }
      return Failure(`Failed to read resource ${uri}: ${errorMessage}`);
    }
  }

  /**
   * Generate unique resource URI with timestamp
   */
  static generateUniqueUri(scheme: string, basePath: string, suffix?: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    const uniqueId = suffix ? `${timestamp}-${random}-${suffix}` : `${timestamp}-${random}`;
    return `${scheme}://${basePath}/${uniqueId}`;
  }
}

/**
 * Logging utilities
 */
export class LoggingUtils {
  /**
   * Create structured log entries for operations
   */
  static createOperationLog(
    operation: string,
    token: string,
    metadata: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      operation,
      token,
      timestamp: new Date().toISOString(),
      ...metadata,
    };
  }

  /**
   * Log performance metrics
   */
  static logPerformance(
    logger: Logger,
    operation: string,
    startTime: number,
    metadata: Record<string, unknown> = {},
  ): void {
    const duration = Date.now() - startTime;
    logger.info(
      {
        operation,
        duration,
        ...metadata,
      },
      `Operation ${operation} completed in ${duration}ms`,
    );
  }

  /**
   * Create a performance timing wrapper
   */
  static async withTiming<T>(
    operation: () => Promise<T>,
    operationName: string,
    logger: Logger,
    metadata: Record<string, unknown> = {},
  ): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await operation();
      this.logPerformance(logger, operationName, startTime, { success: true, ...metadata });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(
        {
          operation: operationName,
          duration,
          error: ErrorUtils.extractErrorMessage(error),
          ...metadata,
        },
        `Operation ${operationName} failed after ${duration}ms`,
      );
      throw error;
    }
  }
}

/**
 * Configuration utilities
 */
export class ConfigUtils {
  /**
   * Merge configurations with deep merging
   */
  static deepMerge<T extends Record<string, any>>(base: T, override: Partial<T>): T {
    const result = { ...base };

    for (const key in override) {
      if (override[key] !== undefined) {
        if (
          typeof override[key] === 'object' &&
          override[key] !== null &&
          !Array.isArray(override[key])
        ) {
          result[key] = this.deepMerge(
            (result[key] || {}) as Record<string, unknown>,
            override[key] as Record<string, unknown>,
          ) as T[Extract<keyof T, string>];
        } else {
          result[key] = override[key] as T[Extract<keyof T, string>];
        }
      }
    }

    return result;
  }

  /**
   * Validate required configuration keys
   */
  static validateRequired<T extends Record<string, any>>(
    config: T,
    requiredKeys: (keyof T)[],
    configName: string = 'configuration',
  ): Result<void> {
    const missing: string[] = [];

    for (const key of requiredKeys) {
      if (config[key] === undefined || config[key] === null) {
        missing.push(String(key));
      }
    }

    if (missing.length > 0) {
      return Failure(`Missing required ${configName} keys: ${missing.join(', ')}`);
    }

    return Success(undefined);
  }

  /**
   * Get nested configuration value with default
   */
  static getNestedValue<T>(
    obj: Record<string, any>,
    path: string,
    defaultValue?: T,
  ): T | undefined {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return defaultValue;
      }
    }

    return current as T;
  }
}

/**
 * Common utility functions for MCP operations
 */
export const SharedUtilities = {
  ResourceValidator,
  ProgressUtils,
  ErrorUtils,
  ResourceUtils,
  LoggingUtils,
  ConfigUtils,
} as const;
