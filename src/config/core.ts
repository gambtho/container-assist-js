/**
 * Core Configuration Types
 * Essential configurations used throughout the application
 */

export type NodeEnv = 'development' | 'production' | 'test';
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';
export type WorkflowMode = 'interactive' | 'auto' | 'batch';
export type StoreType = 'memory' | 'file' | 'redis';

// Server Configuration - Most used (7 references)
export interface ServerConfig {
  nodeEnv: NodeEnv;
  logLevel: LogLevel;
  port?: number;
  host?: string;
}

// Session Configuration - Frequently used (4 references)
export interface SessionConfig {
  store: StoreType;
  ttl: number;
  maxSessions: number;
  persistencePath: string;
  persistenceInterval: number;
  cleanupInterval: number;
}

// Feature Flags - Frequently used (5 references)
export interface FeatureFlags {
  mockMode: boolean;
  enableMetrics: boolean;
  enableEvents: boolean;
  enableDebugLogs: boolean;
  nonInteractive: boolean;
}

// Docker Configuration - Essential for containerization
export interface DockerConfig {
  socketPath: string;
  registry: string;
  host: string;
  port?: number;
  timeout: number;
  apiVersion: string;
  buildArgs: Record<string, string>;
}

// Kubernetes Configuration - Essential for deployment
export interface KubernetesConfig {
  kubeconfig: string;
  namespace: string;
  context: string;
  timeout: number;
  dryRun: boolean;
}

// Workflow Configuration - Frequently used (3 references)
export interface WorkflowConfig {
  mode: WorkflowMode;
  autoRetry: boolean;
  maxRetries: number;
  retryDelayMs: number;
  parallelSteps: boolean;
}

// MCP Configuration - Moved from advanced to core since tests depend on it
export interface McpConfig {
  storePath: string;
  sessionTTL: string;
  maxSessions: number;
  enableMetrics: boolean;
  enableEvents: boolean;
}

// Core Application Configuration - Only essential configs
export interface CoreConfig {
  server: ServerConfig;
  session: SessionConfig;
  features: FeatureFlags;
  docker: DockerConfig;
  kubernetes: KubernetesConfig;
  workflow: WorkflowConfig;
  mcp: McpConfig;
}
