/**
 * Application configuration with environment overrides
 */

import type { ApplicationConfig } from './types';
import { DEFAULT_NETWORK, DEFAULT_TIMEOUTS, getDefaultPort } from './defaults';

/**
 * Create default configuration with sensible defaults
 * @returns ApplicationConfig with default values for all sections
 */
function createDefaultConfig(): ApplicationConfig {
  return {
    logLevel: 'info',
    workspaceDir: process.cwd(),
    server: {
      nodeEnv: 'development',
      logLevel: 'info',
      port: getDefaultPort('javascript'),
      host: DEFAULT_NETWORK.host,
    },
    session: {
      store: 'memory',
      ttl: 86400, // 24h
      maxSessions: 1000,
      persistencePath: './data/sessions.db',
      persistenceInterval: 60000, // 1min
      cleanupInterval: DEFAULT_TIMEOUTS.cacheCleanup,
    },
  };
}

/**
 * Create configuration with environment overrides
 * @returns ApplicationConfig with environment variable overrides applied
 */
function createConfiguration(): ApplicationConfig {
  const defaultConfig = createDefaultConfig();
  // Environment mapping is currently disabled - returns default configuration
  return defaultConfig;
}

export { createDefaultConfig, createConfiguration };
