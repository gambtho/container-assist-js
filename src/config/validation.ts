/**
 * Simplified Configuration Validation
 *
 * Replaces the complex Zod schema system with simple, practical validation.
 */

import type { ApplicationConfig } from './types';

interface ValidationResult {
  isValid: boolean;
  errors: Array<{ path: string; message: string }>;
  warnings: Array<{ path: string; message: string }>;
}

/**
 * Validate application configuration
 */
export function validateConfig(config: ApplicationConfig): ValidationResult {
  const errors: Array<{ path: string; message: string }> = [];
  const warnings: Array<{ path: string; message: string }> = [];

  // Server validation
  if (!['development', 'production', 'test'].includes(config.server.nodeEnv)) {
    errors.push({ path: 'server.nodeEnv', message: 'Must be development, production, or test' });
  }

  if (!['error', 'warn', 'info', 'debug', 'trace'].includes(config.server.logLevel)) {
    errors.push({ path: 'server.logLevel', message: 'Must be error, warn, info, debug, or trace' });
  }

  if (config.server.port !== undefined && (config.server.port < 1 || config.server.port > 65535)) {
    errors.push({ path: 'server.port', message: 'Must be between 1 and 65535' });
  }

  // Session validation
  if (config.session.maxSessions < 1) {
    errors.push({ path: 'session.maxSessions', message: 'Must be at least 1' });
  }

  if (config.session.maxSessions > 1000) {
    warnings.push({
      path: 'session.maxSessions',
      message: 'Large number of sessions may impact performance',
    });
  }

  // Workflow validation
  if (!['interactive', 'auto', 'batch'].includes(config.workflow.mode)) {
    errors.push({ path: 'workflow.mode', message: 'Must be interactive, auto, or batch' });
  }

  if (config.workflow.maxRetries < 0) {
    errors.push({ path: 'workflow.maxRetries', message: 'Must be 0 or greater' });
  }

  // maxConcurrentTasks property doesn't exist in WorkflowConfig - skipping validation'

  // Infrastructure validation (optional)
  if (config.infrastructure?.scanning) {
    if (!['trivy'].includes(config.infrastructure.scanning.scanner)) {
      errors.push({ path: 'infrastructure.scanning.scanner', message: 'Must be trivy' });
    }

    if (
      !['low', 'medium', 'high', 'critical'].includes(
        config.infrastructure.scanning.severityThreshold,
      )
    ) {
      errors.push({
        path: 'infrastructure.scanning.severityThreshold',
        message: 'Must be low, medium, high, or critical',
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate partial configuration (for overrides)
 */
