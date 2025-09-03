/**
 * Workflow Manager
 * Tracks and manages concurrent workflow executions
 */

import { EventEmitter } from 'events';
import type { Logger } from 'pino';
import { WorkflowExecutionResult } from './orchestrator';

export interface WorkflowExecution {
  sessionId: string;
  workflowId: string;
  promise: Promise<WorkflowExecutionResult>;
  startTime: number;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  result?: WorkflowExecutionResult;
  error?: Error;
  abortController?: AbortController;
}

export interface WorkflowMetrics {
  total: number;
  running: number;
  completed: number;
  failed: number;
  aborted: number;
  averageDuration: number;
  successRate: number;
}

export interface WorkflowManagerEvents {
  'workflow:started': (data: { sessionId: string; workflowId?: string }) => void;
  'workflow:completed': (data: { sessionId: string; result?: WorkflowExecutionResult }) => void;
  'workflow:failed': (data: { sessionId: string; error?: Error }) => void;
  'workflow:aborted': (data: { sessionId: string }) => void;
}

export interface WorkflowSummary {
  sessionId: string;
  workflowId: string;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  duration: number;
  startTime: Date;
  completedSteps?: string[];
  errors?: Array<{ step: string; error?: string }>;
}

export class WorkflowManager extends EventEmitter {
  private workflows = new Map<string, WorkflowExecution>();
  private completedWorkflows: WorkflowExecution[] = [];
  private maxCompletedHistory = 100;
  private cleanupInterval?: NodeJS.Timeout;
  private logger: Logger;

  constructor(logger: Logger) {
    super();
    this.logger = logger.child({ component: 'WorkflowManager' });

    this.startPeriodicCleanup();

    this.logger.info('Workflow manager initialized');
  }

  registerWorkflow(
    sessionId: string,
    workflowId: string,
    promise: Promise<WorkflowExecutionResult>,
    abortController?: AbortController
  ): void {
    const execution: WorkflowExecution = {
      sessionId,
      workflowId,
      promise,
      startTime: Date.now(),
      status: 'running',
      ...(abortController && { abortController })
    };

    this.workflows.set(sessionId, execution);

    this.logger.info(
      {
        sessionId,
        workflowId,
        activeCount: this.workflows.size
      },
      'Workflow registered'
    );

    this.emit('workflow:started', { sessionId, workflowId });

    promise
      .then((result) => {
        execution.status = 'completed';
        execution.result = result;

        this.logger.info(
          {
            sessionId,
            workflowId,
            duration: Date.now() - execution.startTime,
            status: result.status
          },
          'Workflow completed'
        );

        this.emit('workflow:completed', { sessionId, result });
      })
      .catch((error) => {
        execution.status =
          execution.abortController?.signal?.aborted === true ? 'aborted' : 'failed';
        execution.error = error as Error;

        this.logger.error(
          {
            sessionId,
            workflowId,
            error: error instanceof Error ? error.message : String(error),
            duration: Date.now() - execution.startTime
          },
          'Workflow failed'
        );

        if (execution.status === 'aborted') {
          this.emit('workflow:aborted', { sessionId });
        } else {
          this.emit('workflow:failed', { sessionId, error: error as Error });
        }
      })
      .finally(() => {
        // Move to completed history and clean up
        this.archiveWorkflow(sessionId);
      });
  }

  /**
   * Get workflow execution by session ID
   */
  getWorkflow(sessionId: string): WorkflowExecution | undefined {
    return this.workflows.get(sessionId);
  }

  /**
   * Get all active workflows
   */
  getActiveWorkflows(): WorkflowExecution[] {
    return Array.from(this.workflows.values()).filter((w) => w.status === 'running');
  }

  /**
   * Get all workflows (active and completed)
   */
  getAllWorkflows(): { active: WorkflowExecution[]; completed?: WorkflowExecution[] } {
    return {
      active: Array.from(this.workflows.values()),
      completed: [...this.completedWorkflows]
    };
  }

  /**
   * List workflows with optional filter
   */
  listWorkflows(filter?: {
    status?: WorkflowExecution['status'];
    workflowId?: string;
    limit?: number;
    since?: Date;
  }): Array<{
    sessionId: string;
    workflowId: string;
    status: WorkflowExecution['status'];
    duration: number;
    startTime: Date;
    completedSteps?: string[];
    errors?: Array<{ step: string; error?: string }>;
  }> {
    let workflows: WorkflowExecution[] = [
      ...Array.from(this.workflows.values()),
      ...this.completedWorkflows
    ];

    // Apply filters
    if (filter?.status) {
      workflows = workflows.filter((w) => w.status === filter.status);
    }

    if (filter?.workflowId != null && filter.workflowId.trim() !== '') {
      workflows = workflows.filter((w) => w.workflowId === filter.workflowId);
    }

    if (filter?.since) {
      const sinceTime = filter.since.getTime();
      workflows = workflows.filter((w) => w.startTime >= sinceTime);
    }

    // Sort by start time (most recent first)
    workflows.sort((a, b) => b.startTime - a.startTime);

    // Apply limit
    if (filter?.limit != null && filter.limit > 0) {
      workflows = workflows.slice(0, filter.limit);
    }

    // Transform to list format
    return workflows.map((w) => {
      const now =
        w.status === 'running'
          ? Date.now()
          : w.result
            ? w.startTime + (w.result.duration ?? 0)
            : Date.now();

      const workflowSummary: WorkflowSummary = {
        sessionId: w.sessionId,
        workflowId: w.workflowId,
        status: w.status,
        duration: now - w.startTime,
        startTime: new Date(w.startTime),
        ...(w.result?.completedSteps !== undefined && { completedSteps: w.result.completedSteps }),
        ...(w.result?.errors !== undefined && { errors: w.result.errors })
      };

      return workflowSummary;
    });
  }

  /**
   * Abort a running workflow
   */
  abortWorkflow(sessionId: string): boolean {
    const workflow = this.workflows.get(sessionId);

    if (!workflow) {
      this.logger.warn({ sessionId }, 'Workflow not found for abort');
      return false;
    }

    if (workflow.status !== 'running') {
      this.logger.warn({ sessionId, status: workflow.status }, 'Cannot abort workflow with status');
      return false;
    }

    if (workflow.abortController) {
      workflow.abortController.abort();
      workflow.status = 'aborted';

      this.logger.info({ sessionId, workflowId: workflow.workflowId }, 'Workflow aborted');
      return true;
    }

    this.logger.warn({ sessionId }, 'No abort controller for workflow');
    return false;
  }

  /**
   * Get workflow execution metrics
   */
  getMetrics(): WorkflowMetrics {
    const allWorkflows = [...Array.from(this.workflows.values()), ...this.completedWorkflows];

    const total = allWorkflows.length;
    const running = allWorkflows.filter((w) => w.status === 'running').length;
    const completed = allWorkflows.filter((w) => w.status === 'completed').length;
    const failed = allWorkflows.filter((w) => w.status === 'failed').length;
    const aborted = allWorkflows.filter((w) => w.status === 'aborted').length;

    // Calculate average duration (excluding running workflows)
    const finishedWorkflows = allWorkflows.filter((w) => w.status !== 'running' && w.result);
    const totalDuration = finishedWorkflows.reduce((sum, w) => sum + (w.result?.duration ?? 0), 0);
    const averageDuration =
      finishedWorkflows.length > 0 ? Math.round(totalDuration / finishedWorkflows.length) : 0;

    // Calculate success rate
    const finishedCount = completed + failed + aborted;
    const successRate = finishedCount > 0 ? Math.round((completed / finishedCount) * 100) / 100 : 0;

    return {
      total,
      running,
      completed,
      failed,
      aborted,
      averageDuration,
      successRate
    };
  }

  /**
   * Get workflow status summary
   */
  getStatusSummary(): {
    activeWorkflows: number;
    queuedWorkflows: number;
    recentCompletions: number;
    recentFailures: number;
    systemLoad: 'low' | 'medium' | 'high';
  } {
    const active = this.getActiveWorkflows().length;
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    const recentWorkflows = this.completedWorkflows.filter((w) => w.startTime > oneHourAgo);
    const recentCompletions = recentWorkflows.filter((w) => w.status === 'completed').length;
    const recentFailures = recentWorkflows.filter((w) => w.status === 'failed').length;

    // Simple load calculation based on active workflows
    let systemLoad: 'low' | 'medium' | 'high' = 'low';
    if (active > 10) {
      systemLoad = 'high';
    } else if (active > 5) {
      systemLoad = 'medium';
    }

    return {
      activeWorkflows: active,
      queuedWorkflows: 0,
      recentCompletions,
      recentFailures,
      systemLoad
    };
  }

  /**
   * Check if workflow exists and is running
   */
  isWorkflowRunning(sessionId: string): boolean {
    const workflow = this.workflows.get(sessionId);
    return workflow ? workflow.status === 'running' : false;
  }

  /**
   * Get workflow duration (current time - start time for running workflows)
   */
  getWorkflowDuration(sessionId: string): number | null {
    const workflow =
      this.workflows.get(sessionId) ??
      this.completedWorkflows.find((w) => w.sessionId === sessionId);

    if (!workflow) return null;

    if (workflow.status === 'running') {
      return Date.now() - workflow.startTime;
    } else if (workflow.result) {
      return workflow.result.duration;
    }

    return Date.now() - workflow.startTime;
  }

  /**
   * Archive completed workflow to history
   */
  private archiveWorkflow(sessionId: string): void {
    const workflow = this.workflows.get(sessionId);
    if (!workflow) return;

    // Move to completed history
    this.completedWorkflows.push(workflow);

    // Remove from active workflows
    this.workflows.delete(sessionId);

    // Limit history size
    if (this.completedWorkflows.length > this.maxCompletedHistory) {
      this.completedWorkflows.shift();
    }

    this.logger.debug(
      {
        sessionId,
        activeCount: this.workflows.size,
        completedCount: this.completedWorkflows.length
      },
      'Workflow archived'
    );
  }

  /**
   * Start periodic cleanup of old data
   */
  private startPeriodicCleanup(): void {
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupOldWorkflows();
      },
      10 * 60 * 1000
    );

    if (this.cleanupInterval != null && 'unref' in this.cleanupInterval) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Clean up old completed workflows
   */
  private cleanupOldWorkflows(): void {
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const cutoffTime = Date.now() - maxAge;

    const initialCount = this.completedWorkflows.length;

    this.completedWorkflows = this.completedWorkflows.filter((w) => w.startTime > cutoffTime);

    const cleaned = initialCount - this.completedWorkflows.length;

    if (cleaned > 0) {
      this.logger.debug(
        { cleaned, remaining: this.completedWorkflows.length },
        'Old workflows cleaned'
      );
    }
  }

  /**
   * Shutdown the workflow manager
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Abort any running workflows
    const activeWorkflows = this.getActiveWorkflows();
    if (activeWorkflows.length > 0) {
      this.logger.info({ count: activeWorkflows.length }, 'Aborting active workflows on shutdown');

      for (const workflow of activeWorkflows) {
        this.abortWorkflow(workflow.sessionId);
      }
    }

    this.removeAllListeners();

    this.logger.info('Workflow manager shut down');
  }
}
