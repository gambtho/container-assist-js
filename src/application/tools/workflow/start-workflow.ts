/**
 * Start workflow tool handler
 * Provides workflow orchestration with error handling and validation
 */

import { nanoid } from 'nanoid';
import { SessionService } from '../../session/manager.js';
import { WorkflowOrchestrator } from '../../workflow/orchestrator.js';
import { WorkflowManager } from '../../workflow/manager.js';
import { getWorkflowConfig, validateWorkflowConfig } from '../../workflow/configs.js';
import { runContainerizationWorkflow } from '../../workflow/containerization.js';
import type { Logger } from 'pino';
import type { ProgressCallback } from '../../workflow/types.js';
import type { Session } from '../../../domain/types/index.js';

export interface StartWorkflowInput {
  repo_path?: string;
  workflow_type?: 'full' | 'build-only' | 'deploy-only' | 'quick' | 'containerization';
  session_id?: string;
  automated?: boolean;
  options?: {
    skip_tests?: boolean;
    skip_security?: boolean;
    registry_url?: string;
    namespace?: string;
    auto_rollback?: boolean;
    image_tag?: string; // For deploy-only workflows
    deploy?: boolean;
    scan?: boolean;
    parallel_steps?: boolean;
  };
}

export interface StartWorkflowOutput {
  success: boolean;
  session_id: string;
  workflow_id: string;
  status: 'started' | 'failed' | 'already_running';
  message: string;
  workflow_name?: string;
  estimated_duration?: number;
  steps?: string[];
  next_steps?: string[];
  error?: string;
  metadata?: {
    repo_path?: string;
    workflow_type: string;
    automated: boolean;
    options?: Record<string, unknown>;
    started_at: string;
  };
}

export interface StartWorkflowDeps {
  sessionService: SessionService;
  workflowOrchestrator: WorkflowOrchestrator;
  workflowManager: WorkflowManager;
  logger: Logger;
  onProgress?: ProgressCallback;
}

export async function startWorkflowHandler(
  input: StartWorkflowInput,
  deps: StartWorkflowDeps,
): Promise<StartWorkflowOutput> {
  const { sessionService, workflowOrchestrator, workflowManager, logger, onProgress } = deps;

  try {
    const validated = await validateInput(input, logger);

    if (validated.session_id && workflowManager.isWorkflowRunning(validated.session_id)) {
      return {
        success: false,
        session_id: validated.session_id,
        workflow_id: 'unknown',
        status: 'already_running',
        message: `Workflow already running for session ${validated.session_id}`,
        error: 'Workflow already in progress',
      };
    }

    const workflowConfig = getWorkflowConfig(validated.workflow_type);
    if (!workflowConfig) {
      return {
        success: false,
        session_id: validated.session_id ?? 'unknown',
        workflow_id: 'unknown',
        status: 'failed',
        message: `Unknown workflow type: ${validated.workflow_type}`,
        error: `Invalid workflow type: ${validated.workflow_type}`,
      };
    }

    const configValidation = validateWorkflowConfig(workflowConfig);
    if (!configValidation.valid) {
      logger.error(
        {
          workflowId: workflowConfig.id,
          errors: configValidation.errors,
        },
        'Invalid workflow configuration',
      );

      return {
        success: false,
        session_id: validated.session_id ?? 'unknown',
        workflow_id: workflowConfig.id,
        status: 'failed',
        message: 'Invalid workflow configuration',
        error: configValidation.errors.join('; '),
      };
    }

    const sessionId = validated.session_id ?? nanoid();

    if (validated.session_id) {
      try {
        await sessionService.getSession(sessionId);
      } catch (error) {
        await createNewSession(sessionService, sessionId, validated, logger);
      }
    } else {
      await createNewSession(sessionService, sessionId, validated, logger);
    }

    await sessionService.updateSession(sessionId, {
      status: 'active',
      stage: 'workflow_initializing',
      metadata: {
        workflow_type: validated.workflow_type,
        workflow_id: workflowConfig.id,
        workflow_name: workflowConfig.name,
        repo_path: validated.repo_path,
        automated: validated.automated,
        options: validated.options,
        started_at: new Date().toISOString(),
      },
    });

    await sessionService.updateWorkflowState(sessionId, {
      metadata: {
        workflow_type: validated.workflow_type,
        registry_url: validated.options?.registry_url,
        namespace: validated.options?.namespace,
        image_tag: validated.options?.image_tag,
        skip_tests: validated.options?.skip_tests,
        skip_security: validated.options?.skip_security,
        auto_rollback: validated.options?.auto_rollback,
        parallel_steps: validated.options?.parallel_steps,
      },
    });

    // Report initial progress
    if (onProgress && onProgress.length > 0) {
      await onProgress({
        step: 'workflow',
        status: 'starting',
        progress: 0,
        message: `Initializing ${workflowConfig.name}`,
        metadata: {
          sessionId,
          workflow_type: validated.workflow_type,
          workflow_name: workflowConfig.name,
          steps_count: workflowConfig.steps.length,
        },
      });
    }

    logger.info(
      {
        sessionId,
        workflowId: workflowConfig.id,
        workflowType: validated.workflow_type,
        repoPath: validated.repo_path,
        automated: validated.automated,
      },
      'Starting workflow execution',
    );

    // Start workflow execution asynchronously
    const abortController = new AbortController();

    let workflowPromise: Promise<any>;

    // Use specific workflow functions for better type safety and performance
    if (validated.workflow_type === 'containerization' || validated.workflow_type === 'full') {
      const workflowParams: any = {
        repositoryPath: validated.repo_path,
        includeSecurityScan: !validated.options?.skip_security,
      };

      if (validated.options?.image_tag) {
        workflowParams.baseImage = validated.options.image_tag;
      }

      workflowPromise = runContainerizationWorkflow(workflowParams, logger, onProgress);
    } else {
      // Fallback to generic orchestrator for other workflow types
      workflowPromise = workflowOrchestrator.executeWorkflow(
        workflowConfig,
        sessionId,
        {
          repo_path: validated.repo_path,
          ...validated.options,
        },
        { ...(onProgress && { onProgress }), signal: abortController.signal },
      );
    }

    // Register workflow with manager for tracking
    workflowManager.registerWorkflow(
      sessionId,
      workflowConfig.id,
      workflowPromise,
      abortController,
    );

    // Estimate duration based on workflow type and options
    const estimatedDuration = estimateWorkflowDuration(workflowConfig, validated);

    return {
      success: true,
      session_id: sessionId,
      workflow_id: workflowConfig.id,
      status: 'started',
      message: `${workflowConfig.name} started successfully`,
      workflow_name: workflowConfig.name,
      estimated_duration: estimatedDuration,
      steps: workflowConfig.steps.map((s) => s.name),
      next_steps: [
        'Use workflow_status tool to check progress',
        'Monitor progress updates via session events',
        'Use abort_workflow if cancellation is needed',
      ],
      metadata: {
        repo_path: validated.repo_path,
        workflow_type: validated.workflow_type,
        automated: validated.automated,
        options: validated.options,
        started_at: new Date().toISOString(),
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error(
      {
        error: errorMessage,
        input,
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Failed to start workflow',
    );

    // Try to update session with error if we have a session ID
    const sessionId = input.session_id ?? 'unknown';
    if (sessionId !== 'unknown') {
      try {
        await sessionService.updateSession(sessionId, {
          status: 'failed',
          stage: 'workflow_failed',
        });
      } catch (updateError) {
        logger.error({ error: updateError }); // Fixed logger call
      }
    }

    return {
      success: false,
      session_id: sessionId,
      workflow_id: 'unknown',
      status: 'failed',
      message: `Failed to start workflow: ${errorMessage}`,
      error: errorMessage,
    };
  }
}

/**
 * Validate and normalize input parameters
 */
async function validateInput(
  input: StartWorkflowInput,
  logger: Logger,
): Promise<{
  repo_path: string;
  workflow_type: string;
  session_id?: string;
  automated: boolean;
  options: NonNullable<StartWorkflowInput['options']>;
}> {
  // Default values
  const repo_path = input.repo_path ?? process.cwd();
  const workflow_type = input.workflow_type ?? 'full';
  const automated = input.automated ?? true;
  const options = input.options ?? {};

  // Validate repo path exists (basic check)
  const fs = await import('fs/promises');
  try {
    const stat = await fs.stat(repo_path);
    if (!stat.isDirectory()) {
      throw new Error(`Repository path is not a directory: ${repo_path}`);
    }
  } catch (error) {
    throw new Error(
      `Invalid repository path: ${repo_path} - ${error instanceof Error ? error.message : error}`,
    );
  }

  // Validate workflow type
  const validWorkflowTypes = [
    'full',
    'containerization',
    'build-only',
    'build',
    'deploy-only',
    'deploy',
    'quick',
  ];
  if (!validWorkflowTypes.includes(workflow_type)) {
    throw new Error(
      `Invalid workflow type: ${workflow_type}. Valid types: ${validWorkflowTypes.join(', ')}`,
    );
  }

  // Validate session ID format if provided
  if (input.session_id && !/^[a-zA-Z0-9_-]+$/.test(input.session_id)) {
    throw new Error(`Invalid session ID format: ${input.session_id}`);
  }

  // Validate registry URL if provided
  if (options.registry_url != null) {
    try {
      new URL(options.registry_url);
    } catch {
      throw new Error(`Invalid registry URL: ${options.registry_url}`);
    }
  }

  // Validate namespace if provided
  if (options.namespace && !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(options.namespace)) {
    throw new Error(`Invalid Kubernetes namespace: ${options.namespace}`);
  }

  logger.debug(
    {
      repo_path,
      workflow_type,
      automated,
      options,
    },
    'Input validated',
  );

  const validated: any = {
    repo_path,
    workflow_type,
    automated,
    options,
  };

  // Only add session_id if it's defined'
  if (input.session_id !== undefined) {
    validated.session_id = input.session_id;
  }

  return validated;
}

/**
 * Create a new session
 */
async function createNewSession(
  sessionService: SessionService,
  sessionId: string,
  validated: any,
  logger: Logger,
): Promise<Session> {
  try {
    const session = await sessionService.createSession(validated.repo_path, {
      id: sessionId,
      status: 'pending',
      stage: 'initializing',
      metadata: {
        workflow_type: validated.workflow_type,
        repo_path: validated.repo_path,
      },
    });

    logger.info({ sessionId }, 'Session created'); // Fixed logger call
    
    // Transform session to match expected interface
    const transformedSession = {
      ...session,
      repoPath: session.repo_path,
      status: session.status === 'pending' ? 'active' : session.status as 'active' | 'completed' | 'failed' | 'paused',
    };
    
    return transformedSession;
  } catch (error) {
    logger.error({ sessionId, error }); // Fixed logger call
    throw new Error(`Failed to create session: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Estimate workflow duration based on configuration and options
 */
function estimateWorkflowDuration(workflowConfig: any, validated: any): number {
  // Step duration estimates (ms)
  const stepEstimates: Record<string, number> = {
    analyze: 15000, // 15 seconds
    generate_dockerfile: 30000, // 30 seconds
    build_image: 120000, // 2 minutes
    scan_image: 60000, // 1 minute
    tag_image: 5000, // 5 seconds
    push_image: 180000, // 3 minutes
    generate_k8s: 30000, // 30 seconds
    prepare_cluster: 30000, // 30 seconds
    deploy: 60000, // 1 minute
    verify: 120000, // 2 minutes
  };

  let totalEstimate = 0;

  for (const step of workflowConfig.steps) {
    const baseEstimate = stepEstimates[step.name] || 30000; // Default 30s

    // Adjust for retries
    const retryMultiplier = step.retryable ? 1 + step.maxRetries * 0.3 : 1;
    totalEstimate += baseEstimate * retryMultiplier;
  }

  // Adjust for options
  if (validated.options?.skip_tests && validated.options.skip_tests.length > 0) {
    totalEstimate *= 0.8; // 20% faster
  }

  if (validated.options?.skip_security) {
    totalEstimate *= 0.9; // 10% faster
  }

  if (validated.options?.parallel_steps && validated.options.parallel_steps.length > 0) {
    totalEstimate *= 0.7; // 30% faster with parallelism
  }

  return Math.round(totalEstimate);
}

// Export for tool registration
export const startWorkflowEnhancedDescriptor = {
  name: 'start_workflow',
  description: 'Start a containerization workflow with enhanced orchestration',
  category: 'orchestration' as const,
  handler: startWorkflowHandler,
  timeout: 10000, // 10 seconds to start (not execute)
  exported: true, // Must be in package.json exports
};

// Default export for registry
export default startWorkflowHandler;
