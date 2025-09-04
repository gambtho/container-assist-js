/**
 * Enhanced Workflow State Types
 * Comprehensive type definitions to address unsafe type operations
 */

import { z } from 'zod';

/**
 * Extended workflow metadata schema with comprehensive coverage
 */
export const WorkflowMetadataSchema = z.object({
  // Core metadata
  created_at: z.string(),
  updated_at: z.string(),
  version: z.string(),
  session_id: z.string().optional(),

  // Repository analysis
  language: z.string().optional(),
  framework: z.string().optional(),
  build_system: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  package_manager: z.string().optional(),

  // Docker-related metadata
  base_image: z.string().optional(),
  dockerfile_path: z.string().optional(),
  image_tag: z.string().optional(),
  image_id: z.string().optional(),
  build_context: z.string().optional(),

  // Kubernetes metadata
  namespace: z.string().optional(),
  cluster_context: z.string().optional(),
  deployment_name: z.string().optional(),
  service_port: z.number().optional(),
  replicas: z.number().optional(),

  // Analysis results
  ports: z.array(z.number()).optional(),
  env_vars: z.record(z.string()).optional(),
  volumes: z.array(z.string()).optional(),

  // Step-specific data
  analysis_result: z.unknown().optional(),
  dockerfile_content: z.string().optional(),
  build_logs: z.string().optional(),
  scan_results: z.unknown().optional(),
  manifest_content: z.string().optional(),
  deployment_status: z.string().optional(),
});

/**
 * Enhanced workflow state with properly typed fields
 */
export const EnhancedWorkflowStateSchema = z.object({
  id: z.string(),
  status: z.enum(['active', 'completed', 'failed', 'paused']),
  current_step: z.string(),
  steps: z.array(z.string()),
  progress: z.number().min(0).max(1),
  error: z.string().optional(),
  metadata: WorkflowMetadataSchema,
  step_results: z.record(z.unknown()).optional(),

  // Additional state tracking
  started_at: z.string(),
  completed_at: z.string().optional(),
  last_activity: z.string(),

  // Context information
  repo_path: z.string(),
  workspace_id: z.string().optional(),
  user_id: z.string().optional(),
});

/**
 * Service response wrapper for consistent API responses
 */
export const ServiceResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Docker service response types
 */
export const DockerServiceResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .union([
      z.object({
        imageId: z.string(),
        imageTag: z.string(),
        buildTime: z.number().optional(),
        buildLogs: z.string().optional(),
      }),
      z.object({
        containers: z.array(z.unknown()),
      }),
      z.unknown(),
    ])
    .optional(),
  error: z.string().optional(),
});

/**
 * Kubernetes service response types
 */
export const KubernetesServiceResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .union([
      z.object({
        deploymentId: z.string(),
        namespace: z.string(),
        status: z.string(),
        podCount: z.number().optional(),
      }),
      z.array(
        z.object({
          name: z.string(),
          namespace: z.string(),
          status: z.string(),
        }),
      ),
      z.unknown(),
    ])
    .optional(),
  error: z.string().optional(),
});

/**
 * AI service response types
 */
export const AIServiceResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .union([
      z.string(), // For text responses
      z.object({
        content: z.string(),
        metadata: z.record(z.unknown()).optional(),
        insights: z.unknown().optional(),
        optimizations: z.unknown().optional(),
        security: z.unknown().optional(),
        baseImage: z.string().optional(),
        buildStrategy: z.string().optional(),
      }),
      z.unknown(),
    ])
    .optional(),
  error: z.string().optional(),
});

/**
 * Type exports
 */
export type WorkflowMetadata = z.infer<typeof WorkflowMetadataSchema>;
export type EnhancedWorkflowState = z.infer<typeof EnhancedWorkflowStateSchema>;
export type ServiceResponse = z.infer<typeof ServiceResponseSchema>;
export type DockerServiceResponse = z.infer<typeof DockerServiceResponseSchema>;
export type KubernetesServiceResponse = z.infer<typeof KubernetesServiceResponseSchema>;
export type AIServiceResponse = z.infer<typeof AIServiceResponseSchema>;

/**
 * Type guards for runtime validation
 */
export function isServiceResponse(obj: unknown): obj is ServiceResponse {
  return ServiceResponseSchema.safeParse(obj).success;
}

export function isDockerServiceResponse(obj: unknown): obj is DockerServiceResponse {
  return DockerServiceResponseSchema.safeParse(obj).success;
}

export function isKubernetesServiceResponse(obj: unknown): obj is KubernetesServiceResponse {
  return KubernetesServiceResponseSchema.safeParse(obj).success;
}

export function isAIServiceResponse(obj: unknown): obj is AIServiceResponse {
  return AIServiceResponseSchema.safeParse(obj).success;
}

export function isWorkflowMetadata(obj: unknown): obj is WorkflowMetadata {
  return WorkflowMetadataSchema.safeParse(obj).success;
}

/**
 * Safe getters with fallbacks
 */
export function safeGetWorkflowState(data: unknown): EnhancedWorkflowState | null {
  const result = EnhancedWorkflowStateSchema.safeParse(data);
  return result.success ? result.data : null;
}

export function safeGetMetadataField<T>(
  metadata: unknown,
  field: keyof WorkflowMetadata,
  defaultValue: T,
): T {
  if (isWorkflowMetadata(metadata)) {
    const value = metadata[field];
    return value !== undefined ? (value as T) : defaultValue;
  }
  return defaultValue;
}

/**
 * Mock data creators for testing
 */
export function createMockWorkflowMetadata(
  overrides?: Partial<WorkflowMetadata>,
): WorkflowMetadata {
  return {
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: '1.0.0',
    ...overrides,
  };
}

export function createMockEnhancedWorkflowState(
  overrides?: Partial<EnhancedWorkflowState>,
): EnhancedWorkflowState {
  return {
    id: `workflow-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    status: 'active',
    current_step: 'analysis',
    steps: ['analysis', 'dockerfile', 'build', 'deploy'],
    progress: 0,
    metadata: createMockWorkflowMetadata(),
    started_at: new Date().toISOString(),
    last_activity: new Date().toISOString(),
    repo_path: '/tmp/test-repo',
    ...overrides,
  };
}
