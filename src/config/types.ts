/**
 * Configuration Types
 */

// Type aliases for better type safety
export type NodeEnv = 'development' | 'production' | 'test';
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';
export type WorkflowMode = 'interactive' | 'auto' | 'batch';
export type StoreType = 'memory' | 'file' | 'redis';

// Extended configuration interface to match current usage
export interface ApplicationConfig {
  logLevel: LogLevel;
  workspaceDir: string;
  server: {
    nodeEnv: NodeEnv;
    logLevel: LogLevel;
    port: number;
    host: string;
  };
  session: {
    store: StoreType;
    ttl: number;
    maxSessions: number;
    persistencePath: string;
    persistenceInterval: number;
    cleanupInterval: number;
  };
  mcp: {
    name: string;
    version: string;
    storePath: string;
    sessionTTL: string;
    maxSessions: number;
    enableMetrics: boolean;
    enableEvents: boolean;
  };
  docker: {
    socketPath: string;
    host: string;
    port: number;
    registry: string;
    timeout: number;
    buildArgs: Record<string, string>;
  };
  kubernetes: {
    namespace: string;
    kubeconfig: string;
    timeout: number;
  };
  workspace: {
    workspaceDir: string;
    tempDir: string;
    cleanupOnExit: boolean;
  };
  logging: {
    level: LogLevel;
    format: string;
  };
  workflow: {
    mode: WorkflowMode;
  };
}
