/**
 * Configuration Validation Schemas
 *
 * Zod schemas for runtime configuration validation.
 * Separated from app-config.ts for better organization.
 */

import { z } from 'zod';

/**
 * Validates TCP/UDP port numbers within valid range
 * @returns Zod validator for port numbers (1024-65535)
 */
export const portValidator = z.coerce
  .number()
  .int('Port must be an integer')
  .min(1024, 'Port must be >= 1024')
  .max(65535, 'Port must be <= 65535');

export const positiveIntValidator = z.coerce
  .number()
  .int('Must be an integer')
  .positive('Must be positive');

export const timeoutValidator = z.coerce
  .number()
  .int('Timeout must be an integer')
  .min(1000, 'Timeout must be at least 1000ms')
  .max(600000, 'Timeout must be at most 600000ms (10 minutes)');
