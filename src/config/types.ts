/**
 * Application Configuration Types
 *
 * Simplified configuration structure that imports from core and advanced configs.
 * Essential configs are always present, advanced configs are optional.
 */

// Import core (required) configurations
import type {
  NodeEnv,
  LogLevel,
  WorkflowMode,
  StoreType,
  ServerConfig,
  SessionConfig,
  FeatureFlags,
  DockerConfig,
  KubernetesConfig,
  WorkflowConfig,
  CoreConfig,
} from './core';

// Import advanced (optional) configurations
import type {
  SamplerMode,
  McpConfig,
  WorkspaceConfig,
  LoggingConfig,
  ScanningConfig,
  BuildConfig,
  JavaConfig,
  SamplerConfig,
  MockConfig,
  InfrastructureConfig,
  AdvancedConfig,
} from './advanced';

// Re-export for backwards compatibility
export type {
  NodeEnv,
  LogLevel,
  WorkflowMode,
  StoreType,
  ServerConfig,
  SessionConfig,
  FeatureFlags,
  DockerConfig,
  KubernetesConfig,
  WorkflowConfig,
  CoreConfig,
  SamplerMode,
  McpConfig,
  WorkspaceConfig,
  LoggingConfig,
  ScanningConfig,
  BuildConfig,
  JavaConfig,
  SamplerConfig,
  MockConfig,
  InfrastructureConfig,
  AdvancedConfig,
};

// Main Application Configuration - Now much simpler!
export interface ApplicationConfig extends CoreConfig {
  // Optional advanced configurations
  mcp?: McpConfig;
  workspace?: WorkspaceConfig;
  logging?: LoggingConfig;
  infrastructure?: InfrastructureConfig;
}

// Configuration utility types
export interface ConfigurationOptions {
  profile?: string;
  overrides?: Partial<ApplicationConfig>;
  envPrefix?: string;
  validateOnCreate?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  value?: unknown;
}

export interface ValidationWarning {
  path: string;
  message: string;
  suggestion?: string;
}

export interface EnvironmentMapping {
  [key: string]: {
    path: string; // dot-notation path in ApplicationConfig
    type: 'string' | 'number' | 'boolean';
    default?: unknown;
    required?: boolean;
    description?: string;
  };
}

// Deep partial type for nested configuration overrides
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
