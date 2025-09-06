/**
 * Unified session types for workflow state management with Zod validation
 * Consolidates session-related types from multiple locations into a single source
 * Provides complete type safety and runtime validation
 */

import { z } from 'zod';

// Session types and utilities for managing containerization workflows

/**
 * Analysis result schema for repository analysis
 */
const AnalysisResultSchema = z.object({
  language: z.string(),
  language_version: z.string().optional(),
  framework: z.string().optional(),
  framework_version: z.string().optional(),
  build_system: z
    .object({
      type: z.string(),
      build_file: z.string(),
      build_command: z.string().optional(),
    })
    .optional(),
  dependencies: z
    .array(
      z.object({
        name: z.string(),
        version: z.string().optional(),
        type: z.enum(['runtime', 'dev', 'test']).optional(),
      }),
    )
    .optional(),
  has_tests: z.boolean().default(false),
  test_framework: z.string().optional(),
  database: z.string().optional().nullable(),
  required_ports: z.array(z.number()).optional(),
  ports: z.array(z.number()).optional(),
  env_variables: z.record(z.string(), z.string()).optional(),
  docker_compose_exists: z.boolean().default(false),
  ci_cd_platform: z.string().optional(),
  java_version: z.string().optional(),
  build_tool_version: z.string().optional(),
  packaging: z.enum(['jar', 'war', 'ear']).optional(),
  recommendations: z
    .object({
      baseImage: z.string().optional(),
      buildStrategy: z.string().optional(),
      securityNotes: z.array(z.string()).optional(),
    })
    .optional(),
});

/**
 * Dockerfile generation result schema
 */
const DockerfileResultSchema = z.object({
  content: z.string(),
  path: z.string(),
  base_image: z.string().optional(),
  stages: z.array(z.string()).optional(),
  optimizations: z.array(z.string()).optional(),
  multistage: z.boolean().default(false),
});

/**
 * Docker build result schema
 */
const DockerBuildResultSchema = z.object({
  success: z.boolean(),
  imageId: z.string(),
  tags: z.array(z.string()).optional(),
  size: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Security scan result schema
 */
const ScanResultSchema = z.object({
  success: z.boolean(),
  vulnerabilities: z
    .array(
      z.object({
        id: z.string(),
        severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
        package: z.string(),
        version: z.string(),
        description: z.string(),
        fixedVersion: z.string().optional(),
      }),
    )
    .optional(),
  summary: z
    .object({
      total: z.number(),
      low: z.number(),
      medium: z.number(),
      high: z.number(),
      critical: z.number(),
    })
    .optional(),
});

/**
 * Kubernetes manifest generation result schema
 */
const K8sManifestResultSchema = z.object({
  manifests: z.array(
    z.object({
      kind: z.string(),
      name: z.string(),
      namespace: z.string().optional(),
      content: z.string(),
      file_path: z.string(),
    }),
  ),
  deployment_strategy: z.enum(['rolling', 'recreate', 'blue-green', 'canary']).optional(),
  replicas: z.number().default(1),
  resources: z
    .object({
      requests: z
        .object({
          cpu: z.string().optional(),
          memory: z.string().optional(),
        })
        .optional(),
      limits: z
        .object({
          cpu: z.string().optional(),
          memory: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  output_path: z.string().optional(),
});

/**
 * Deployment result schema
 */
const DeploymentResultSchema = z.object({
  namespace: z.string(),
  deployment_name: z.string(),
  service_name: z.string().optional(),
  endpoints: z
    .array(
      z.object({
        type: z.enum(['internal', 'external', 'nodeport', 'loadbalancer']),
        url: z.string(),
        port: z.number(),
      }),
    )
    .optional(),
  status: z.object({
    ready_replicas: z.number(),
    total_replicas: z.number(),
    conditions: z
      .array(
        z.object({
          type: z.string(),
          status: z.string(),
          reason: z.string().optional(),
          message: z.string().optional(),
        }),
      )
      .optional(),
  }),
  deployment_duration_ms: z.number().optional(),
  ready: z.boolean().default(false),
});

/**
 * Workflow state schema - tracks all workflow step results
 */
export const WorkflowStateSchema = z.object({
  current_step: z.string().nullable().optional(),
  completed_steps: z.array(z.string()).default([]),

  analysis_result: AnalysisResultSchema.optional(),
  dockerfile_result: DockerfileResultSchema.optional(),
  build_result: DockerBuildResultSchema.optional(),
  scan_result: ScanResultSchema.optional(),
  k8s_result: K8sManifestResultSchema.optional(),

  cluster_result: z
    .object({
      cluster_name: z.string(),
      context: z.string(),
      kubernetes_version: z.string(),
      namespaces_created: z.array(z.string()).optional(),
      secrets_created: z.array(z.string()).optional(),
    })
    .optional(),

  deployment_result: DeploymentResultSchema.optional(),

  verification_result: z
    .object({
      health_checks: z.array(
        z.object({
          name: z.string(),
          endpoint: z.string(),
          status: z.enum(['healthy', 'unhealthy', 'degraded']),
          response_time_ms: z.number(),
        }),
      ),
      readiness_passed: z.boolean(),
      liveness_passed: z.boolean(),
      smoke_tests: z
        .array(
          z.object({
            name: z.string(),
            passed: z.boolean(),
            error: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),

  errors: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),

  registry_url: z.string().optional(),
  registry_config: z
    .object({
      url: z.string(),
      credentials: z.string().optional(),
    })
    .optional(),
});

/**
 * Session schema - main session object
 */
export const SessionSchema = z.object({
  id: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),

  expires_at: z.string().datetime().optional(),
  status: z
    .enum([
      'active',
      'pending',
      'analyzing',
      'building',
      'deploying',
      'completed',
      'failed',
      'expired',
    ])
    .default('active'),

  repo_path: z.string(),

  stage: z.string().optional(),
  labels: z.record(z.string(), z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),

  workflow_state: WorkflowStateSchema.default(() => ({
    completed_steps: [],
    errors: {},
    metadata: {},
  })),

  version: z.number().default(0),

  config: z
    .object({
      auto_push: z.boolean().default(false),
      registry: z.string().optional(),
      namespace: z.string().default('default'),
      skip_scan: z.boolean().default(false),
    })
    .optional(),

  progress: z
    .object({
      current_step: z.number(),
      total_steps: z.number(),
      percentage: z.number().min(0).max(100),
      estimated_completion: z.string().datetime().optional(),
    })
    .optional(),
});

// Export types
export type Session = z.infer<typeof SessionSchema>;
export type WorkflowState = z.infer<typeof WorkflowStateSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type DockerfileResult = z.infer<typeof DockerfileResultSchema>;
export type DockerBuildResult = z.infer<typeof DockerBuildResultSchema>;
export type ScanResult = z.infer<typeof ScanResultSchema>;
export type K8sManifestResult = z.infer<typeof K8sManifestResultSchema>;
export type DeploymentResult = z.infer<typeof DeploymentResultSchema>;

/**
 * Workflow step constants
 */
export const WorkflowStep = {
  ANALYZE: 'analyze_repository',
  GENERATE_DOCKERFILE: 'generate_dockerfile',
  BUILD_IMAGE: 'build_image',
  SCAN_IMAGE: 'scan_image',
  TAG_IMAGE: 'tag_image',
  PUSH_IMAGE: 'push_image',
  GENERATE_K8S: 'generate_k8s_manifests',
  PREPARE_CLUSTER: 'prepare_cluster',
  DEPLOY: 'deploy_application',
  VERIFY: 'verify_deployment',
} as const;

export type WorkflowStepType = (typeof WorkflowStep)[keyof typeof WorkflowStep];

/**
 * Get all workflow steps in order
 */
export function getWorkflowSteps(): WorkflowStepType[] {
  return [
    WorkflowStep.ANALYZE,
    WorkflowStep.GENERATE_DOCKERFILE,
    WorkflowStep.BUILD_IMAGE,
    WorkflowStep.SCAN_IMAGE,
    WorkflowStep.TAG_IMAGE,
    WorkflowStep.PUSH_IMAGE,
    WorkflowStep.GENERATE_K8S,
    WorkflowStep.PREPARE_CLUSTER,
    WorkflowStep.DEPLOY,
    WorkflowStep.VERIFY,
  ];
}

/**
 * Session service interface - simplified for lib layer
 */
export interface SessionManager {
  create(data: Partial<Session>): Promise<Session>;
  get(id: string): Promise<Session | null>;
  update(id: string, data: Partial<Session>): Promise<void>;
  updateAtomic(id: string, updater: (session: Session) => Session): Promise<void>;
  delete(id: string): Promise<void>;
  list(filter?: Partial<Session>): Promise<Session[]>;
  cleanup(): Promise<void>;
}

/**
 * Session filter for querying sessions
 */
export interface SessionFilter {
  status?: Session['status'];
  repo_path?: string;
  labels?: Record<string, string>;
  created_after?: Date;
  created_before?: Date;
}
