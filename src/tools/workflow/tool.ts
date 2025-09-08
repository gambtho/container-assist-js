/**
 * Workflow Tool - Flat Architecture
 *
 * Orchestrates containerization workflows
 * Follows architectural requirement: only imports from src/lib/
 */

import { createSessionManager } from '@lib/session';
import { createTimer, type Logger } from '@lib/logger';
import { Success, Failure, type Result } from '@types';

// Export specific workflow tool configuration
export interface WorkflowToolConfig {
  sessionId?: string;
  repoPath: string;
  workflowType?: 'full' | 'build-only' | 'deploy-only' | 'quick' | 'containerization';
  automated?: boolean;
  options?: {
    skipTests?: boolean;
    skipSecurity?: boolean;
    registryUrl?: string;
    namespace?: string;
    autoRollback?: boolean;
    imageTag?: string;
    deploy?: boolean;
    scan?: boolean;
    parallelSteps?: boolean;
  };
}

// Export specific workflow tool result
export interface WorkflowToolResult {
  ok: boolean;
  sessionId: string;
  workflowId: string;
  status: 'started' | 'completed' | 'failed' | 'already_running';
  message: string;
  workflowName: string;
  estimatedDuration?: number;
  steps: string[];
  completedSteps: string[];
  failedSteps?: string[];
  nextSteps?: string[];
  metadata?: {
    repoPath: string;
    workflowType: string;
    automated: boolean;
    options?: Record<string, unknown>;
    startedAt: string;
    completedAt?: string;
    duration?: number;
  };
}

export interface WorkflowStatusResult {
  status: string;
  workflowId?: string;
  currentStep?: string;
  completedSteps: string[];
  failedSteps: string[];
  progress: number;
}

/**
 * Get workflow steps based on type
 */
function getWorkflowSteps(workflowType: string, options?: WorkflowToolConfig['options']): string[] {
  const baseSteps = {
    full: [
      'analyze-repo',
      'resolve-base-images',
      'generate-dockerfile',
      'build-image',
      'scan-image',
      'tag-image',
      'push-image',
      'generate-k8s-manifests',
      'prepare-cluster',
      'deploy',
      'verify-deployment',
    ],
    'build-only': [
      'analyze-repo',
      'resolve-base-images',
      'generate-dockerfile',
      'build-image',
      'scan-image',
      'tag-image',
    ],
    'deploy-only': ['generate-k8s-manifests', 'prepare-cluster', 'deploy', 'verify-deployment'],
    quick: ['analyze-repo', 'generate-dockerfile', 'build-image'],
    containerization: [
      'analyze-repo',
      'resolve-base-images',
      'generate-dockerfile',
      'build-image',
      'scan-image',
      'tag-image',
      'push-image',
      'generate-k8s-manifests',
      'deploy',
      'verify-deployment',
    ],
  };

  let steps = baseSteps[workflowType as keyof typeof baseSteps] ?? baseSteps.full;

  // Filter steps based on options
  if (options?.skipTests) {
    steps = steps.filter((s) => !s.includes('test'));
  }
  if (options?.skipSecurity) {
    steps = steps.filter((s) => s !== 'scan-image');
  }
  if (!options?.deploy && workflowType === 'full') {
    steps = steps.filter((s) => !['deploy', 'verify-deployment'].includes(s));
  }

  return steps;
}

/**
 * Estimate workflow duration in seconds
 */
function estimateWorkflowDuration(steps: string[]): number {
  const stepDurations: Record<string, number> = {
    'analyze-repo': 5,
    'resolve-base-images': 3,
    'generate-dockerfile': 3,
    'build-image': 30,
    'scan-image': 15,
    'tag-image': 2,
    'push-image': 10,
    'generate-k8s-manifests': 5,
    'prepare-cluster': 10,
    deploy: 20,
    'verify-deployment': 10,
  };

  return steps.reduce((total, step) => total + (stepDurations[step] ?? 5), 0);
}

// Import tool registry at the module level
import { analyzeRepoTool } from '@tools/analyze-repo';
import { generateDockerfileTool } from '@tools/generate-dockerfile';
import { buildImageTool } from '@tools/build-image';
import { scanImageTool } from '@tools/scan';
import { pushImageTool } from '@tools/push-image';
import { tagImageTool } from '@tools/tag-image';
import { fixDockerfileTool } from '@tools/fix-dockerfile';
import { resolveBaseImagesTool } from '@tools/resolve-base-images';
import { prepareClusterTool } from '@tools/prepare-cluster';
import { deployApplicationTool } from '@tools/deploy';
import { generateK8sManifestsTool } from '@tools/generate-k8s-manifests';
import { verifyDeploymentTool } from '@tools/verify-deployment';

// Create tool mapping
const toolMap: Record<string, any> = {
  'analyze-repo': analyzeRepoTool,
  'generate-dockerfile': generateDockerfileTool,
  'build-image': buildImageTool,
  'scan-image': scanImageTool,
  'push-image': pushImageTool,
  'tag-image': tagImageTool,
  'fix-dockerfile': fixDockerfileTool,
  'resolve-base-images': resolveBaseImagesTool,
  'prepare-cluster': prepareClusterTool,
  deploy: deployApplicationTool,
  'generate-k8s-manifests': generateK8sManifestsTool,
  'verify-deployment': verifyDeploymentTool,
};

/**
 * Execute a single workflow step
 */
async function executeStep(
  step: string,
  sessionId: string,
  config: WorkflowToolConfig,
  logger: Logger,
): Promise<{ ok: boolean; error?: string }> {
  const timer = createTimer(logger, `workflow-step-${step}`);

  try {
    logger.info({ step, sessionId }, `Executing workflow step: ${step}`);

    // Get the tool from the map
    const tool = toolMap[step];

    if (!tool) {
      throw new Error(`Tool not found: ${step}`);
    }

    // Prepare tool configuration based on the step
    const toolConfig: any = {
      sessionId,
      repoPath: config.repoPath,
    };

    // Add step-specific configuration
    switch (step) {
      case 'scan-image':
        toolConfig.skipIfNoScanner = config.options?.skipSecurity;
        break;
      case 'push-image':
        if (config.options?.registryUrl) {
          toolConfig.registryUrl = config.options.registryUrl;
        }
        break;
      case 'tag-image':
        if (config.options?.imageTag) {
          toolConfig.tag = config.options.imageTag;
        }
        break;
      case 'deploy':
        if (config.options?.namespace) {
          toolConfig.namespace = config.options.namespace;
        }
        break;
      case 'generate-k8s-manifests':
        if (config.options?.namespace) {
          toolConfig.namespace = config.options.namespace;
        }
        break;
    }

    // Execute the actual tool
    const result = await tool.execute(toolConfig, logger);

    // Handle Result<T> pattern
    if (result && typeof result === 'object' && 'ok' in result) {
      if (result.ok) {
        timer.end({ step, success: true });
        return { ok: true };
      } else {
        timer.end({ step, success: false, error: result.error });
        return { ok: false, error: result.error };
      }
    }

    // Handle direct response (backward compatibility)
    timer.end({ step, success: true });
    return { ok: true };
  } catch (error) {
    timer.error(error);
    logger.error({ step, error }, `Workflow step failed: ${step}`);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Start or manage a workflow
 */
async function workflow(
  config: WorkflowToolConfig,
  logger: Logger,
): Promise<Result<WorkflowToolResult>> {
  const timer = createTimer(logger, 'workflow');
  const startedAt = new Date().toISOString();

  try {
    const { repoPath, workflowType = 'full', automated = false, options = {} } = config;

    // Create or get session
    const sessionManager = createSessionManager(logger);
    let sessionId = config.sessionId;

    if (!sessionId) {
      // Create new session
      sessionId = `session-${Date.now()}`;
      await sessionManager.create(sessionId);
    }

    // Get session to check if workflow is already running
    const session = await sessionManager.get(sessionId);
    if (!session) {
      return Failure('Failed to create or retrieve session');
    }

    // Check if workflow is already running
    const workflowState = (session as any).workflow_state || {};
    if (workflowState?.status === 'running') {
      return Success({
        ok: false,
        sessionId,
        workflowId: workflowState.workflowId ?? `workflow-${sessionId}`,
        status: 'already_running',
        message: 'A workflow is already running for this session',
        workflowName: `${workflowType} workflow`,
        steps: workflowState.steps ?? [],
        completedSteps: workflowState.completedSteps ?? [],
      });
    }

    // Generate workflow ID
    const workflowId = `workflow-${sessionId}-${Date.now()}`;

    // Get workflow steps
    const steps = getWorkflowSteps(workflowType, options);
    const estimatedDuration = estimateWorkflowDuration(steps);

    logger.info(
      {
        sessionId,
        workflowId,
        workflowType,
        stepCount: steps.length,
      },
      'Starting workflow',
    );

    // Update session with workflow start
    await sessionManager.update(sessionId, {
      workflow_state: {
        ...workflowState,
        status: 'running',
        workflowId,
        workflowType,
        steps,
        completedSteps: [],
        currentStep: steps[0],
        startedAt,
      },
    });

    // Execute workflow steps
    const completedSteps: string[] = [];
    const failedSteps: string[] = [];
    let workflowFailed = false;

    for (const step of steps) {
      // Update current step
      await sessionManager.update(sessionId, {
        workflow_state: {
          ...workflowState,
          status: 'running',
          workflowId,
          currentStep: step,
          completedSteps,
          failedSteps,
        },
      });

      // Execute step
      const result = await executeStep(step, sessionId, config, logger);

      if (result.ok) {
        completedSteps.push(step);
      } else {
        failedSteps.push(step);

        // Check if we should continue or abort
        if (!options.autoRollback && !automated) {
          workflowFailed = true;
          logger.error({ step, error: result.error }, 'Workflow aborted due to step failure');
          break;
        }
      }
    }

    const completedAt = new Date().toISOString();
    const duration = Date.now() - new Date(startedAt).getTime();

    // Update session with final workflow state
    const finalStatus = workflowFailed ? 'failed' : 'completed';
    await sessionManager.update(sessionId, {
      workflow_state: {
        ...workflowState,
        status: finalStatus,
        workflowId,
        completedSteps,
        failedSteps,
        currentStep: null,
        completedAt,
        duration,
      },
    });

    timer.end({
      workflowId,
      status: finalStatus,
      completedSteps: completedSteps.length,
      failedSteps: failedSteps.length,
    });

    logger.info(
      {
        workflowId,
        status: finalStatus,
        completedSteps: completedSteps.length,
        failedSteps: failedSteps.length,
        duration,
      },
      'Workflow completed',
    );

    return Success({
      ok: !workflowFailed,
      success: !workflowFailed,
      sessionId,
      workflowId,
      status: workflowFailed ? 'failed' : 'completed',
      message: workflowFailed
        ? `Workflow failed at step: ${failedSteps[0]}`
        : 'Workflow completed successfully',
      workflowName: `${workflowType} workflow`,
      estimatedDuration,
      steps,
      completedSteps,
      ...(failedSteps.length > 0 && { failedSteps }),
      nextSteps: steps.filter((s) => !completedSteps.includes(s)),
      metadata: {
        repoPath,
        workflowType,
        automated,
        options: options as Record<string, unknown>,
        startedAt,
        completedAt,
        duration,
      },
    });
  } catch (error) {
    timer.error(error);
    logger.error({ error }, 'Workflow execution failed');

    return Failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Get workflow status
 */
async function getWorkflowStatus(
  sessionId: string,
  logger: Logger,
): Promise<Result<WorkflowStatusResult>> {
  try {
    const sessionManager = createSessionManager(logger);
    const session = await sessionManager.get(sessionId);

    if (!session) {
      return Failure('Session not found');
    }

    const workflowState = (session as any).workflow_state || {};
    const steps = workflowState.steps ?? [];
    const completedSteps = workflowState.completedSteps ?? [];
    const progress = steps.length > 0 ? (completedSteps.length / steps.length) * 100 : 0;

    return Success({
      status: workflowState.status ?? 'not_started',
      workflowId: workflowState.workflowId,
      currentStep: workflowState.currentStep,
      completedSteps,
      failedSteps: workflowState.failedSteps ?? [],
      progress,
    });
  } catch (error) {
    return Failure(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Workflow tool instance
 */
export const workflowTool = {
  name: 'workflow',
  execute: (config: WorkflowToolConfig, logger: Logger) => workflow(config, logger),
  getStatus: (sessionId: string, logger: Logger) => getWorkflowStatus(sessionId, logger),
};
