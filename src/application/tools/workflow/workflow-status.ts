/**
 * Workflow status tool handler
 * Provides workflow status with progress tracking and metrics
 */

import { z } from 'zod';
import { WorkflowManager } from '../../workflow/manager';
import { Session } from '../../../domain/types/index';
import { getWorkflowSteps } from '../../workflow/configs';
import type { Logger } from 'pino';
import { SessionService } from '../../../services/session';

interface WorkflowError {
  step: string;
  message: string;
  timestamp: string;
  retry_count?: number;
}

export interface WorkflowStatusInput {
  session_id: string;
  include_history?: boolean;
  include_outputs?: boolean;
  include_errors?: boolean;
  step_filter?: string; // Filter to specific step
}

export interface WorkflowStatusOutput {
  success: boolean;
  session_id: string;
  workflow_id?: string;
  workflow_name?: string;
  status: 'active' | 'completed' | 'failed' | 'unknown' | 'aborted';
  stage?: string;

  progress: {
    percentage: number;
    current_step?: string;
    completed_steps: string[];
    failed_steps: string[];
    skipped_steps: string[];
    remaining_steps: string[];
    total_steps: number;
  };

  timing: {
    started_at?: string;
    updated_at?: string;
    completed_at?: string;
    duration: number;
    estimated_remaining?: number;
  };

  errors?: Array<{
    step: string;
    message: string;
    timestamp: string;
    retry_count?: number;
  }>;

  outputs?: Record<string, unknown>;

  history?: Array<{
    step: string;
    status: string;
    progress: number;
    message?: string;
    timestamp: string;
    duration?: number;
  }>;

  metadata?: {
    workflow_type?: string;
    repo_path?: string;
    automated?: boolean;
    options?: Record<string, unknown>;
    next_steps?: string[];
  };

  system?: {
    memory_usage?: number;
    active_workflows?: number;
    system_load?: 'low' | 'medium' | 'high';
  };

  error?: string;
}

interface ProgressEmitterService {
  getCurrentProgress?: (sessionId: string) =>
    | {
        progress?: number;
        currentStep?: string;
        completedSteps?: string[];
        failedSteps?: string[];
      }
    | undefined;
}

export interface WorkflowStatusDeps {
  sessionService: SessionService;
  workflowManager: WorkflowManager;
  progressEmitter: ProgressEmitterService;
  logger: Logger;
}

// Zod schemas for validation
const WorkflowStatusInputSchema = z.object({
  session_id: z.string(),
  include_history: z.boolean().optional(),
  include_outputs: z.boolean().optional(),
  include_errors: z.boolean().optional(),
  step_filter: z.string().optional(),
});

const WorkflowStatusOutputSchema = z.object({
  success: z.boolean(),
  session_id: z.string(),
  workflow_id: z.string().optional(),
  workflow_name: z.string().optional(),
  status: z.enum(['active', 'completed', 'failed', 'unknown', 'aborted']),
  stage: z.string().optional(),
  progress: z.object({
    percentage: z.number(),
    current_step: z.string().optional(),
    total_steps: z.number().optional(),
    completed_steps: z.number().optional(),
    estimated_remaining_minutes: z.number().optional(),
  }),
  timing: z
    .object({
      started_at: z.string().optional(),
      updated_at: z.string(),
      duration_seconds: z.number().optional(),
      estimated_completion: z.string().optional(),
    })
    .optional(),
  workflow: z
    .object({
      type: z.string().optional(),
      steps: z.array(z.string()).optional(),
      current_step_index: z.number().optional(),
      outputs: z.record(z.unknown()).optional(),
      errors: z.array(z.string()).optional(),
      next_steps: z.array(z.string()).optional(),
    })
    .optional(),
  system: z
    .object({
      memory_usage: z.number().optional(),
      active_workflows: z.number().optional(),
      system_load: z.enum(['low', 'medium', 'high']).optional(),
    })
    .optional(),
  error: z.string().optional(),
});

/**
 * Workflow status handler
 */
export async function workflowStatusHandler(
  input: WorkflowStatusInput,
  deps: WorkflowStatusDeps,
): Promise<WorkflowStatusOutput> {
  const { sessionService, workflowManager, progressEmitter, logger } = deps;

  try {
    // Validate input
    if (!input.session_id) {
      return createErrorResponse('unknown', 'session_id is required');
    }

    // Get session
    let session: Session;
    try {
      session = sessionService.getSession(input.session_id);
    } catch (error) {
      logger.warn('Session not found');
      return createErrorResponse(input.session_id, 'Session not found');
    }

    // Get workflow execution info from manager
    const workflowExecution = workflowManager.getWorkflow(input.session_id);

    // Get progress information from progress emitter
    const progressInfo = progressEmitter?.getCurrentProgress?.(input.session_id) ?? {};

    // Extract workflow information from session
    const workflowType = session.metadata?.workflow_type as string;
    const workflowId = session.metadata?.workflow_id as string;
    const workflowName = session.metadata?.workflow_name as string;

    // Determine overall status
    const status = determineWorkflowStatus(session, workflowExecution, progressInfo);

    // Build progress information
    const allSteps = getWorkflowSteps(workflowType) ?? [];
    const completedSteps = progressInfo?.completedSteps ?? [];
    const failedSteps = progressInfo?.failedSteps ?? [];
    const skippedSteps = getSkippedSteps(session, progressInfo);
    const remainingSteps = allSteps.filter(
      (step) =>
        !completedSteps?.includes(step) &&
        !failedSteps?.includes(step) &&
        !skippedSteps.includes(step),
    );

    const progress = {
      percentage: Math.round((progressInfo?.progress ?? 0) * 100),
      ...(progressInfo?.currentStep !== undefined
        ? { current_step: progressInfo.currentStep }
        : {}),
      completed_steps: completedSteps,
      failed_steps: failedSteps,
      skipped_steps: skippedSteps,
      remaining_steps: remainingSteps,
      total_steps: allSteps.length,
    };

    // Build timing information
    const startTime =
      session.metadata?.started_at != null && session.metadata.started_at !== ''
        ? new Date(session.metadata.started_at as string)
        : new Date(session.created_at);
    const currentTime = new Date();
    const duration = currentTime.getTime() - startTime.getTime();

    const timing: WorkflowStatusOutput['timing'] = {
      duration,
    };

    // Only add optional properties if they have defined values
    if (startTime != null) {
      timing.started_at = startTime.toISOString();
    }

    if (session.updated_at !== undefined) {
      timing.updated_at = session.updated_at;
    }

    if ((status === 'completed' || status === 'failed') && session.updated_at !== undefined) {
      timing.completed_at = session.updated_at;
    }

    const estimatedRemaining = calculateEstimatedRemaining(progress, duration, allSteps.length);
    if (estimatedRemaining !== undefined) {
      timing.estimated_remaining = estimatedRemaining;
    }

    // Build response
    const response: WorkflowStatusOutput = {
      success: true,
      session_id: input.session_id,
      workflow_id: workflowId,
      workflow_name: workflowName,
      status,
      progress,
      timing,
    };

    // Only add stage if it's defined'
    if (session.stage !== undefined) {
      response.stage = session.stage;
    }

    // Add optional information based on input flags
    if (input.include_errors === true) {
      response.errors = getWorkflowErrors(
        session,
        progressEmitter,
        input.session_id,
        input.step_filter,
      );
    }

    if (input.include_outputs === true) {
      response.outputs = getWorkflowOutputs(session, input.step_filter);
    }

    if (input.include_history === true) {
      response.history = getProgressHistory(progressEmitter, input.session_id, input.step_filter);
    }

    // Add metadata
    response.metadata = {
      workflow_type: workflowType,
      repo_path: session.metadata?.repo_path as string,
      automated: session.metadata?.automated as boolean,
      options: session.metadata?.options as Record<string, unknown>,
      next_steps: generateNextSteps(status, progress, workflowType),
    };

    // Add system information
    response.system = {
      active_workflows: workflowManager.getActiveWorkflows().length,
      system_load: workflowManager.getStatusSummary().systemLoad,
    };

    logger.debug('Workflow status retrieved');

    return Promise.resolve(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Failed to get workflow status');

    return createErrorResponse(
      input.session_id ?? 'unknown',
      `Failed to get workflow status: ${errorMessage}`,
    );
  }
}

/**
 * Create error response
 */
function createErrorResponse(sessionId: string, error: string): WorkflowStatusOutput {
  return {
    success: false,
    session_id: sessionId,
    status: 'unknown',
    progress: {
      percentage: 0,
      completed_steps: [],
      failed_steps: [],
      skipped_steps: [],
      remaining_steps: [],
      total_steps: 0,
    },
    timing: {
      duration: 0,
    },
    error,
  };
}

/**
 * Determine overall workflow status
 */
function determineWorkflowStatus(
  session: Session,
  workflowExecution: unknown,
  _progressInfo: unknown,
): WorkflowStatusOutput['status'] {
  // Check workflow execution status first
  if (
    workflowExecution != null &&
    typeof workflowExecution === 'object' &&
    'status' in workflowExecution
  ) {
    const execWithStatus = workflowExecution as { status?: string };
    const status = execWithStatus.status;
    if (status === 'aborted') return 'aborted';
    if (status === 'failed') return 'failed';
    if (status === 'completed') return 'completed';
    if (status === 'running') return 'active';
  }

  // Fallback to session status
  switch (session.status) {
    case 'active':
      return 'active';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'expired':
      return 'failed';
    default:
      return 'unknown';
  }
}

/**
 * Get skipped steps from session
 */
function getSkippedSteps(session: Session, _progressInfo: unknown): string[] {
  const skippedSteps: string[] = [];

  // Extract from workflow state if available
  if (session.workflow_state && typeof session.workflow_state === 'object') {
    const state = session.workflow_state as { skipped_steps?: unknown };
    if (Array.isArray(state.skipped_steps)) {
      skippedSteps.push(...(state.skipped_steps as string[]));
    }
  }

  return skippedSteps;
}

/**
 * Calculate estimated remaining time
 */
function calculateEstimatedRemaining(
  progress: { percentage: number },
  duration: number,
  _totalSteps: number,
): number | undefined {
  if (progress.percentage === 0 || progress.percentage >= 100) {
    return undefined;
  }

  // Simple estimation based on current progress rate
  const remainingPercentage = (100 - progress.percentage) / 100;
  const avgTimePerPercent = duration / progress.percentage;

  return Math.round(remainingPercentage * avgTimePerPercent * 100);
}

/**
 * Get workflow errors with details
 */
function getWorkflowErrors(
  session: Session,
  progressEmitter: ProgressEmitterService & {
    getHistory?: (
      sessionId: string,
      filter: { status: string },
    ) => Array<{
      step?: string;
      message?: string;
      timestamp?: string;
      metadata?: { retry?: unknown };
    }>;
  },
  sessionId: string,
  stepFilter?: string,
): Array<{
  step: string;
  message: string;
  timestamp: string;
  retry_count?: number;
}> {
  const errors: Array<{
    step: string;
    message: string;
    timestamp: string;
    retry_count?: number;
  }> = [];

  // Get errors from progress history
  const progressHistory =
    progressEmitter.getHistory?.(sessionId, {
      status: 'failed',
    }) ?? [];

  for (const update of progressHistory) {
    if (stepFilter && update.step !== stepFilter) continue;

    // Only add if we have required fields
    if (update.step && update.timestamp) {
      const errorEntry: WorkflowError = {
        step: update.step,
        message: update.message ?? 'Step failed',
        timestamp: update.timestamp,
      };
      if (typeof update.metadata?.retry === 'number') {
        errorEntry.retry_count = update.metadata.retry;
      }
      errors.push(errorEntry);
    }
  }

  // Get errors from session workflow state
  if (session.workflow_state && typeof session.workflow_state === 'object') {
    const state = session.workflow_state as unknown as {
      errors?: Array<{
        step?: string;
        message?: string;
        error?: string;
        timestamp?: string;
        retry_count?: number;
      }>;
    };
    if (Array.isArray(state.errors)) {
      for (const error of state.errors) {
        if (stepFilter && error.step !== stepFilter) continue;

        // Only add if we have required fields
        if (error.step) {
          const errorEntry: WorkflowError = {
            step: error.step,
            message: error.message ?? error.error ?? 'Unknown error',
            timestamp: error.timestamp ?? session.updated_at,
          };
          if (error.retry_count !== undefined) {
            errorEntry.retry_count = error.retry_count;
          }
          errors.push(errorEntry);
        }
      }
    }
  }

  return errors;
}

/**
 * Get workflow outputs
 */
function getWorkflowOutputs(session: Session, stepFilter?: string): Record<string, unknown> {
  const outputs: Record<string, unknown> = {};

  if (session.workflow_state && typeof session.workflow_state === 'object') {
    const state = session.workflow_state as Record<string, unknown>;

    // Extract all step results
    for (const [key, value] of Object.entries(state)) {
      if (key.endsWith('_result') && value) {
        const stepName = key.replace('_result', '');

        if (stepFilter && stepName !== stepFilter) continue;

        outputs[stepName] = value;
      }
    }
  }

  return outputs;
}

/**
 * Get progress history
 */
function getProgressHistory(
  progressEmitter: ProgressEmitterService & {
    getHistory?: (
      sessionId: string,
      filter: { step?: string },
    ) => Array<{
      step?: string;
      status?: string;
      progress?: number;
      message?: string;
      timestamp?: string;
      duration?: number;
    }>;
  },
  sessionId: string,
  stepFilter?: string,
): Array<{
  step: string;
  status: string;
  progress: number;
  message?: string;
  timestamp: string;
  duration?: number;
}> {
  const history =
    progressEmitter.getHistory?.(sessionId, stepFilter !== undefined ? { step: stepFilter } : {}) ??
    [];

  return history
    .filter((update) => update.step && update.status && update.timestamp)
    .map((update) => {
      const entry: {
        step: string;
        status: string;
        progress: number;
        message?: string;
        timestamp: string;
        duration?: number;
      } = {
        step: update.step!,
        status: update.status!,
        progress: Math.round((update.progress ?? 0) * 100),
        timestamp: update.timestamp!,
      };
      if (update.message !== undefined) {
        entry.message = update.message;
      }
      if (typeof update.duration === 'number') {
        entry.duration = update.duration;
      }
      return entry;
    });
}

/**
 * Generate next steps suggestions
 */
function generateNextSteps(
  status: WorkflowStatusOutput['status'],
  progress: { current_step?: string },
  workflowType?: string,
): string[] {
  const nextSteps: string[] = [];

  switch (status) {
    case 'active':
      nextSteps.push('Monitor progress with workflow_status');
      if (progress.current_step) {
        nextSteps.push(`Current step: ${progress.current_step}`);
      }
      nextSteps.push('Use abort_workflow if cancellation is needed');
      break;

    case 'completed':
      nextSteps.push('Workflow completed successfully');
      if (workflowType === 'build-only') {
        nextSteps.push('Consider running deploy-only workflow to deploy the image');
      }
      nextSteps.push('Check outputs for deployment URLs or image IDs');
      break;

    case 'failed':
      nextSteps.push('Review errors to understand failure cause');
      nextSteps.push('Fix issues and retry workflow');
      nextSteps.push('Consider using quick workflow for faster iteration');
      break;

    case 'aborted':
      nextSteps.push('Workflow was aborted');
      nextSteps.push('Start new workflow when ready');
      break;

    default:
      nextSteps.push('Check session status');
      break;
  }

  return nextSteps;
}

// Export for tool registration
export const workflowStatusEnhancedDescriptor = {
  name: 'workflow_status',
  description: 'Get comprehensive workflow status with progress tracking and detailed metrics',
  category: 'orchestration' as const,
  inputSchema: WorkflowStatusInputSchema,
  outputSchema: WorkflowStatusOutputSchema,
  handler: workflowStatusHandler,
  timeout: 5000,
  exported: true,
};

// Default export for registry - export the descriptor, not just the handler
export default workflowStatusEnhancedDescriptor;
