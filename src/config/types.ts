/**
 * Unified Configuration Types
 *
 * This file consolidates all configuration interfaces from across the codebase
 * into a single, hierarchical configuration schema with type safety.
 */

export type NodeEnv = 'development' | 'production' | 'test';
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';
export type WorkflowMode = 'interactive' | 'auto' | 'batch';
export type StoreType = 'memory' | 'file' | 'redis';
export type SamplerMode = 'auto' | 'mock' | 'real';

// Server Configuration
export interface ServerConfig {
  nodeEnv: NodeEnv;
  logLevel: LogLevel;
  port?: number;
  host?: string;
  shutdownTimeout?: number;
}

// MCP Protocol Configuration
export interface McpConfig {
  storePath: string;
  sessionTTL: string;
  maxSessions: number;
  enableMetrics: boolean;
  enableEvents: boolean;
}

// Workspace Configuration
export interface WorkspaceConfig {
  workspaceDir: string;
  tempDir?: string;
  cleanupOnExit?: boolean;
}

// Docker Configuration
export interface DockerConfig {
  socketPath: string;
  registry: string;
  host?: string;
  port?: number;
  timeout?: number;
  apiVersion?: string;
  buildArgs?: Record<string, string>;
}

// Kubernetes Configuration
export interface KubernetesConfig {
  kubeconfig: string;
  namespace: string;
  context?: string;
  timeout?: number;
  dryRun?: boolean;
}

// AI/ML Configuration
export interface AIConfig {
  provider?: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
  temperature?: number;
  maxTokens?: number;
  required?: boolean;
  requireConnection?: boolean;
}

// MCP Sampler Configuration
export interface SamplerConfig {
  mode: SamplerMode;
  templateDir: string;
  cacheEnabled: boolean;
  retryAttempts: number;
  retryDelayMs: number;
}

// Mock Configuration for Testing
export interface MockConfig {
  enabled: boolean;
  responsesDir?: string;
  deterministicMode: boolean;
  simulateLatency: boolean;
  errorRate: number;
  latencyRange?: {
    min: number;
    max: number;
  };
}

// Session Store Configuration
export interface SessionConfig {
  store: StoreType;
  ttl: number;
  maxSessions: number;
  persistencePath?: string;
  persistenceInterval?: number;
  cleanupInterval?: number;
}

// Logging Configuration
export interface LoggingConfig {
  level: LogLevel;
  format: 'json' | 'pretty';
  destination: 'console' | 'file' | 'both';
  filePath?: string;
  maxFileSize?: string;
  maxFiles?: number;
  enableColors?: boolean;
}

// Security Scanning Configuration
export interface ScanningConfig {
  enabled: boolean;
  scanner: 'trivy' | 'grype' | 'both';
  severityThreshold: 'low' | 'medium' | 'high' | 'critical';
  failOnVulnerabilities: boolean;
  skipUpdate?: boolean;
  timeout?: number;
}

// Build Configuration
export interface BuildConfig {
  enableCache: boolean;
  parallel: boolean;
  maxParallel?: number;
  buildArgs?: Record<string, string>;
  labels?: Record<string, string>;
  target?: string;
  squash?: boolean;
}

// Java-Specific Configuration
export interface JavaConfig {
  defaultVersion: string;
  defaultJvmHeapPercentage: number;
  enableNativeImage: boolean;
  enableJmx: boolean;
  enableProfiling: boolean;
}

// Workflow Configuration
export interface WorkflowConfig {
  mode: WorkflowMode;
  autoRetry: boolean;
  maxRetries: number;
  retryDelayMs: number;
  parallelSteps: boolean;
  skipOptionalSteps: boolean;
}

// Feature Flags
export interface FeatureFlags {
  aiEnabled: boolean;
  mockMode: boolean;
  enableMetrics: boolean;
  enableEvents: boolean;
  enablePerformanceMonitoring: boolean;
  enableDebugLogs: boolean;
  enableTracing: boolean;
  nonInteractive: boolean;
}

// Infrastructure Configuration (Docker + Kubernetes + External Tools)
export interface InfrastructureConfig {
  docker: DockerConfig;
  kubernetes: KubernetesConfig;
  scanning: ScanningConfig;
  build: BuildConfig;
  java: JavaConfig;
}

// AI Services Configuration
export interface AIServicesConfig {
  ai: AIConfig;
  sampler: SamplerConfig;
  mock: MockConfig;
}

// Main Application Configuration
export interface ApplicationConfig {
  server: ServerConfig;
  mcp: McpConfig;
  workspace: WorkspaceConfig;
  session: SessionConfig;
  logging: LoggingConfig;
  infrastructure: InfrastructureConfig;
  aiServices: AIServicesConfig;
  ai?: AIConfig; // Direct AI config access for compatibility
  workflow: WorkflowConfig;
  features: FeatureFlags;
}

// Configuration Options for Factory
export interface ConfigurationOptions {
  profile?: string;
  overrides?: Partial<ApplicationConfig>;
  envPrefix?: string;
  validateOnCreate?: boolean;
}

// Environment Variable Mapping Interface
export interface EnvironmentMapping {
  [key: string]: {
    path: string; // dot-notation path in ApplicationConfig
    type: 'string' | 'number' | 'boolean';
    default?: unknown;
    required?: boolean;
    description?: string;
  };
}

// Validation Result
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

// Deep partial type for nested configuration overrides
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Configuration Profile
export interface ConfigurationProfile {
  name: string;
  description: string;
  config: DeepPartial<ApplicationConfig>;
  envOverrides?: Record<string, string>;
}
