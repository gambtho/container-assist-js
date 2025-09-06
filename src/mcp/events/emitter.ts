import type { Logger } from 'pino';
import { EventEmitter } from 'events';
import type { ProgressEvent, ProgressNotifier } from './types.js';

export class McpProgressNotifier implements ProgressNotifier {
  private readonly eventEmitter = new EventEmitter();
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'McpProgressNotifier' });

    // Set max listeners to handle multiple concurrent operations
    this.eventEmitter.setMaxListeners(100);
  }

  notifyProgress(progress: { token: string; value: number; message?: string }): void {
    try {
      // Validate progress value
      if (progress.value < 0 || progress.value > 100) {
        this.logger.warn(
          {
            token: progress.token,
            value: progress.value,
          },
          'Invalid progress value, clamping to 0-100 range',
        );

        progress.value = Math.max(0, Math.min(100, progress.value));
      }

      const event: ProgressEvent = {
        token: progress.token,
        type: 'progress',
        value: progress.value,
        message: progress.message,
        timestamp: new Date(),
      };

      this.eventEmitter.emit('progress', event);

      this.logger.debug(
        {
          token: progress.token,
          value: progress.value,
          message: progress.message,
        },
        'Progress notified',
      );
    } catch (error) {
      this.logger.error({ error, token: progress.token }, 'Failed to notify progress');
    }
  }

  notifyComplete(token: string, result?: unknown): void {
    try {
      const event: ProgressEvent = {
        token,
        type: 'complete',
        value: 100,
        result,
        timestamp: new Date(),
      };

      this.eventEmitter.emit('complete', event);
      this.eventEmitter.emit('progress', event);

      this.logger.debug({ token, hasResult: !!result }, 'Operation completed');
    } catch (error) {
      this.logger.error({ error, token }, 'Failed to notify completion');
    }
  }

  notifyError(token: string, error: string): void {
    try {
      const event: ProgressEvent = {
        token,
        type: 'error',
        error,
        timestamp: new Date(),
      };

      this.eventEmitter.emit('error', event);
      this.eventEmitter.emit('progress', event);

      this.logger.error({ token, error }, 'Operation failed');
    } catch (err) {
      this.logger.error({ error: err, token, originalError: error }, 'Failed to notify error');
    }
  }

  subscribe(callback: (event: ProgressEvent) => void): () => void {
    try {
      const wrappedCallback = (event: ProgressEvent): void => {
        try {
          callback(event);
        } catch (error) {
          this.logger.error({ error, token: event.token }, 'Progress callback failed');
        }
      };

      this.eventEmitter.on('progress', wrappedCallback);

      this.logger.debug('Progress subscriber added');

      // Return unsubscribe function
      return () => {
        this.eventEmitter.removeListener('progress', wrappedCallback);
        this.logger.debug('Progress subscriber removed');
      };
    } catch (error) {
      this.logger.error({ error }, 'Failed to subscribe to progress');

      // Return no-op unsubscribe function
      return () => {};
    }
  }

  generateToken(operation?: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    const token = operation
      ? `${operation}-${timestamp}-${random}`
      : `operation-${timestamp}-${random}`;

    this.logger.debug({ token, operation }, 'Progress token generated');
    return token;
  }

  /**
   * Get the current number of active listeners (for monitoring)
   */
  getListenerCount(): number {
    return this.eventEmitter.listenerCount('progress');
  }

  /**
   * Clean up resources and remove all listeners
   */
  destroy(): void {
    this.eventEmitter.removeAllListeners();
    this.logger.debug('Progress notifier destroyed');
  }
}

/**
 * Progress tracking utility for wrapping operations
 */
export class ProgressTracker {
  private current = 0;
  private readonly steps: Array<{ name: string; weight: number }> = [];

  constructor(
    private readonly notifier: ProgressNotifier,
    private readonly token: string,
    private readonly logger: Logger,
  ) {}

  /**
   * Add a step with a relative weight
   */
  addStep(name: string, weight: number = 1): this {
    this.steps.push({ name, weight });
    return this;
  }

  /**
   * Start the next step
   */
  nextStep(message?: string): void {
    if (this.steps.length === 0) {
      this.logger.warn({ token: this.token }, 'No steps defined for progress tracker');
      return;
    }

    const currentStep = this.steps[this.current];

    if (!currentStep) {
      this.logger.warn(
        {
          token: this.token,
          current: this.current,
          totalSteps: this.steps.length,
        },
        'Step index out of range',
      );
      return;
    }

    const progress = Math.round((this.current / this.steps.length) * 100);
    const stepMessage = message ?? `${currentStep.name}...`;

    this.notifier.notifyProgress({
      token: this.token,
      value: progress,
      message: stepMessage,
    });

    this.current++;
  }

  /**
   * Complete all remaining steps
   */
  complete(result?: unknown): void {
    this.notifier.notifyComplete(this.token, result);
  }

  /**
   * Fail with error
   */
  error(error: string): void {
    this.notifier.notifyError(this.token, error);
  }
}
