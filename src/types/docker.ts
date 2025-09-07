/**
 * Unified Docker types for containerization operations
 * Consolidates Docker-related types from multiple locations into a single source
 * Provides comprehensive interfaces for Docker operations
 */

/**
 * Docker build options
 * Supports all major Docker build features and build tools
 */
export interface DockerBuildOptions {
  dockerfile?: string;
  dockerfilePath?: string;
  context: string;
  tag?: string;
  tags?: string[];
  buildArgs?: Record<string, string>;
  target?: string;
  noCache?: boolean;
  platform?: string;
  pull?: boolean;
  compress?: boolean;
  squash?: boolean;
  quiet?: boolean;
  forcerm?: boolean;
  rm?: boolean;
  labels?: Record<string, string>;
}

/**
 * Docker build result
 * Contains all information about a completed Docker build
 */
export interface DockerBuildResult {
  imageId: string;
  tag?: string;
  tags: string[];
  size?: number;
  layers?: number;
  buildTime?: number;
  logs: string[];
  digest?: string;
  warnings?: string[];
  buildId?: string;
  success: boolean;
  error?: string;
  stream?: string;
  aux?: Record<string, unknown>;
  method?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Docker security scan result
 * Supports multiple security scanners (Trivy, Grype, Snyk, etc.)
 */
export interface DockerScanResult {
  vulnerabilities: Array<{
    id?: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
    cve?: string;
    package: string;
    version: string;
    fixedVersion?: string;
    fixed_version?: string;
    description?: string;
    score?: number;
    vector?: string;
    references?: string[];
  }>;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    unknown?: number;
    total: number;
  };
  scanTime?: string;
  scan_duration_ms?: number;
  scanner?: 'trivy' | 'grype' | 'snyk';
  metadata?: {
    image: string;
    size?: number;
    os?: string;
    distro?: string;
    lastScanned?: string;
  } & Record<string, unknown>;
}

/**
 * Zod schema for Docker scan result validation
 */

/**
 * Zod schema for Docker push result validation
 */

/**
 * Zod schema for Docker tag result validation
 */
