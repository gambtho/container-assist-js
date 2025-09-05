/**
 * Workflow Orchestrator
 * Provides step-by-step execution, progress tracking, and error recovery
 * Modernized to use callback-based progress reporting instead of EventEmitter
 */

import { WorkflowState } from '../../domain/types/index';
import type { Logger } from 'pino';
import { SessionService } from '../../services/session';
import { WorkflowManager } from './manager';
import { normalizeWorkflowStateUpdate } from './property-mappers';
import { SimpleProgressTracker } from './progress';
import type { ProgressCallback, WorkflowOptions } from './types';

export interface WorkflowStep {
  name: string;
  tool: string;
  description: string;
  required: boolean;
  condition?: (state: WorkflowState) => boolean;
  retryable: boolean;
  maxRetries: number;
  timeout: number;
  onError: 'fail' | 'skip' | 'continue';
  paramMapper?: (state: WorkflowState, sessionId: string) => Record<string, unknown>;
}

export interface WorkflowConfig {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  parallelGroups?: string[][];
  rollbackSteps?: WorkflowStep[];
  metadata?: Record<string, unknown>;
}

export interface WorkflowExecutionResult {
  workflowId: string;
  sessionId: string;
  status: 'completed' | 'failed' | 'partial';
  completedSteps: string[];
  failedSteps: string[];
  skippedSteps: string[];
  duration: number;
  errors: Array<{ step: string; error?: string }>;
  outputs: Record<string, unknown>;
}

export interface ToolDependencies {
  sessionService: SessionService;
  workflowManager: WorkflowManager;
  logger: Logger;
  signal?: AbortSignal;
  onProgress?: ProgressCallback;
}

export class WorkflowOrchestrator {
  private logger: Logger;
  private progressTracker: SimpleProgressTracker;
  private currentExecution?:
    | {
        workflowId: string;
        sessionId: string;
        startTime: number;
        abortController: AbortController;
        onProgress?: ProgressCallback;
      }
    | undefined;

  constructor(
    private sessionService: SessionService,
    logger: Logger,
  ) {
    this.logger = logger.child({ component: 'WorkflowOrchestrator' });
    this.progressTracker = new SimpleProgressTracker(this.logger);
  }

  async executeWorkflow(
    config: WorkflowConfig,
    sessionId: string,
    params: Record<string, unknown> = {},
    options: WorkflowOptions = {},
  ): Promise<WorkflowExecutionResult> {
    const executionId = `${config.id}-${Date.now()}`;
    const startTime = Date.now();

    this.logger.info(
      {
        workflowId: config.id,
        sessionId,
        stepCount: config.steps.length,
      },
      'Starting workflow execution',
    );

    this.currentExecution = {
      workflowId: executionId,
      sessionId,
      startTime,
      abortController: new AbortController(),
      ...(options.onProgress && { onProgress: options.onProgress }),
    };

    const result: WorkflowExecutionResult = {
      workflowId: executionId,
      sessionId,
      status: 'completed',
      completedSteps: [],
      failedSteps: [],
      skippedSteps: [],
      duration: 0,
      errors: [],
      outputs: {},
    };

    try {
      // Update session with workflow start
      this.sessionService.updateSession(sessionId, {
        status: 'active',
        stage: 'workflow_started',
        metadata: {
          workflowId: executionId,
          workflowName: config.name,
          startedAt: new Date().toISOString(),
        },
      });

      await this.executeSteps(config, sessionId, params, result);

      // Update final status
      result.status = this.determineWorkflowStatus(result);
      result.duration = Date.now() - startTime;

      // Update session with workflow completion
      this.sessionService.updateSession(sessionId, {
        status: result.status === 'completed' ? 'completed' : 'failed',
        stage: 'workflow_completed',
        metadata: {
          completedAt: new Date().toISOString(),
          workflowResult: result,
        },
      });

      // Report final progress
      await this.progressTracker.reportProgress(this.currentExecution?.onProgress, {
        step: 'workflow',
        status: result.status === 'completed' ? 'completed' : 'failed',
        progress: 1.0,
        message: `Workflow ${result.status}`,
        metadata: { sessionId, status: result.status, result },
      });

      this.logger.info(
        {
          workflowId: executionId,
          status: result.status,
          duration: result.duration,
        },
        'Workflow execution completed',
      );

      return result;
    } catch (error) {
      this.logger.error({ error, workflowId: executionId }); // Fixed logger call

      result.status = 'failed';
      result.duration = Date.now() - startTime;
      result.errors.push({
        step: 'workflow',
        error: error instanceof Error ? error.message : String(error),
      });

      // Execute rollback if configured
      if (config.rollbackSteps != null && config.rollbackSteps.length > 0) {
        await this.executeRollback(config, sessionId, result);
      }

      throw error;
    } finally {
      this.currentExecution = undefined;
    }
  }

  /**
   * Execute workflow steps sequentially or in parallel groups
   */
  private async executeSteps(
    config: WorkflowConfig,
    sessionId: string,
    params: Record<string, unknown>,
    result: WorkflowExecutionResult,
  ): Promise<void> {
    const session = this.sessionService.getSession(sessionId);
    const state = session.workflow_state ?? {};

    const stepGroups = this.groupStepsForExecution(config);

    for (const group of stepGroups) {
      if (group.length === 1) {
        // Sequential execution
        const step = config.steps.find((s) => s.name === group[0]);
        if (step) {
          await this.executeSingleStep(step, sessionId, state, params, result);
        }
      } else {
        // Parallel execution
        const steps = group
          .map((name) => config.steps.find((s) => s.name === name))
          .filter((step): step is WorkflowStep => step != null);
        await this.executeParallelSteps(steps, sessionId, state, params, result);
      }

      // Check if workflow should continue after each group
      if (result.failedSteps.length > 0 && !this.shouldContinueOnError()) {
        break;
      }
    }
  }

  /**
   * Execute a single workflow step with retries and error handling
   */
  private async executeSingleStep(
    step: WorkflowStep,
    sessionId: string,
    state: WorkflowState,
    params: Record<string, unknown>,
    result: WorkflowExecutionResult,
  ): Promise<void> {
    // Check if step should be executed
    if (step.condition != null && !step.condition(state)) {
      this.logger.info({ step: step.name }); // Fixed logger call
      result.skippedSteps.push(step.name);
      return;
    }

    this.logger.info(
      {
        step: step.name,
        tool: step.tool,
        description: step.description,
      },
      'Executing workflow step',
    );

    // Update session with current step
    this.sessionService.setCurrentStep(sessionId, step.name);

    // Report progress for step start
    await this.progressTracker.reportProgress(this.currentExecution?.onProgress, {
      step: step.name,
      status: 'starting',
      progress: this.calculateProgress(result),
      message: `Starting ${step.description}`,
      metadata: { sessionId, tool: step.tool },
    });

    let retries = 0;
    let lastError: Error | undefined;

    while (retries <= (step.retryable ? step.maxRetries : 0)) {
      try {
        // Prepare tool parameters
        const toolParams = step.paramMapper
          ? step.paramMapper(state, sessionId)
          : { ...params, session_id: sessionId };

        // Execute tool with timeout
        const toolResult = await this.executeToolWithTimeout(step.tool, toolParams, step.timeout);

        // Update workflow state with tool output
        this.updateWorkflowState(sessionId, step.name, toolResult);

        // Store output and mark as completed
        result.outputs[step.name] = toolResult;
        result.completedSteps.push(step.name);

        // Mark step as completed in session
        this.sessionService.markStepCompleted(sessionId, step.name);

        // Report progress for step completion
        await this.progressTracker.reportProgress(this.currentExecution?.onProgress, {
          step: step.name,
          status: 'completed',
          progress: this.calculateProgress(result),
          message: `Completed ${step.description}`,
          metadata: {
            sessionId,
            output: this.sanitizeOutput(toolResult),
            duration: Date.now() - (this.currentExecution?.startTime ?? Date.now()),
          },
        });

        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retries++;

        this.logger.warn(
          {
            step: step.name,
            error: lastError.message,
            retry: retries,
            maxRetries: step.maxRetries,
          },
          'Step execution failed',
        );

        // Add error to session
        this.sessionService.addStepError(sessionId, step.name, lastError);

        if (retries <= step.maxRetries && step.retryable) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, retries - 1), 10000);
          await this.delay(delay);

          // Report retry progress
          await this.progressTracker.reportProgress(this.currentExecution?.onProgress, {
            step: step.name,
            status: 'in_progress',
            progress: this.calculateProgress(result),
            message: `Retrying ${step.description} (attempt ${retries + 1})`,
            metadata: { sessionId, error: lastError.message, retry: retries },
          });
        }
      }
    }

    // Step failed after all retries
    result.failedSteps.push(step.name);
    result.errors.push({
      step: step.name,
      error: lastError?.message ?? 'Unknown error',
    });

    // Report step failure
    await this.progressTracker.reportProgress(this.currentExecution?.onProgress, {
      step: step.name,
      status: 'failed',
      progress: this.calculateProgress(result),
      message: `Failed ${step.description}`,
      metadata: { sessionId, error: lastError?.message },
    });

    // Handle error based on configuration
    if (step.onError === 'fail') {
      throw lastError;
    } else if (step.onError === 'skip') {
      result.skippedSteps.push(step.name);
      this.logger.info({ step: step.name }); // Fixed logger call
    }
    // 'continue' - log and proceed
  }

  /**
   * Execute multiple steps in parallel
   */
  private async executeParallelSteps(
    steps: WorkflowStep[],
    sessionId: string,
    state: WorkflowState,
    params: Record<string, unknown>,
    result: WorkflowExecutionResult,
  ): Promise<void> {
    this.logger.info(
      {
        steps: steps.map((s) => s.name),
      },
      'Executing parallel step group',
    );

    const promises = steps.map((step) =>
      this.executeSingleStep(step, sessionId, state, params, result).catch((error) => {
        this.logger.error({ step: step.name, error: error as Error }); // Fixed logger call
        // Errors are already recorded in result, don't throw
      }),
    );

    await Promise.all(promises);
  }

  /**
   * Execute a tool with timeout protection
   */
  private async executeToolWithTimeout(
    toolName: string,
    params: Record<string, unknown>,
    timeout: number,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Tool execution timeout: ${toolName}`));
      }, timeout);

      // Simulate successful execution
      setTimeout(() => {
        clearTimeout(timer);
        resolve({
          success: true,
          tool: toolName,
          params,
          timestamp: new Date().toISOString(),
        });
      }, 100); // Quick simulation for testing
    });
  }

  /**
   * Update workflow state in session
   */
  private updateWorkflowState(sessionId: string, stepName: string, output: unknown): void {
    const update = {
      [`${stepName}_result`]: output,
      last_completed_step: stepName,
      last_updated: new Date().toISOString(),
    };
    const normalizedUpdate = normalizeWorkflowStateUpdate(update);
    this.sessionService.updateWorkflowState(sessionId, normalizedUpdate);
  }

  /**
   * Group steps for execution (sequential by default)
   */
  private groupStepsForExecution(config: WorkflowConfig): string[][] {
    if (config.parallelGroups != null && config.parallelGroups.length > 0) {
      return config.parallelGroups;
    }
    // Default: all steps sequential
    return config.steps.map((s) => [s.name]);
  }

  /**
   * Calculate progress based on completed steps
   */
  private calculateProgress(result: WorkflowExecutionResult): number {
    const totalSteps =
      result.completedSteps.length + result.failedSteps.length + result.skippedSteps.length + 1; // +1 for current
    return Math.min(result.completedSteps.length / Math.max(totalSteps, 1), 1.0);
  }

  /**
   * Determine final workflow status
   */
  private determineWorkflowStatus(
    result: WorkflowExecutionResult,
  ): 'completed' | 'failed' | 'partial' {
    if (result.failedSteps.length === 0) {
      return 'completed';
    }
    if (result.completedSteps.length === 0) {
      return 'failed';
    }
    return 'partial';
  }

  /**
   * Should workflow continue after error
   */
  private shouldContinueOnError(): boolean {
    return false;
  }

  /**
   * Execute rollback steps
   */
  private async executeRollback(
    config: WorkflowConfig,
    sessionId: string,
    result: WorkflowExecutionResult,
  ): Promise<void> {
    if (config.rollbackSteps == null || config.rollbackSteps.length === 0) return;

    this.logger.info(
      {
        stepCount: config.rollbackSteps.length,
      },
      'Executing rollback steps',
    );

    const session = this.sessionService.getSession(sessionId);
    const state = session.workflow_state ?? {
      completed_steps: [],
      errors: {},
      metadata: {},
    };

    for (const step of config.rollbackSteps) {
      try {
        await this.executeSingleStep(step, sessionId, state, {}, result);
      } catch (error) {
        this.logger.error({ step: step.name, error }); // Fixed logger call
      }
    }
  }

  /**
   * Sanitize output for progress events (remove sensitive data)
   */
  private sanitizeOutput(output: unknown): unknown {
    if (typeof output === 'object' && output !== null) {
      const sanitized = { ...(output as Record<string, unknown>) };

      // Remove potentially sensitive fields
      const sensitiveFields = ['password', 'token', 'key', 'secret', 'auth'];
      for (const field of sensitiveFields) {
        if (field in sanitized) {
          sanitized[field] = '[REDACTED]';
        }
      }

      return sanitized;
    }
    return output;
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Abort current workflow execution
   */
  abort(): void {
    if (this.currentExecution) {
      this.logger.info(
        {
          workflowId: this.currentExecution.workflowId,
        },
        'Aborting workflow execution',
      );

      this.currentExecution.abortController.abort();
    }
  }

  /**
   * Get current execution status
   */
  getCurrentExecution(): { workflowId: string; sessionId?: string; duration?: number } | null {
    if (!this.currentExecution) return null;

    return {
      workflowId: this.currentExecution.workflowId,
      sessionId: this.currentExecution.sessionId,
      duration: Date.now() - this.currentExecution.startTime,
    };
  }
}
