/**
 * Zod schemas for tool input/output validation
 * Ensures type safety at runtime boundaries
 */

import { z } from 'zod';

// ============= Common Schemas =============

export const SessionIdSchema = z.object({
  session_id: z.string().min(1, 'Session ID is required')
});

export const RepoPathSchema = z.object({
  repo_path: z.string().min(1, 'Repository path is required')
});

// ============= Tool Input Schemas =============

export const AnalyzeRepositoryInput = RepoPathSchema;

export const ResolveBaseImagesInput = SessionIdSchema;

export const GenerateDockerfileInput = SessionIdSchema;

export const BuildImageInput = SessionIdSchema;

export const ScanImageInput = SessionIdSchema;

export const TagImageInput = SessionIdSchema.extend({
  tag: z.string().min(1, 'Tag is required')
});

export const PushImageInput = SessionIdSchema.extend({
  registry: z.string().optional()
});

export const GenerateK8sManifestsInput = SessionIdSchema;

export const PrepareClusterInput = SessionIdSchema;

export const DeployApplicationInput = SessionIdSchema;

export const VerifyDeploymentInput = SessionIdSchema;

export const StartWorkflowInput = z.object({
  repo_path: z.string().min(1, 'Repository path is required'),
  automated: z.boolean().optional().default(true),
  deploy: z.boolean().optional().default(true),
  scan: z.boolean().optional().default(true)
});

export const WorkflowStatusInput = SessionIdSchema;

export const FixDockerfileInput = SessionIdSchema.extend({
  error_message: z.string().min(1, 'Error message is required')
});

export const OptimizeJvmInput = SessionIdSchema.extend({
  memory_limit: z.string().optional(),
  cpu_limit: z.number().optional()
});

export const PingInput = z.object({
  message: z.string().optional()
});

export const ServerStatusInput = z.object({
  details: z.boolean().optional()
});

export const ListToolsInput = z.object({});

// ============= Tool Output Schemas =============

export const AnalysisResultSchema = z.object({
  success: z.boolean(),
  language: z.string(),
  framework: z.string().optional(),
  buildSystem: z.string(),
  javaVersion: z.string().optional(),
  port: z.number().optional(),
  dependencies: z.array(z.string()).optional(),
  hasTests: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const DockerfileResultSchema = z.object({
  success: z.boolean(),
  dockerfile: z.string(),
  path: z.string(),
  validation: z.array(z.string()).optional(),
  sessionId: z.string()
});

export const BuildResultSchema = z.object({
  success: z.boolean(),
  imageId: z.string(),
  imageName: z.string(),
  size: z.number(),
  layers: z.array(z.string()),
  buildTime: z.number(),
  sessionId: z.string()
});

export const ScanResultSchema = z.object({
  success: z.boolean(),
  vulnerabilities: z.number(),
  critical: z.number(),
  high: z.number(),
  medium: z.number(),
  low: z.number(),
  details: z.array(z.any()).optional(),
  sessionId: z.string()
});

export const K8sManifestsResultSchema = z.object({
  success: z.boolean(),
  manifests: z.string(),
  path: z.string(),
  resources: z.array(
    z.object({
      kind: z.string(),
      name: z.string()
    })
  ),
  sessionId: z.string()
});

export const DeploymentResultSchema = z.object({
  success: z.boolean(),
  namespace: z.string(),
  deploymentName: z.string(),
  serviceName: z.string(),
  endpoint: z.string().optional(),
  ready: z.boolean(),
  replicas: z.number(),
  sessionId: z.string()
});

export const WorkflowResultSchema = z.object({
  success: z.boolean(),
  workflowId: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  currentStep: z.string().optional(),
  completedSteps: z.array(z.string()),
  errors: z.record(z.string(), z.string()).optional()
});

export const ToolListSchema = z.object({
  success: z.boolean(),
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      category: z.enum(['workflow', 'orchestration', 'utility', 'optimization'])
    })
  )
});

export const PingResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  timestamp: z.string()
});

export const ServerStatusSchema = z.object({
  success: z.boolean(),
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

export type SessionId = z.infer<typeof SessionIdSchema>;
export type RepoPath = z.infer<typeof RepoPathSchema>;

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

/**
 * Export schema as JSON Schema for MCP
 */
export function exportJsonSchema(schema: z.ZodSchema): Record<string, unknown> {
  // Simple JSON Schema export (can be enhanced with zod-to-json-schema library)
  const shape = (schema as unknown)._def?.shape?.() || {};
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    if (value instanceof z.ZodString) {
      properties[key] = { type: 'string' };
    } else if (value instanceof z.ZodNumber) {
      properties[key] = { type: 'number' };
    } else if (value instanceof z.ZodBoolean) {
      properties[key] = { type: 'boolean' };
    } else if (value instanceof z.ZodArray) {
      properties[key] = { type: 'array' };
    } else if (value instanceof z.ZodObject) {
      properties[key] = { type: 'object' };
    }

    if (!(value as unknown).isOptional()) {
      required.push(key);
    }
  }

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined
  };
}
