/**
 * Session Types
 * Domain types for workflow sessions and state management
 */

import { z } from 'zod';

/**
 * Base session schema
 */
export const SessionSchema = z.object({
  id: z.string(),
  status: z.enum(['active', 'completed', 'failed', 'paused']),
  repoPath: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  expires_at: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Workflow state schema
 */
export const WorkflowStateSchema = z.object({
  currentStep: z.string(),
  steps: z.array(z.string()),
  stepResults: z.record(z.unknown()).optional(),
  progress: z.number().min(0).max(1),
  error: z.string().optional(),
});

/**
 * Analysis result schema
 */
export const AnalysisResultSchema = z.object({
  language: z.string(),
  framework: z.string().optional(),
  buildTool: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  hasDockerfile: z.boolean(),
  recommendations: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

/**
 * Docker build result schema
 */
export const DockerBuildResultSchema = z.object({
  imageId: z.string(),
  imageTag: z.string(),
  success: z.boolean(),
  buildTime: z.number(),
  buildLogs: z.string().optional(),
  warnings: z.array(z.string()).optional(),
});

/**
 * Dockerfile result schema
 */
export const DockerfileResultSchema = z.object({
  content: z.string(),
  baseImage: z.string(),
  instructions: z.array(z.string()),
  optimizations: z.array(z.string()).optional(),
  securityIssues: z.array(z.string()).optional(),
});

/**
 * Scan result schema
 */
export const ScanResultSchema = z.object({
  vulnerabilities: z.array(
    z.object({
      id: z.string(),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      description: z.string(),
      fix: z.string().optional(),
    }),
  ),
  totalCount: z.number(),
  criticalCount: z.number(),
  success: z.boolean(),
});

/**
 * Kubernetes manifest result schema
 */
export const K8sManifestResultSchema = z.object({
  manifests: z.array(
    z.object({
      apiVersion: z.string(),
      kind: z.string(),
      metadata: z.object({
        name: z.string(),
        namespace: z.string().optional(),
      }),
      spec: z.unknown(),
    }),
  ),
  success: z.boolean(),
});

/**
 * Deployment result schema
 */
export const DeploymentResultSchema = z.object({
  deploymentId: z.string(),
  namespace: z.string(),
  status: z.enum(['pending', 'running', 'succeeded', 'failed']),
  podCount: z.number(),
  success: z.boolean(),
});

/**
 * Workflow steps enum
 */
export enum WorkflowStep {
  ANALYSIS = 'analysis',
  DOCKERFILE = 'dockerfile',
  BUILD = 'build',
  SCAN = 'scan',
  KUBERNETES = 'kubernetes',
  DEPLOY = 'deploy',
}

/**
 * Get workflow steps in order
 */
export function getWorkflowSteps(): WorkflowStep[] {
  return [
    WorkflowStep.ANALYSIS,
    WorkflowStep.DOCKERFILE,
    WorkflowStep.BUILD,
    WorkflowStep.SCAN,
    WorkflowStep.KUBERNETES,
    WorkflowStep.DEPLOY,
  ];
}

/**
 * Type exports
 */
export type Session = z.infer<typeof SessionSchema>;
export type WorkflowState = z.infer<typeof WorkflowStateSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type DockerBuildResult = z.infer<typeof DockerBuildResultSchema>;
export type DockerfileResult = z.infer<typeof DockerfileResultSchema>;
export type ScanResult = z.infer<typeof ScanResultSchema>;
export type K8sManifestResult = z.infer<typeof K8sManifestResultSchema>;
export type DeploymentResult = z.infer<typeof DeploymentResultSchema>;

/**
 * Helper functions for creating mock data
 */
export function createMockSession(overrides?: Partial<Session>): Session {
  return {
    id: `session-${Date.now()}`,
    status: 'active',
    repoPath: '/tmp/test-repo',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    ...overrides,
  };
}

export function createMockWorkflowState(overrides?: Partial<WorkflowState>): WorkflowState {
  return {
    currentStep: WorkflowStep.ANALYSIS,
    steps: getWorkflowSteps(),
    progress: 0,
    ...overrides,
  };
}

export function createMockAnalysisResult(overrides?: Partial<AnalysisResult>): AnalysisResult {
  return {
    language: 'typescript',
    framework: 'node',
    buildTool: 'npm',
    dependencies: ['express', 'typescript'],
    hasDockerfile: false,
    recommendations: ['Add Dockerfile', 'Add .dockerignore'],
    confidence: 0.95,
    ...overrides,
  };
}
