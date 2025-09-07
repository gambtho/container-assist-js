/**
 * Advanced Configuration Types
 * Optional configurations for specialized features
 */

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