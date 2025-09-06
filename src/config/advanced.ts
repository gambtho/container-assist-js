/**
 * Advanced Configuration Types
 * Optional configurations for specialized features
 */

export type SamplerMode = 'auto' | 'mock' | 'real';

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

// Logging Configuration
export interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug' | 'trace';
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

// Infrastructure Configuration (Advanced Docker + Kubernetes + External Tools)
export interface InfrastructureConfig {
  scanning: ScanningConfig;
  build: BuildConfig;
  java: JavaConfig;
}

// Advanced Configuration - All optional settings
export interface AdvancedConfig {
  mcp?: McpConfig;
  workspace?: WorkspaceConfig;
  logging?: LoggingConfig;
  infrastructure?: InfrastructureConfig;
}
