/**
 * Workflow configuration definitions
 * Defines the steps and execution flow for different containerization workflows
 */

import type { DockerBuildResult, WorkflowState } from '../../domain/types/index';
import { WorkflowConfig } from './orchestrator';
import { mapWorkflowStateProperties } from './property-mappers';

// Type-safe helper functions for WorkflowState operations
function getImageIdFromBuildResult(buildResult: DockerBuildResult | undefined): string | undefined {
  return buildResult?.imageId;
}

function hasValidImageId(state: WorkflowState): boolean {
  return (
    (state.build_result as DockerBuildResult)?.imageId != null &&
    (state.build_result as DockerBuildResult)?.imageId.trim() !== ''
  );
}

function getDockerfilePath(dockerfileResult: unknown): string {
  return (dockerfileResult as { path?: string })?.path ?? 'Dockerfile';
}

function getK8sManifests(k8sResult: unknown): unknown {
  return (k8sResult as { manifests?: unknown })?.manifests;
}

function hasK8sManifests(k8sResult: unknown): boolean {
  return (k8sResult as { manifests?: unknown })?.manifests != null;
}

export const CONTAINERIZATION_WORKFLOW: WorkflowConfig = {
  id: 'containerization',
  name: 'Full Containerization Workflow',
  description: 'Complete workflow from repository analysis to deployment',
  steps: [
    {
      name: 'analyze',
      tool: 'analyze_repository',
      description: 'Analyze repository structure and dependencies',
      required: true,
      retryable: true,
      maxRetries: 2,
      timeout: 15000,
      onError: 'fail',
      paramMapper: (state, sessionId) => {
        const mapped = mapWorkflowStateProperties(state);
        return {
          session_id: sessionId,
          repo_path: mapped.repoPath ?? process.cwd(),
        };
      },
    },
    {
      name: 'generate_dockerfile',
      tool: 'generate_dockerfile',
      description: 'Generate optimized Dockerfile',
      required: true,
      retryable: true,
      maxRetries: 3,
      timeout: 30000,
      onError: 'fail',
      condition: (state) => state.analysis_result != null,
      paramMapper: (state, sessionId) => ({
        session_id: sessionId,
        analysis_result: state.analysis_result,
      }),
    },
    {
      name: 'build_image',
      tool: 'build_image',
      description: 'Build Docker image',
      required: true,
      retryable: true,
      maxRetries: 2,
      timeout: 120000,
      onError: 'fail',
      condition: (state) => state.dockerfile_result != null,
      paramMapper: (state, sessionId) => ({
        session_id: sessionId,
        dockerfile_path: getDockerfilePath(state.dockerfile_result),
      }),
    },
    {
      name: 'scan_image',
      tool: 'scan_image',
      description: 'Security vulnerability scan',
      required: false,
      retryable: true,
      maxRetries: 2,
      timeout: 60000,
      onError: 'skip',
      condition: (state) => hasValidImageId(state),
      paramMapper: (state, sessionId) => ({
        session_id: sessionId,
        image_id: getImageIdFromBuildResult(state.build_result as DockerBuildResult) ?? '',
      }),
    },
    {
      name: 'tag_image',
      tool: 'tag_image',
      description: 'Tag image with version',
      required: true,
      retryable: false,
      maxRetries: 0,
      timeout: 5000,
      onError: 'fail',
      condition: (state) => hasValidImageId(state),
      paramMapper: (state, sessionId) => {
        const mapped = mapWorkflowStateProperties(state);
        const buildResult =
          (state.build_result as DockerBuildResult) ?? (mapped.buildResult as DockerBuildResult);
        return {
          session_id: sessionId,
          image_id: getImageIdFromBuildResult(buildResult) ?? '',
          tag: `${mapped.projectName ?? 'app'}:latest`,
        };
      },
    },
    {
      name: 'push_image',
      tool: 'push_image',
      description: 'Push image to registry',
      required: false,
      retryable: true,
      maxRetries: 3,
      timeout: 180000,
      onError: 'skip',
      condition: (state) => {
        const mapped = mapWorkflowStateProperties(state);
        return mapped.imageTag != null && state.registry_url != null;
      },
      paramMapper: (state, sessionId) => {
        const mapped = mapWorkflowStateProperties(state);
        return {
          session_id: sessionId,
          image_tag: mapped.imageTag,
          registry_url: state.registry_url,
        };
      },
    },
    {
      name: 'generate_k8s',
      tool: 'generate_k8s_manifests',
      description: 'Generate Kubernetes manifests',
      required: true,
      retryable: true,
      maxRetries: 3,
      timeout: 30000,
      onError: 'fail',
      condition: (state) => hasValidImageId(state),
      paramMapper: (state, sessionId) => {
        const mapped = mapWorkflowStateProperties(state);
        return {
          session_id: sessionId,
          image_tag: mapped.imageTag ?? getImageIdFromBuildResult(mapped.buildResult),
          analysis_result: mapped.analysisResult,
        };
      },
    },
    {
      name: 'prepare_cluster',
      tool: 'prepare_cluster',
      description: 'Prepare Kubernetes cluster',
      required: false, // Optional - cluster may already be ready
      retryable: true,
      maxRetries: 2,
      timeout: 30000,
      onError: 'skip',
      paramMapper: (state, sessionId) => {
        const mapped = mapWorkflowStateProperties(state);
        return {
          session_id: sessionId,
          namespace: mapped.namespace,
        };
      },
    },
    {
      name: 'deploy',
      tool: 'deploy_application',
      description: 'Deploy application to Kubernetes',
      required: true,
      retryable: true,
      maxRetries: 3,
      timeout: 60000,
      onError: 'fail',
      condition: (state) => hasK8sManifests(state.k8s_result),
      paramMapper: (state, sessionId) => {
        const mapped = mapWorkflowStateProperties(state);
        return {
          session_id: sessionId,
          manifests: getK8sManifests(state.k8s_result),
          namespace: mapped.namespace,
        };
      },
    },
    {
      name: 'verify',
      tool: 'verify_deployment',
      description: 'Verify deployment health',
      required: false, // Optional verification
      retryable: true,
      maxRetries: 5, // More retries for verification
      timeout: 120000, // 2 minutes for verification
      onError: 'skip',
      condition: (state) => {
        const mapped = mapWorkflowStateProperties(state);
        return mapped.deploymentName != null;
      },
      paramMapper: (state, sessionId) => {
        const mapped = mapWorkflowStateProperties(state);
        return {
          session_id: sessionId,
          deployment_name: mapped.deploymentName,
          namespace: mapped.deploymentNamespace,
        };
      },
    },
  ],
  // Define rollback steps (executed in reverse order if workflow fails)
  rollbackSteps: [
    {
      name: 'cleanup_deployment',
      tool: 'cleanup_deployment',
      description: 'Clean up failed deployment',
      required: false,
      retryable: false,
      maxRetries: 0,
      timeout: 30000,
      onError: 'continue',
      paramMapper: (state, sessionId) => {
        const mapped = mapWorkflowStateProperties(state);
        return {
          session_id: sessionId,
          deployment_name: mapped.deploymentName,
          namespace: mapped.deploymentNamespace,
        };
      },
    },
  ],
};

/**
 * Build-only workflow - no deployment steps
 */
export const BUILD_ONLY_WORKFLOW: WorkflowConfig = {
  id: 'build-only',
  name: 'Build Only Workflow',
  description: 'Analyze, generate Dockerfile, and build image',
  steps: [
    {
      name: 'analyze',
      tool: 'analyze_repository',
      description: 'Analyze repository structure and dependencies',
      required: true,
      retryable: true,
      maxRetries: 2,
      timeout: 15000,
      onError: 'fail',
      paramMapper: (state, sessionId) => {
        const mapped = mapWorkflowStateProperties(state);
        return {
          session_id: sessionId,
          repo_path: mapped.repoPath ?? process.cwd(),
        };
      },
    },
    {
      name: 'generate_dockerfile',
      tool: 'generate_dockerfile',
      description: 'Generate optimized Dockerfile',
      required: true,
      retryable: true,
      maxRetries: 3,
      timeout: 30000,
      onError: 'fail',
      condition: (state) => state.analysis_result != null,
      paramMapper: (state, sessionId) => ({
        session_id: sessionId,
        analysis_result: state.analysis_result,
      }),
    },
    {
      name: 'build_image',
      tool: 'build_image',
      description: 'Build Docker image',
      required: true,
      retryable: true,
      maxRetries: 2,
      timeout: 120000,
      onError: 'fail',
      condition: (state) => state.dockerfile_result != null,
      paramMapper: (state, sessionId) => ({
        session_id: sessionId,
        dockerfile_path: getDockerfilePath(state.dockerfile_result),
      }),
    },
    {
      name: 'scan_image',
      tool: 'scan_image',
      description: 'Security vulnerability scan',
      required: false,
      retryable: true,
      maxRetries: 2,
      timeout: 60000,
      onError: 'skip',
      condition: (state) => hasValidImageId(state),
      paramMapper: (state, sessionId) => ({
        session_id: sessionId,
        image_id: getImageIdFromBuildResult(state.build_result as DockerBuildResult) ?? '',
      }),
    },
  ],
};

/**
 * Deploy-only workflow - assumes image already exists
 */
export const DEPLOY_ONLY_WORKFLOW: WorkflowConfig = {
  id: 'deploy-only',
  name: 'Deploy Only Workflow',
  description: 'Generate K8s manifests and deploy existing image',
  steps: [
    {
      name: 'generate_k8s',
      tool: 'generate_k8s_manifests',
      description: 'Generate Kubernetes manifests',
      required: true,
      retryable: true,
      maxRetries: 3,
      timeout: 30000,
      onError: 'fail',
      paramMapper: (state, sessionId) => {
        const mapped = mapWorkflowStateProperties(state);
        return {
          session_id: sessionId,
          image_tag: mapped.imageTag,
          analysis_result: mapped.analysisResult ?? {},
        };
      },
    },
    {
      name: 'prepare_cluster',
      tool: 'prepare_cluster',
      description: 'Prepare Kubernetes cluster',
      required: false,
      retryable: true,
      maxRetries: 2,
      timeout: 30000,
      onError: 'skip',
      paramMapper: (state, sessionId) => {
        const mapped = mapWorkflowStateProperties(state);
        return {
          session_id: sessionId,
          namespace: mapped.namespace,
        };
      },
    },
    {
      name: 'deploy',
      tool: 'deploy_application',
      description: 'Deploy application to Kubernetes',
      required: true,
      retryable: true,
      maxRetries: 3,
      timeout: 60000,
      onError: 'fail',
      condition: (state) => hasK8sManifests(state.k8s_result),
      paramMapper: (state, sessionId) => {
        const mapped = mapWorkflowStateProperties(state);
        return {
          session_id: sessionId,
          manifests: getK8sManifests(state.k8s_result),
          namespace: mapped.namespace,
        };
      },
    },
    {
      name: 'verify',
      tool: 'verify_deployment',
      description: 'Verify deployment health',
      required: false,
      retryable: true,
      maxRetries: 5,
      timeout: 120000,
      onError: 'skip',
      condition: (state) => {
        const mapped = mapWorkflowStateProperties(state);
        return mapped.deploymentName != null;
      },
      paramMapper: (state, sessionId) => {
        const mapped = mapWorkflowStateProperties(state);
        return {
          session_id: sessionId,
          deployment_name: mapped.deploymentName,
          namespace: mapped.deploymentNamespace,
        };
      },
    },
  ],
};

/**
 * Quick workflow - minimal steps for development
 */
export const QUICK_WORKFLOW: WorkflowConfig = {
  id: 'quick',
  name: 'Quick Development Workflow',
  description: 'Fast workflow for development - analysis and Dockerfile generation',
  steps: [
    {
      name: 'analyze',
      tool: 'analyze_repository',
      description: 'Quick repository analysis',
      required: true,
      retryable: true,
      maxRetries: 1,
      timeout: 10000,
      onError: 'fail',
      paramMapper: (state, sessionId) => {
        const mapped = mapWorkflowStateProperties(state);
        return {
          session_id: sessionId,
          repo_path: mapped.repoPath ?? process.cwd(),
          quick_mode: true,
        };
      },
    },
    {
      name: 'generate_dockerfile',
      tool: 'generate_dockerfile',
      description: 'Generate Dockerfile',
      required: true,
      retryable: true,
      maxRetries: 2,
      timeout: 20000,
      onError: 'fail',
      condition: (state) => state.analysis_result != null,
      paramMapper: (state, sessionId) => ({
        session_id: sessionId,
        analysis_result: state.analysis_result,
        quick_mode: true,
      }),
    },
  ],
};

/**
 * Get workflow configuration by ID
 */
export function getWorkflowConfig(workflowId: string): WorkflowConfig | null {
  const workflows: Record<string, WorkflowConfig> = {
    containerization: CONTAINERIZATION_WORKFLOW,
    full: CONTAINERIZATION_WORKFLOW, // Alias
    'build-only': BUILD_ONLY_WORKFLOW,
    build: BUILD_ONLY_WORKFLOW, // Alias
    'deploy-only': DEPLOY_ONLY_WORKFLOW,
    deploy: DEPLOY_ONLY_WORKFLOW, // Alias
    quick: QUICK_WORKFLOW,
  };

  return workflows[workflowId] ?? null;
}

/**
 * Get all available workflow configurations
 */
export function getAllWorkflowConfigs(): WorkflowConfig[] {
  return [CONTAINERIZATION_WORKFLOW, BUILD_ONLY_WORKFLOW, DEPLOY_ONLY_WORKFLOW, QUICK_WORKFLOW];
}

/**
 * Get workflow steps as string array (for status tracking)
 */
export function getWorkflowSteps(workflowId: string): string[] {
  const config = getWorkflowConfig(workflowId);
  return config ? config.steps.map((step) => step.name) : [];
}

/**
 * Validate workflow configuration
 */
export function validateWorkflowConfig(config: WorkflowConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Basic validation
  if (!config.id ?? (!config.name || !config.steps?.length)) {
    errors.push('Workflow must have id, name, and at least one step');
  }

  // Step validation
  const stepNames = new Set<string>();
  for (const step of config.steps ?? []) {
    if (!step.name || !step.tool) {
      errors.push('Each step must have a name and tool');
    }

    if (stepNames.has(step.name)) {
      errors.push(`Duplicate step name: ${step.name}`);
    }
    stepNames.add(step.name);

    if (step.timeout <= 0) {
      errors.push(`Invalid timeout for step ${step.name}: ${step.timeout}`);
    }

    if (step.maxRetries < 0) {
      errors.push(`Invalid maxRetries for step ${step.name}: ${step.maxRetries}`);
    }
  }

  // Parallel groups validation
  if (config.parallelGroups != null) {
    const allStepNames = new Set(config.steps.map((s) => s.name));

    for (const group of config.parallelGroups) {
      for (const stepName of group) {
        if (!allStepNames.has(stepName)) {
          errors.push(`Parallel group references unknown step: ${stepName}`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
