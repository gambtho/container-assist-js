/**
 * Simple Progress Tracker
 * Replaces complex EventEmitter-based progress systems with simple callback pattern
 */

import type { Logger } from 'pino';
import type { ProgressCallback, ProgressUpdate } from './types';

export class SimpleProgressTracker {
  constructor(private logger: Logger) {}

  async reportProgress(
    callback: ProgressCallback | undefined,
    update: ProgressUpdate,
  ): Promise<void> {
    if (callback) {
      try {
        await Promise.resolve(callback(update));
      } catch (error) {
        this.logger.warn(
          {
            error: error instanceof Error ? error.message : String(error),
            step: update.step,
          },
          'Progress callback error',
        );
      }
    }

    this.logger.debug(
      {
        step: update.step,
        status: update.status,
        progress: Math.round(update.progress * 100),
      },
      'Progress update',
    );
  }

  createStepReporter(
    callback: ProgressCallback | undefined,
    stepName: string,
  ): StepProgressReporter {
    return new StepProgressReporter(this, callback, stepName);
  }
}

/**
 * Step-specific progress reporter for convenient step tracking
 */
export class StepProgressReporter {
  constructor(
    private tracker: SimpleProgressTracker,
    private callback: ProgressCallback | undefined,
    private stepName: string,
  ) {}

  async start(message?: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.tracker.reportProgress(this.callback, {
      step: this.stepName,
      status: 'starting',
      progress: 0,
      ...(message && { message }),
      ...(metadata && { metadata }),
    });
  }

  async progress(
    progress: number,
    message?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.tracker.reportProgress(this.callback, {
      step: this.stepName,
      status: 'in_progress',
      progress: Math.max(0, Math.min(1, progress)),
      ...(message && { message }),
      ...(metadata && { metadata }),
    });
  }

  async complete(message?: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.tracker.reportProgress(this.callback, {
      step: this.stepName,
      status: 'completed',
      progress: 1.0,
      ...(message && { message }),
      ...(metadata && { metadata }),
    });
  }

  async fail(message?: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.tracker.reportProgress(this.callback, {
      step: this.stepName,
      status: 'failed',
      progress: 0,
      ...(message && { message }),
      ...(metadata && { metadata }),
    });
  }
}
