/**
 * Consolidated Zod schemas for tool input/output validation
 * Single source of truth - no duplicates
 */

import { z } from 'zod';

// ============= Base Input Schemas =============

/**
 * Base schema for tools requiring a session ID.
 * The session ID persists workflow state across tool invocations.
 * @property sessionId - Unique identifier for the workflow session
 */
export const SessionIdInput = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
});

// ============= Tool Input Schemas =============

export const RepoPathInput = z.object({
  repoPath: z.string().min(1, 'Repository path is required'),
});

export const AnalyzeRepositoryInput = RepoPathInput.extend({
  sessionId: z.string().optional(),
  depth: z.enum(['shallow', 'deep']).default('shallow'),
  includeTests: z.boolean().default(false),
});

export const GenerateDockerfileInput = SessionIdInput;

export const BuildImageInput = SessionIdInput.extend({
  context: z.string().default('.'),
  dockerfile: z.string().default('Dockerfile'),
  tag: z.string().optional(),
  tags: z.array(z.string()).optional(),
  buildArgs: z.record(z.string(), z.string()).optional(),
  target: z.string().optional(),
  noCache: z.boolean().default(false),
  platform: z.string().optional(),
  push: z.boolean().default(false),
  registry: z.string().optional(),
  squash: z.boolean().default(false),
  pull: z.boolean().default(true),
});

export const ScanImageInput = SessionIdInput;

export const TagImageInput = SessionIdInput.extend({
  tag: z.string().min(1, 'Tag is required'),
});

export const PushImageInput = SessionIdInput.extend({
  registry: z.string().optional(),
});

export const GenerateK8sManifestsInput = SessionIdInput;

export const PrepareClusterInput = SessionIdInput;

export const DeployApplicationInput = SessionIdInput.extend({
  namespace: z
    .string()
    .regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, 'Namespace must follow DNS-1123 naming rules')
    .max(63, 'Namespace must be 63 characters or less')
    .optional(),
  wait: z.boolean().default(false),
  timeout: z
    .union([
      z
        .string()
        .regex(/^\d+[smh]?$/, 'Timeout must be a positive number with optional unit (s/m/h)'),
      z.number().positive('Timeout must be a positive number'),
    ])
    .optional(),
  dryRun: z.boolean().default(false),
});

export const VerifyDeploymentInput = SessionIdInput;

export const FixDockerfileInput = SessionIdInput.extend({
  errorMessage: z.string().min(1, 'Error message is required'),
});

export const ServerStatusInput = z.object({
  details: z.boolean().optional(),
});

// ============= Base Output Schemas =============

export const BaseSuccessSchema = z.object({
  success: z.boolean(),
});

export const BaseSessionResultSchema = BaseSuccessSchema.extend({
  sessionId: z.string(),
});

// ============= Tool Output Schemas =============

export const AnalysisResultSchema = BaseSessionResultSchema.extend({
  language: z.string(),
  languageVersion: z.string().optional(),
  framework: z.string().optional(),
  frameworkVersion: z.string().optional(),
  buildSystem: z
    .object({
      type: z.string(),
      buildFile: z.string(),
      buildCommand: z.string().optional(),
      testCommand: z.string().optional(),
    })
    .optional(),
  dependencies: z.array(
    z.object({
      name: z.string(),
      version: z.string().optional(),
      type: z.enum(['runtime', 'dev', 'test']).optional(),
    }),
  ),
  ports: z.array(z.number()),
  hasDockerfile: z.boolean(),
  hasDockerCompose: z.boolean(),
  hasKubernetes: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  recommendations: z
    .object({
      baseImage: z.string().optional(),
      buildStrategy: z.string().optional(),
      securityNotes: z.array(z.string()).optional(),
    })
    .optional(),
});
export const DockerfileResultSchema = BaseSessionResultSchema.extend({
  dockerfile: z.string(),
  path: z.string(),
  validation: z.array(z.string()).optional(),
});

export const BuildResultSchema = BaseSessionResultSchema.extend({
  imageId: z.string(),
  tags: z.array(z.string()),
  size: z.number().optional(),
  layers: z.number().optional(),
  buildTime: z.number(),
  digest: z.string().optional(),
  warnings: z.array(z.string()).optional(),
  metadata: z.object({
    baseImage: z.string().optional(),
    platform: z.string().optional(),
    dockerfile: z.string(),
    context: z.string(),
    cached: z.boolean().optional(),
  }),
});

export const ScanResultSchema = BaseSessionResultSchema.extend({
  vulnerabilities: z.number(),
  critical: z.number(),
  high: z.number(),
  medium: z.number(),
  low: z.number(),
  details: z.array(z.any()).optional(),
});

export const K8sManifestsResultSchema = BaseSessionResultSchema.extend({
  manifests: z.string(),
  path: z.string(),
  resources: z.array(
    z.object({
      kind: z.string(),
      name: z.string(),
    }),
  ),
});

export const DeploymentResultSchema = BaseSessionResultSchema.extend({
  namespace: z.string(),
  deploymentName: z.string(),
  serviceName: z.string(),
  endpoint: z.string().optional(),
  ready: z.boolean(),
  replicas: z.number(),
});

export const ServerStatusSchema = BaseSuccessSchema.extend({
  version: z.string(),
  uptime: z.number(),
  memory: z.object({
    used: z.number(),
    total: z.number(),
  }),
  sessions: z.number().optional(),
  tools: z.number(),
});

// ============= Session Schemas =============

// ============= Type Exports =============

// Parameter types (keep ones actually used by tools)
export type AnalyzeRepositoryParams = z.infer<typeof AnalyzeRepositoryInput>;
export type GenerateDockerfileParams = z.infer<typeof GenerateDockerfileInput>;
export type BuildImageParams = z.infer<typeof BuildImageInput>;
export type ScanImageParams = z.infer<typeof ScanImageInput>;
export type TagImageParams = z.infer<typeof TagImageInput>;
export type PushImageParams = z.infer<typeof PushImageInput>;
export type GenerateK8sManifestsParams = z.infer<typeof GenerateK8sManifestsInput>;
export type PrepareClusterParams = z.infer<typeof PrepareClusterInput>;
export type DeployApplicationParams = z.infer<typeof DeployApplicationInput>;
export type VerifyDeploymentParams = z.infer<typeof VerifyDeploymentInput>;
export type FixDockerfileParams = z.infer<typeof FixDockerfileInput>;
export type ServerStatusParams = z.infer<typeof ServerStatusInput>;

// Result types that are actually used in tools
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type DockerfileResult = z.infer<typeof DockerfileResultSchema>;
export type BuildResult = z.infer<typeof BuildResultSchema>;
export type ScanResult = z.infer<typeof ScanResultSchema>;
export type K8sManifestsResult = z.infer<typeof K8sManifestsResultSchema>;
export type DeploymentResult = z.infer<typeof DeploymentResultSchema>;

export type ServerStatus = z.infer<typeof ServerStatusSchema>;

// ============= Helper Functions (removed unused) =============

// Note: validateInput and validateOutput functions were unused - removed
// Tools use their own validation logic via z.parse() directly
