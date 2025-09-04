/**
 * Progress reporting utilities using MCP SDK's native progress system
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Logger } from 'pino';

export interface ProgressUpdate {
  current: number;
  total: number;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface ProgressStep {
  name: string;
  weight?: number; // For weighted progress calculation
}

/**
 * Progress reporter using MCP SDK notifications
 */
export class ProgressReporter {
  private logger: Logger;

  constructor(
    _server: Server, // Intentionally unused parameter
    logger: Logger
  ) {
    this.logger = logger.child({ component: 'ProgressReporter' });
  }

  /**
   * Report progress using MCP SDK when progressToken is provided
   */
  reportProgress(progressToken: string | undefined, update: ProgressUpdate): void {
    if (!progressToken) {
      this.logger.debug(
        {
          current: update.current,
          total: update.total,
          percentage: Math.round((update.current / update.total) * 100),
          message: update.message
        },
        'Progress update (no token)'
      );
      return;
    }

    try {
      this.logger.debug(
        {
          progressToken,
          current: update.current,
          total: update.total,
          percentage: Math.round((update.current / update.total) * 100),
          message: update.message
        },
        'Progress update (MCP notifications not yet implemented)'
      );
    } catch (error) {
      this.logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          progressToken,
          update
        },
        'Failed to send progress notification'
      );
    }
  }

  /**
   * Create step-based progress tracker for multi-phase operations
   */
  createStepTracker(progressToken: string | undefined, steps: ProgressStep[]): StepProgressTracker {
    return new StepProgressTracker(this, progressToken, steps);
  }

  /**
   * Report progress as percentage (0-100)
   */
  reportPercentage(progressToken: string | undefined, percentage: number, message?: string): void {
    const clampedPercentage = Math.max(0, Math.min(100, percentage));

    const update: ProgressUpdate = {
      current: clampedPercentage,
      total: 100
    };

    if (message !== undefined) {
      update.message = message;
    }

    this.reportProgress(progressToken, update);
  }

  /**
   * Report operation completion
   */
  reportComplete(progressToken: string | undefined, message?: string): void {
    this.reportProgress(progressToken, {
      current: 100,
      total: 100,
      message: message ?? 'Operation completed'
    });
  }
}

/**
 * Step-based progress tracker for multi-phase workflows
 */
export class StepProgressTracker {
  private currentStep = 0;
  private totalWeight: number;
  private completedWeight = 0;

  constructor(
    private reporter: ProgressReporter,
    private progressToken: string | undefined,
    private steps: ProgressStep[]
  ) {
    this.totalWeight = steps.reduce((sum, step) => sum + (step.weight ?? 1), 0);
  }

  /**
   * Start next step
   */
  nextStep(message?: string): void {
    if (this.currentStep >= this.steps.length) {
      return;
    }

    const step = this.steps[this.currentStep];
    if (!step) {
      return; // Safety check
    }

    const stepMessage = message ?? `Starting ${step.name}`;

    this.reporter.reportProgress(this.progressToken, {
      current: this.completedWeight,
      total: this.totalWeight,
      message: stepMessage,
      metadata: {
        step: step.name,
        stepNumber: this.currentStep + 1,
        totalSteps: this.steps.length
      }
    });
  }

  /**
   * Complete current step
   */
  completeStep(message?: string): void {
    if (this.currentStep >= this.steps.length) {
      return;
    }

    const step = this.steps[this.currentStep];
    if (!step) {
      return;
    }
    const stepWeight = step.weight ?? 1;
    this.completedWeight += stepWeight;
    this.currentStep++;

    const stepMessage = message ?? `Completed ${step.name}`;

    this.reporter.reportProgress(this.progressToken, {
      current: this.completedWeight,
      total: this.totalWeight,
      message: stepMessage,
      metadata: {
        completedStep: step.name,
        stepNumber: this.currentStep,
        totalSteps: this.steps.length
      }
    });
  }

  /**
   * Update progress within current step
   */
  updateStepProgress(stepProgress: number, message?: string): void {
    if (this.currentStep >= this.steps.length) {
      return;
    }

    const step = this.steps[this.currentStep];
    if (!step) {
      return;
    }
    const stepWeight = step.weight ?? 1;
    const currentStepProgress = Math.max(0, Math.min(1, stepProgress));
    const totalProgress = this.completedWeight + stepWeight * currentStepProgress;

    this.reporter.reportProgress(this.progressToken, {
      current: Math.round(totalProgress),
      total: this.totalWeight,
      message: message ?? `Processing ${step.name}`,
      metadata: {
        step: step.name,
        stepNumber: this.currentStep + 1,
        totalSteps: this.steps.length,
        stepProgress: Math.round(currentStepProgress * 100)
      }
    });
  }

  /**
   * Get current progress state
   */
  getProgress(): {
    currentStep: number;
    totalSteps: number;
    currentStepName?: string | undefined;
    overallProgress: number;
  } {
    const currentStepName =
      this.currentStep < this.steps.length ? this.steps[this.currentStep]?.name : undefined;

    return {
      currentStep: this.currentStep,
      totalSteps: this.steps.length,
      ...(currentStepName !== undefined && { currentStepName }),
      overallProgress: Math.round((this.completedWeight / this.totalWeight) * 100)
    };
  }

  /**
   * Mark workflow complete
   */
  complete(message?: string): void {
    this.reporter.reportComplete(this.progressToken, message ?? 'All steps completed');
  }
}
