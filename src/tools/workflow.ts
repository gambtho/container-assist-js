/**
 * Workflow Tool - Flat Architecture
 *
 * Orchestrates containerization workflows
 * Follows architectural requirement: only imports from src/lib/
 */

import { createSessionManager } from '../lib/session';
import { createTimer, type Logger } from '../lib/logger';
import { Success, Failure, type Result } from '../types/core/index';

export interface WorkflowConfig {
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

export interface WorkflowResult {
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
function getWorkflowSteps(workflowType: string, options?: WorkflowConfig['options']): string[] {
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

/**
 * Execute a single workflow step
 */
async function executeStep(
  step: string,
  sessionId: string,
  config: WorkflowConfig,
  logger: Logger,
): Promise<{ ok: boolean; error?: string }> {
  const timer = createTimer(logger, `workflow-step-${step}`);

  try {
    logger.info({ step, sessionId }, `Executing workflow step: ${step}`);

    // In a real implementation, this would dynamically load and execute the tool
    // For now, we simulate execution
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Simulate occasional failures for testing
    if (Math.random() > 0.95 && !config.automated) {
      throw new Error(`Simulated failure in step ${step}`);
    }

    timer.end({ step });
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
async function workflow(config: WorkflowConfig, logger: Logger): Promise<Result<WorkflowResult>> {
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
    const workflowState = session.workflow_state as any;
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

    const workflowState = session.workflow_state as any;
    const steps = workflowState?.steps ?? [];
    const completedSteps = workflowState?.completedSteps ?? [];
    const progress = steps.length > 0 ? (completedSteps.length / steps.length) * 100 : 0;

    return Success({
      status: workflowState?.status ?? 'not_started',
      workflowId: workflowState?.workflowId,
      currentStep: workflowState?.currentStep,
      completedSteps,
      failedSteps: workflowState?.failedSteps ?? [],
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
  execute: (config: WorkflowConfig, logger: Logger) => workflow(config, logger),
  getStatus: (sessionId: string, logger: Logger) => getWorkflowStatus(sessionId, logger),
};
