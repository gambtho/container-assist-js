/**
 * Consolidated Zod schemas for tool input/output validation
 * Single source of truth - no duplicates
 */

import { z } from 'zod';

// ============= Base Input Schemas =============

export const SessionIdInput = z.object({
  sessionId: z.string().min(1, 'Session ID is required')
});

// ============= Tool Input Schemas =============



export const ResolveBaseImagesInput = SessionIdInput;

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
  pull: z.boolean().default(true)
});

export const ScanImageInput = SessionIdInput;

export const TagImageInput = SessionIdInput.extend({
  tag: z.string().min(1, 'Tag is required')
});

export const PushImageInput = SessionIdInput.extend({
  registry: z.string().optional()
});

export const GenerateK8sManifestsInput = SessionIdInput;

export const PrepareClusterInput = SessionIdInput;

export const DeployApplicationInput = SessionIdInput;

export const VerifyDeploymentInput = SessionIdInput;

export const StartWorkflowInput = RepoPathInput.extend({
  automated: z.boolean().default(true),
  deploy: z.boolean().default(true),
  scan: z.boolean().default(true)
});

export const WorkflowStatusInput = SessionIdInput;

export const FixDockerfileInput = SessionIdInput.extend({
  errorMessage: z.string().min(1, 'Error message is required')
});

export const OptimizeJvmInput = SessionIdInput.extend({
  memoryLimit: z.string().optional(),
  cpuLimit: z.number().optional()
});

export const PingInput = z.object({
  message: z.string().optional()
});

export const ServerStatusInput = z.object({
  details: z.boolean().optional()
});

export const ListToolsInput = z.object({});

// ============= Base Output Schemas =============

export const BaseSuccessSchema = z.object({
  success: z.boolean()
});

export const BaseSessionResultSchema = BaseSuccessSchema.extend({
  sessionId: z.string()
});

// ============= Tool Output Schemas =============

export const DockerfileResultSchema = BaseSessionResultSchema.extend({
  dockerfile: z.string(),
  path: z.string(),
  validation: z.array(z.string()).optional()
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
    cached: z.boolean().optional()
  })
});

export const ScanResultSchema = BaseSessionResultSchema.extend({
  vulnerabilities: z.number(),
  critical: z.number(),
  high: z.number(),
  medium: z.number(),
  low: z.number(),
  details: z.array(z.any()).optional()
});

export const K8sManifestsResultSchema = BaseSessionResultSchema.extend({
  manifests: z.string(),
  path: z.string(),
  resources: z.array(
    z.object({
      kind: z.string(),
      name: z.string()
    })
  )
});

export const DeploymentResultSchema = BaseSessionResultSchema.extend({
  namespace: z.string(),
  deploymentName: z.string(),
  serviceName: z.string(),
  endpoint: z.string().optional(),
  ready: z.boolean(),
  replicas: z.number()
});

export const WorkflowResultSchema = BaseSuccessSchema.extend({
  workflowId: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  currentStep: z.string().optional(),
  completedSteps: z.array(z.string()),
  errors: z.record(z.string(), z.string()).optional()
});

export const ToolListSchema = BaseSuccessSchema.extend({
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      category: z.enum(['workflow', 'orchestration', 'utility', 'optimization'])
    })
  )
});

export const PingResultSchema = BaseSuccessSchema.extend({
  message: z.string(),
  timestamp: z.string()
});

export const ServerStatusSchema = BaseSuccessSchema.extend({
  version: z.string(),
  uptime: z.number(),
  memory: z.object({
    used: z.number(),
    total: z.number()
  }),
  sessions: z.number().optional(),
  tools: z.number()
});

// ============= Session Schemas =============

export const SessionStatusEnum = z.enum([
  'pending',
  'analyzing',
  'building',
  'deploying',
  'completed',
  'failed'
]);

export const WorkflowStateSchema = z.object({
  currentStep: z.string().nullable(),
  completedSteps: z.array(z.string()),
  analysisResult: z.any().optional(),
  dockerfileResult: z.any().optional(),
  buildResult: z.any().optional(),
  scanResult: z.any().optional(),
  k8sManifests: z.any().optional(),
  deploymentResult: z.any().optional(),
  errors: z.record(z.string(), z.string()),
  metadata: z.record(z.string(), z.unknown())
});

export const SessionSchema = z.object({
  id: z.string(),
  status: SessionStatusEnum,
  repoPath: z.string(),
  workflowState: WorkflowStateSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  config: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  version: z.number().default(0)
});

// ============= Type Exports =============

export type SessionIdParams = z.infer<typeof SessionIdInput>;
export type RepoPathParams = z.infer<typeof RepoPathInput>;

export type AnalyzeRepositoryParams = z.infer<typeof AnalyzeRepositoryInput>;
export type ResolveBaseImagesParams = z.infer<typeof ResolveBaseImagesInput>;
export type GenerateDockerfileParams = z.infer<typeof GenerateDockerfileInput>;
export type BuildImageParams = z.infer<typeof BuildImageInput>;
export type ScanImageParams = z.infer<typeof ScanImageInput>;
export type TagImageParams = z.infer<typeof TagImageInput>;
export type PushImageParams = z.infer<typeof PushImageInput>;
export type GenerateK8sManifestsParams = z.infer<typeof GenerateK8sManifestsInput>;
export type PrepareClusterParams = z.infer<typeof PrepareClusterInput>;
export type DeployApplicationParams = z.infer<typeof DeployApplicationInput>;
export type VerifyDeploymentParams = z.infer<typeof VerifyDeploymentInput>;
export type StartWorkflowParams = z.infer<typeof StartWorkflowInput>;
export type WorkflowStatusParams = z.infer<typeof WorkflowStatusInput>;
export type FixDockerfileParams = z.infer<typeof FixDockerfileInput>;
export type OptimizeJvmParams = z.infer<typeof OptimizeJvmInput>;
export type PingParams = z.infer<typeof PingInput>;
export type ServerStatusParams = z.infer<typeof ServerStatusInput>;
export type ListToolsParams = z.infer<typeof ListToolsInput>;

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type DockerfileResult = z.infer<typeof DockerfileResultSchema>;
export type BuildResult = z.infer<typeof BuildResultSchema>;
export type ScanResult = z.infer<typeof ScanResultSchema>;
export type K8sManifestsResult = z.infer<typeof K8sManifestsResultSchema>;
export type DeploymentResult = z.infer<typeof DeploymentResultSchema>;
export type WorkflowResult = z.infer<typeof WorkflowResultSchema>;
export type ToolList = z.infer<typeof ToolListSchema>;
export type PingResult = z.infer<typeof PingResultSchema>;
export type ServerStatus = z.infer<typeof ServerStatusSchema>;

export type SessionStatus = z.infer<typeof SessionStatusEnum>;
export type WorkflowState = z.infer<typeof WorkflowStateSchema>;
export type Session = z.infer<typeof SessionSchema>;

// ============= Helper Functions =============

/**
 * Validate tool input
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      return { success: false, error: messages.join(', ') };
    }
    return { success: false, error: String(error) };
  }
}

/**
 * Validate tool output
 */
export function validateOutput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}
