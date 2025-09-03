/**
 * Security scanning types consolidated from multiple locations
 * Single source of truth for all security scanning interfaces
 */

import { z } from 'zod';

export type ScannerType = 'trivy' | 'grype' | 'snyk' | 'clair' | 'anchore';

export interface ScannerConfig {
  type: ScannerType;
  version?: string;
  timeout?: number;
  severity?: SeverityLevel[];
  skipFiles?: string[];
  skipDirs?: string[];
  offline?: boolean;
  insecure?: boolean;
  format?: 'json' | 'table' | 'sarif' | 'cyclonedx' | 'spdx';
  template?: string;
  ignoreUnfixed?: boolean;
  skipUpdate?: boolean;
  clearCache?: boolean;
}

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'unknown' | 'negligible';

export interface Vulnerability {
  id: string;
  cve?: string;
  severity: SeverityLevel;

  package: string;
  version: string;
  fixedVersion?: string;
  fixed_version?: string; // snake_case for compatibility

  title?: string;
  description?: string;

  score?: number;
  cvssVector?: string;
  cvssV2?: {
    score: number;
    vector: string;
  };
  cvssV3?: {
    score: number;
    vector: string;
  };

  references?: string[];
  urls?: string[];
  advisoryUrls?: string[];

  cwe?: string[];
  category?: string;
  packageType?: string;

  publishedDate?: string;
  lastModifiedDate?: string;

  layer?: {
    digest: string;
    diffId?: string;
    createdBy?: string;
  };
  primaryUrl?: string;

  fixState?: 'fixed' | 'not-fixed' | 'will-not-fix' | 'fix-deferred';
  installedVersion?: string;
  fixedIn?: string[];
}

export interface VulnerabilitySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  unknown?: number;
  negligible?: number;
  total: number;

  fixed?: number;
  unfixed?: number;
  ignored?: number;
}

export interface ScanOptions {
  severity?: SeverityLevel[];
  format?: string;
  template?: string;
  timeout?: number;
  ignoreUnfixed?: boolean;
  scanners?: string[];

  trivyOptions?: {
    skipUpdate?: boolean;
    skipFiles?: string[];
    skipDirs?: string[];
    ignoreUnfixed?: boolean;
    exitCode?: number;
    vulnType?: string[];
    securityChecks?: string[];
    listAllPackages?: boolean;
  };

  grypetOptions?: {
    scope?: 'squashed' | 'all-layers';
    configPath?: string;
    verbosity?: number;
    onlyFixed?: boolean;
  };

  snykOptions?: {
    org?: string;
    file?: string;
    packageManager?: string;
    allProjects?: boolean;
  };
}

export interface ScanResult {
  scanner: ScannerType;
  scannerVersion?: string;

  target: string;
  targetType: 'image' | 'filesystem' | 'repository';

  vulnerabilities: Vulnerability[];
  summary: VulnerabilitySummary;

  scanTime?: string;
  scan_duration_ms?: number;
  scanId?: string;

  metadata?: {
    imageId?: string;
    size?: number;
    os?: string;
    distro?: string;
    architecture?: string;
    created?: string;
    lastScanned?: string;
    layers?: number;
    digest?: string;
    tags?: string[];
  };

  config?: ScanOptions;

  rawOutput?: unknown;

  errors?: Array<{
    code?: string;
    message: string;
    details?: unknown;
  }>;

  compliance?: {
    passed: boolean;
    policies?: Array<{
      name: string;
      passed: boolean;
      violations: number;
      severity: SeverityLevel;
    }>;
  };
}

export interface ScanProgress {
  phase: 'initializing' | 'downloading' | 'analyzing' | 'reporting' | 'complete';
  progress: number;
  message: string;
  detail?: string;
  startTime: string;
  estimatedCompletion?: string;
}

export interface ScanHistory {
  scanId: string;
  target: string;
  scanner: ScannerType;
  timestamp: string;
  result: ScanResult;
  duration: number;
  success: boolean;
  error?: string;
}

export interface SecurityPolicy {
  name: string;
  description: string;
  rules: Array<{
    name: string;
    severity: SeverityLevel;
    condition: string; // e.g., "severity >= high"
    action: 'fail' | 'warn' | 'ignore';
  }>;
  exceptions?: Array<{
    cve: string;
    reason: string;
    expiry?: string;
  }>;
}

export interface ScanReport {
  id: string;
  format: 'json' | 'html' | 'pdf' | 'sarif' | 'cyclonedx' | 'spdx';
  content: string | Buffer;
  generatedAt: string;
  metadata: {
    target: string;
    scanner: ScannerType;
    totalVulnerabilities: number;
    highestSeverity: SeverityLevel;
  };
}

export const ScannerConfigSchema = z.object({
  type: z.enum(['trivy', 'grype', 'snyk', 'clair', 'anchore']),
  version: z.string().optional(),
  timeout: z.number().optional(),
  severity: z
    .array(z.enum(['critical', 'high', 'medium', 'low', 'unknown', 'negligible']))
    .optional(),
  skipFiles: z.array(z.string()).optional(),
  skipDirs: z.array(z.string()).optional(),
  offline: z.boolean().optional(),
  insecure: z.boolean().optional(),
  format: z.enum(['json', 'table', 'sarif', 'cyclonedx', 'spdx']).optional(),
  template: z.string().optional(),
  ignoreUnfixed: z.boolean().optional(),
  skipUpdate: z.boolean().optional(),
  clearCache: z.boolean().optional()
});

export const VulnerabilitySchema = z.object({
  id: z.string(),
  cve: z.string().optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'unknown', 'negligible']),
  package: z.string(),
  version: z.string(),
  fixedVersion: z.string().optional(),
  fixed_version: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  score: z.number().optional(),
  cvssVector: z.string().optional(),
  cvssV2: z
    .object({
      score: z.number(),
      vector: z.string()
    })
    .optional(),
  cvssV3: z
    .object({
      score: z.number(),
      vector: z.string()
    })
    .optional(),
  references: z.array(z.string()).optional(),
  urls: z.array(z.string()).optional(),
  advisoryUrls: z.array(z.string()).optional(),
  cwe: z.array(z.string()).optional(),
  category: z.string().optional(),
  packageType: z.string().optional(),
  publishedDate: z.string().optional(),
  lastModifiedDate: z.string().optional(),
  layer: z
    .object({
      digest: z.string(),
      diffId: z.string().optional(),
      createdBy: z.string().optional()
    })
    .optional(),
  primaryUrl: z.string().optional(),
  fixState: z.enum(['fixed', 'not-fixed', 'will-not-fix', 'fix-deferred']).optional(),
  installedVersion: z.string().optional(),
  fixedIn: z.array(z.string()).optional()
});

export const VulnerabilitySummarySchema = z.object({
  critical: z.number(),
  high: z.number(),
  medium: z.number(),
  low: z.number(),
  unknown: z.number().optional(),
  negligible: z.number().optional(),
  total: z.number(),
  fixed: z.number().optional(),
  unfixed: z.number().optional(),
  ignored: z.number().optional()
});

export const ScanResultSchema = z.object({
  scanner: z.enum(['trivy', 'grype', 'snyk', 'clair', 'anchore']),
  scannerVersion: z.string().optional(),
  target: z.string(),
  targetType: z.enum(['image', 'filesystem', 'repository']),
  vulnerabilities: z.array(VulnerabilitySchema),
  summary: VulnerabilitySummarySchema,
  scanTime: z.string().optional(),
  scan_duration_ms: z.number().optional(),
  scanId: z.string().optional(),
  metadata: z
    .object({
      imageId: z.string().optional(),
      size: z.number().optional(),
      os: z.string().optional(),
      distro: z.string().optional(),
      architecture: z.string().optional(),
      created: z.string().optional(),
      lastScanned: z.string().optional(),
      layers: z.number().optional(),
      digest: z.string().optional(),
      tags: z.array(z.string()).optional()
    })
    .optional(),
  config: z.any().optional(),
  rawOutput: z.any().optional(),
  errors: z
    .array(
      z.object({
        code: z.string().optional(),
        message: z.string(),
        details: z.any().optional()
      })
    )
    .optional(),
  compliance: z
    .object({
      passed: z.boolean(),
      policies: z
        .array(
          z.object({
            name: z.string(),
            passed: z.boolean(),
            violations: z.number(),
            severity: z.enum(['critical', 'high', 'medium', 'low', 'unknown', 'negligible'])
          })
        )
        .optional()
    })
    .optional()
});

export const SecurityPolicySchema = z.object({
  name: z.string(),
  description: z.string(),
  rules: z.array(
    z.object({
      name: z.string(),
      severity: z.enum(['critical', 'high', 'medium', 'low', 'unknown', 'negligible']),
      condition: z.string(),
      action: z.enum(['fail', 'warn', 'ignore'])
    })
  ),
  exceptions: z
    .array(
      z.object({
        cve: z.string(),
        reason: z.string(),
        expiry: z.string().optional()
      })
    )
    .optional()
});

export type ScannerConfigType = z.infer<typeof ScannerConfigSchema>;
export type VulnerabilityType = z.infer<typeof VulnerabilitySchema>;
export type VulnerabilitySummaryType = z.infer<typeof VulnerabilitySummarySchema>;
export type ScanResultType = z.infer<typeof ScanResultSchema>;
export type SecurityPolicyType = z.infer<typeof SecurityPolicySchema>;
