/**
 * Unified Docker types for containerization operations
 * Consolidates Docker-related types from multiple locations into a single source
 * Provides comprehensive interfaces for Docker operations
 */

import { z } from 'zod';

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
 * Zod schema for Docker build result validation
 */
export const DockerBuildResultSchema = z.object({
  success: z.boolean(),
  imageId: z.string(),
  tags: z.array(z.string()).optional(),
  size: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

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
 * Docker image information
 */
export interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  digest?: string;
  size?: number;
  created: string;
  labels?: Record<string, string>;
  repoTags?: string[];
  repoDigests?: string[];
  parentId?: string;
  comment?: string;
  author?: string;
  architecture?: string;
  os?: string;
  config?: {
    env?: string[];
    cmd?: string[];
    entrypoint?: string[];
    workingDir?: string;
    user?: string;
    exposedPorts?: Record<string, Record<string, unknown>>;
  };
}

/**
 * Docker push result
 */
export interface DockerPushResult {
  registry: string;
  repository: string;
  tag: string;
  digest: string;
  push_duration_ms?: number;
  success: boolean;
  error?: string;
}

/**
 * Zod schema for Docker push result validation
 */

/**
 * Docker tag result
 */
export interface DockerTagResult {
  sourceImage: string;
  targetTag: string;
  success: boolean;
  error?: string;
}

/**
 * Zod schema for Docker tag result validation
 */

/**
 * Dockerfile fix information
 */

/**
 * Zod schema for Dockerfile fix validation
 */

/**
 * Docker registry configuration
 */
export interface DockerRegistryConfig {
  url?: string;
  username?: string;
  password?: string;
  email?: string;
  serveraddress?: string;
}

/**
 * Docker container information
 */
export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: 'created' | 'running' | 'paused' | 'restarting' | 'removing' | 'exited' | 'dead';
  ports?: Array<{
    privatePort: number;
    publicPort?: number;
    type: string;
  }>;
  labels?: Record<string, string>;
  created: string;
  command?: string;
  mounts?: Array<{
    type: string;
    source: string;
    destination: string;
    mode: string;
    rw: boolean;
  }>;
}

/**
 * Scan options for security scanning
 */
export interface ScanOptions {
  scanner?: 'trivy' | 'grype' | 'snyk';
  severityThreshold?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  skipDbUpdate?: boolean;
  timeout?: number;
  format?: 'json' | 'table' | 'sarif';
  outputFile?: string;
}

/**
 * Docker client interface for lib layer
 */
export interface DockerClient {
  // Build operations
  build(options: DockerBuildOptions): Promise<DockerBuildResult>;

  // Image operations
  getImage(id: string): Promise<DockerImage | null>;
  listImages(options?: {
    all?: boolean;
    filters?: Record<string, string[]>;
  }): Promise<DockerImage[]>;
  removeImage(id: string, options?: { force?: boolean }): Promise<void>;
  tagImage(sourceImage: string, targetTag: string): Promise<DockerTagResult>;

  // Registry operations
  push(image: string, options?: DockerRegistryConfig): Promise<DockerPushResult>;
  pull(image: string, options?: DockerRegistryConfig): Promise<void>;

  // Container operations
  listContainers(options?: {
    all?: boolean;
    filters?: Record<string, string[]>;
  }): Promise<DockerContainer[]>;

  // Security scanning
  scan(image: string, options?: ScanOptions): Promise<DockerScanResult>;

  // Utility operations
  ping(): Promise<boolean>;
  version(): Promise<{ version: string; apiVersion: string }>;
}

// ===== BASE IMAGE RECOMMENDATION TYPES =====

/**
 * Base image recommendation schema for AI-powered base image selection
 */
export const BaseImageRecommendationSchema = z.object({
  primary_recommendation: z.object({
    image: z.string(),
    reasoning: z.string(),
    security_notes: z.string(),
    performance_notes: z.string(),
    tradeoffs: z.string(),
  }),
  alternatives: z.array(
    z.object({
      image: z.string(),
      use_case: z.string(),
      pros: z.array(z.string()),
      cons: z.array(z.string()),
    }),
  ),
  security_considerations: z.object({
    vulnerability_status: z.string(),
    update_frequency: z.string(),
    compliance: z.string(),
  }),
  optimization_tips: z.array(z.string()),
  health_check_recommendation: z.object({
    endpoint: z.string(),
    command: z.string(),
  }),
});

export const BaseImageResolutionInputSchema = z.object({
  session_id: z.string(),
  security_level: z.enum(['minimal', 'standard', 'hardened']).optional().default('standard'),
  performance_priority: z.enum(['size', 'speed', 'memory']).optional().default('size'),
  target_environment: z.enum(['cloud', 'on-prem', 'edge']).optional().default('cloud'),
  architectures: z.array(z.string()).optional().default(['amd64']),
  compliance_requirements: z.string().optional(),
});

export type BaseImageRecommendation = z.infer<typeof BaseImageRecommendationSchema>;
export type BaseImageResolutionInput = z.infer<typeof BaseImageResolutionInputSchema>;
