/**
 * Configuration validation utilities for application settings.
 */

import type { ApplicationConfig } from './types';

/**
 * Represents a validation error with descriptive message.
 */
export interface ValidationError {
  message: string;
}

/**
 * Validation result containing validation status and any errors.
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * Validates the application configuration.
 * @param config - The application configuration to validate
 * @returns ValidationResult containing validation status and any errors
 */
export function validateConfig(config: ApplicationConfig): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate NODE_ENV
  if (
    config.server.nodeEnv &&
    !['development', 'production', 'test'].includes(config.server.nodeEnv)
  ) {
    errors.push({ message: 'server.nodeEnv: Must be development, production, or test' });
  }

  // Validate LOG_LEVEL
  if (
    config.server.logLevel &&
    !['error', 'warn', 'info', 'debug', 'trace'].includes(config.server.logLevel)
  ) {
    errors.push({ message: 'server.logLevel: Must be error, warn, info, debug, or trace' });
  }

  // Validate port
  if (config.server.port !== undefined && (config.server.port < 1 || config.server.port > 65535)) {
    errors.push({ message: 'server.port: Must be between 1 and 65535' });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Configuration helper utilities.
 */
export const ConfigHelpers = {
  /**
   * Parse TTL string format (e.g., "1h", "30m", "60s") to milliseconds
   * @param ttl - TTL string in format of number + unit (h/m/s)
   * @returns TTL in milliseconds
   * @throws Error for invalid TTL format
   */
  parseTTL(ttl: string): number {
    if (!ttl || typeof ttl !== 'string') {
      throw new Error(`Invalid TTL format: ${ttl || 'undefined'}`);
    }

    const match = ttl.match(/^(\d+)([hms])$/);
    if (!match) {
      throw new Error(`Invalid TTL format: ${ttl || 'undefined'}`);
    }

    const value = parseInt(match[1] ?? '0', 10);
    const unit = match[2] ?? 's';

    switch (unit) {
      case 'h':
        return value * 60 * 60 * 1000; // hours to milliseconds
      case 'm':
        return value * 60 * 1000; // minutes to milliseconds
      case 's':
        return value * 1000; // seconds to milliseconds
      default:
        throw new Error(`Invalid TTL format: ${ttl}`);
    }
  },

  /**
   * Check if configuration is for production environment
   * @param config - Application configuration
   * @returns true if NODE_ENV is production
   */
  isProduction(config: ApplicationConfig): boolean {
    return config.server.nodeEnv === 'production';
  },

  /**
   * Check if configuration is for development environment
   * @param config - Application configuration
   * @returns true if NODE_ENV is development
   */
  isDevelopment(config: ApplicationConfig): boolean {
    return config.server.nodeEnv === 'development';
  },

  /**
   * Check if configuration is for test environment
   * @param config - Application configuration
   * @returns true if NODE_ENV is test
   */
  isTest(config: ApplicationConfig): boolean {
    return config.server.nodeEnv === 'test';
  },
};
