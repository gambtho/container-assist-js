/**
 * Docker build options
 * Supports all major Docker build features and build tools
 *
 * @example
 * ```typescript`
 * const options: DockerBuildOptions = {
 *   context: './app',
 *   tags: ['myapp:latest'],
 *   buildArgs: { NODE_ENV: 'production' },
 *   noCache: true
 * }
 * ````
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
 *
 * @example
 * ```typescript`
 * const result: DockerBuildResult = {
 *   imageId: 'sha256:abc123...',
 *   tags: ['myapp:latest'],
 *   success: true,
 *   logs: ['Step 1/5 : FROM node:18...'],
 *   buildTime: 45000
 * }
 * ````
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
}

/**
 * Docker security scan result - consolidated single source of truth
 * Supports multiple security scanners (Trivy, Grype, Snyk, etc.)
 *
 * @example
 * ```typescript`
 * const scanResult: DockerScanResult = {
 *   vulnerabilities: [{
 *     severity: 'high',
 *     package: 'openssl',
 *     version: '1.1.1',
 *     fixedVersion: '1.1.1k'
 *   }],
 *   summary: { critical: 0, high: 1, medium: 2, low: 5, total: 8 },
 *   scanner: 'trivy'
 * }
 * ````
 */
export interface DockerScanResult {
  vulnerabilities: Array<{
    id?: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'unknown';
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
  };
}

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

export interface DockerPushResult {
  registry: string;
  repository: string;
  tag: string;
  digest: string;
  push_duration_ms?: number;
  size?: number;
  layers?: number;
  success: boolean;
  error?: string;
  warnings?: string[];
  status?: string;
  progress?: string;
  id?: string;
  progressDetail?: {
    current?: number;
    total?: number;
  };
  aux?: {
    Tag?: string;
    Digest?: string;
    Size?: number;
  };
}

export interface DockerTagResult {
  tags: string[];
  registry?: string;
  repository?: string;
  success: boolean;
  error?: string;
}

export interface DockerSystemInfo {
  Containers?: number;
  ContainersRunning?: number;
  ContainersPaused?: number;
  ContainersStopped?: number;
  Images?: number;
  ServerVersion?: string;
  Architecture?: string;
  OperatingSystem?: string;
  OSType?: string;
  KernelVersion?: string;
  MemTotal?: number;
  NCPU?: number;
  Driver?: string;
  LoggingDriver?: string;
  [key: string]: unknown;
}

export interface ScanOptions {
  severity?: string[];
  ignoreUnfixed?: boolean;
  scanners?: string[];
  format?: string;
  exitCode?: number;
}

export interface DockerfileFix {
  root_cause_analysis: string;
  fixed_dockerfile: string;
  changes_made: Array<{
    line_changed: string;
    old_content: string;
    new_content: string;
    reasoning: string;
  }>;
  security_improvements: string[];
  performance_optimizations: string[];
  alternative_approaches: Array<{
    approach: string;
    pros: string[];
    cons: string[];
    when_to_use: string;
  }>;
  testing_recommendations: string[];
  prevention_tips: string[];
}

export interface DockerfileFixHistory {
  error: string;
  fix: DockerfileFix;
  timestamp: string;
}

import { z } from 'zod';

export const DockerBuildOptionsSchema = z.object({
  dockerfile: z.string().optional(),
  dockerfilePath: z.string().optional(),
  context: z.string(),
  tag: z.string().optional(),
  tags: z.array(z.string()).optional(),
  buildArgs: z.record(z.string(), z.string()).optional(),
  target: z.string().optional(),
  noCache: z.boolean().optional(),
  platform: z.string().optional(),
  pull: z.boolean().optional(),
  compress: z.boolean().optional(),
  squash: z.boolean().optional(),
  quiet: z.boolean().optional(),
  forcerm: z.boolean().optional(),
  rm: z.boolean().optional(),
  labels: z.record(z.string(), z.string()).optional(),
});

export const DockerBuildResultSchema = z.object({
  imageId: z.string(),
  tag: z.string().optional(),
  tags: z.array(z.string()),
  size: z.number().optional(),
  layers: z.number().optional(),
  buildTime: z.number().optional(),
  logs: z.array(z.string()),
  digest: z.string().optional(),
  warnings: z.array(z.string()).optional(),
  buildId: z.string().optional(),
  success: z.boolean(),
  error: z.string().optional(),
  stream: z.string().optional(),
  aux: z.any().optional(),
  method: z.string().optional(),
});

export const DockerScanResultSchema = z.object({
  vulnerabilities: z.array(
    z.object({
      id: z.string().optional(),
      severity: z.enum(['critical', 'high', 'medium', 'low', 'unknown']),
      cve: z.string().optional(),
      package: z.string(),
      version: z.string(),
      fixedVersion: z.string().optional(),
      fixed_version: z.string().optional(),
      description: z.string().optional(),
      score: z.number().optional(),
      vector: z.string().optional(),
      references: z.array(z.string()).optional(),
    }),
  ),
  summary: z.object({
    critical: z.number(),
    high: z.number(),
    medium: z.number(),
    low: z.number(),
    unknown: z.number().optional(),
    total: z.number(),
  }),
  scanTime: z.string().optional(),
  scan_duration_ms: z.number().optional(),
  scanner: z.enum(['trivy', 'grype', 'snyk']).optional(),
  metadata: z
    .object({
      image: z.string(),
      size: z.number().optional(),
      os: z.string().optional(),
      distro: z.string().optional(),
      lastScanned: z.string().optional(),
    })
    .optional(),
});

export const DockerPushResultSchema = z.object({
  registry: z.string(),
  repository: z.string(),
  tag: z.string(),
  digest: z.string(),
  push_duration_ms: z.number().optional(),
  size: z.number().optional(),
  layers: z.number().optional(),
  success: z.boolean(),
  error: z.string().optional(),
  warnings: z.array(z.string()).optional(),
  status: z.string().optional(),
  progress: z.string().optional(),
  id: z.string().optional(),
  progressDetail: z.any().optional(),
  aux: z
    .object({
      Tag: z.string().optional(),
      Digest: z.string().optional(),
      Size: z.number().optional(),
    })
    .optional(),
});

export const DockerTagResultSchema = z.object({
  tags: z.array(z.string()),
  registry: z.string().optional(),
  repository: z.string().optional(),
  success: z.boolean(),
  error: z.string().optional(),
});

export const DockerfileFixSchema = z.object({
  root_cause_analysis: z.string(),
  fixed_dockerfile: z.string(),
  changes_made: z.array(
    z.object({
      line_changed: z.string(),
      old_content: z.string(),
      new_content: z.string(),
      reasoning: z.string(),
    }),
  ),
  security_improvements: z.array(z.string()),
  performance_optimizations: z.array(z.string()),
  alternative_approaches: z.array(
    z.object({
      approach: z.string(),
      pros: z.array(z.string()),
      cons: z.array(z.string()),
      when_to_use: z.string(),
    }),
  ),
  testing_recommendations: z.array(z.string()),
  prevention_tips: z.array(z.string()),
});
