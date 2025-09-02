/**
 * Progress Channel - Unified progress tracking built on EventPublisher
 *
 * This provides a typed channel for progress events on top of the generic EventPublisher,
 * maintaining backward compatibility while simplifying the event system architecture.
 */

import type { Logger } from 'pino';
import type {
  ProgressUpdate,
  ProgressListener,
  ProgressFilter,
  ProgressEmitter as ProgressEmitterInterface
} from '../../contracts/types/index';
import type { EventEmitter } from 'events';

/**
 * Progress Channel - specialized event channel for progress updates
 * Built on top of EventPublisher to maintain single event hub architecture
 */
export interface ProgressChannelOptions {
  enableHistory?: boolean;
  maxHistoryPerSession?: number;
  cleanupIntervalMs?: number;
}

export class ProgressChannel implements ProgressEmitterInterface {
  private readonly eventEmitter: EventEmitter;
  private readonly logger: Logger;
  private readonly history = new Map<string, ProgressUpdate[]>();
  private readonly maxHistoryPerSession: number;
  private readonly progressListeners = new Set<ProgressListener>();
  private cleanupInterval?: NodeJS.Timeout;
  private readonly enableHistory: boolean;

  constructor(eventEmitter: EventEmitter, logger: Logger, options: ProgressChannelOptions = {}) {
    this.eventEmitter = eventEmitter;
    this.logger = logger.child({ component: 'ProgressChannel' });

    // Make history optional - disabled by default for MCP use case
    this.enableHistory = options.enableHistory ?? false;
    this.maxHistoryPerSession = options.maxHistoryPerSession ?? 1000;

    // Only start cleanup if history is enabled
    if (this.enableHistory) {
      this.startHistoryCleanup(options.cleanupIntervalMs);
    }

    this.logger.info({ enableHistory: this.enableHistory }, 'Progress channel initialized');
  }

  /**
   * Emit a progress update through the event publisher
   */
  async emit(update: Partial<ProgressUpdate>): Promise<void> {
    // Validate required fields
    if (!update.sessionId ?? !update.step || !update.status) {
      throw new Error('Progress update must have sessionId, step, and status');
    }

    const fullUpdate: ProgressUpdate = {
      sessionId: update.sessionId,
      step: update.step,
      status: update.status,
      progress: update.progress ?? 0,
      timestamp: update.timestamp ?? new Date().toISOString(),
      ...(update.message !== undefined && { message: update.message }),
      ...(update.metadata !== undefined && { metadata: update.metadata })
    };

    // Store in history (only if enabled)
    if (this.enableHistory) {
      this.addToHistory(fullUpdate);
    }

    // Emit through EventEmitter with typed event names
    this.eventEmitter.emit('progress:update', fullUpdate);
    this.eventEmitter.emit(`progress:session:${fullUpdate.sessionId}`, fullUpdate);
    this.eventEmitter.emit(`progress:step:${fullUpdate.step}`, fullUpdate);
    this.eventEmitter.emit(`progress:status:${fullUpdate.status}`, fullUpdate);

    // Notify direct listeners (for backward compatibility)
    const promises = Array.from(this.progressListeners).map((listener) =>
      Promise.resolve(listener.onProgress(fullUpdate)).catch((error) => {
        this.logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            listener: listener.constructor.name
          },
          'Progress listener error'
        );
      })
    );

    await Promise.all(promises);

    // Log at debug level
    this.logger.debug(
      {
        sessionId: fullUpdate.sessionId,
        step: fullUpdate.step,
        status: fullUpdate.status,
        progress: Math.round(fullUpdate.progress * 100)
      },
      'Progress update emitted'
    );
  }

  /**
   * Add a progress listener
   */
  addListener(listener: ProgressListener): void {
    this.progressListeners.add(listener);
    this.logger.debug(
      {
        listenerCount: this.progressListeners.size
      },
      'Progress listener added'
    );
  }

  /**
   * Remove a progress listener
   */
  removeListener(listener: ProgressListener): void {
    this.progressListeners.delete(listener);
    this.logger.debug(
      {
        listenerCount: this.progressListeners.size
      },
      'Progress listener removed'
    );
  }

  /**
   * Get progress history for a session
   */
  getHistory(sessionId: string, filter?: ProgressFilter): ProgressUpdate[] {
    if (!this.enableHistory) {
      this.logger.debug('History disabled - returning empty array');
      return [];
    }

    const sessionHistory = this.history.get(sessionId) || [];

    if (!filter) {
      return [...sessionHistory];
    }

    return sessionHistory
      .filter((update) => {
        if (filter.step && update.step !== filter.step) return false;
        if (filter.status && update.status !== filter.status) return false;
        if (filter.since && new Date(update.timestamp) < filter.since) return false;
        return true;
      })
      .slice(0, filter.limit);
  }

  /**
   * Get current progress state for a session
   */
  getCurrentProgress(sessionId: string): {
    currentStep?: string;
    progress: number;
    completedSteps: string[];
    failedSteps: string[];
  } {
    if (!this.enableHistory) {
      this.logger.debug('History disabled - returning default progress state');
      return {
        progress: 0,
        completedSteps: [],
        failedSteps: []
      };
    }

    const sessionHistory = this.history.get(sessionId) || [];

    const completedSteps = new Set<string>();
    const failedSteps = new Set<string>();
    let currentStep: string | undefined;
    let overallProgress = 0;

    // Process history to determine state
    for (const update of sessionHistory) {
      if (update.status === 'completed') {
        completedSteps.add(update.step);
        failedSteps.delete(update.step);
      } else if (update.status === 'failed') {
        failedSteps.add(update.step);
        completedSteps.delete(update.step);
      } else if (update.status === 'in_progress' || update.status === 'starting') {
        currentStep = update.step;
        overallProgress = update.progress;
      }
    }

    return {
      ...(currentStep !== undefined && { currentStep }),
      progress: overallProgress,
      completedSteps: Array.from(completedSteps),
      failedSteps: Array.from(failedSteps)
    };
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      delete (this as unknown).cleanupInterval;
    }

    this.progressListeners.clear();
    this.history.clear();

    this.logger.info('Progress channel shutdown');
  }

  /**
   * Add update to history
   */
  private addToHistory(update: ProgressUpdate): void {
    const sessionHistory = this.history.get(update.sessionId) || [];
    await sessionHistory.push(update);

    // Trim history if it exceeds max size
    if (sessionHistory.length > this.maxHistoryPerSession) {
      sessionHistory.splice(0, sessionHistory.length - this.maxHistoryPerSession);
    }

    this.history.set(update.sessionId, sessionHistory);
  }

  /**
   * Start periodic cleanup of old history
   */
  private startHistoryCleanup(cleanupIntervalMs?: number): void {
    // Default: Clean up history older than 1 hour every 5 minutes
    const interval = cleanupIntervalMs ?? 5 * 60 * 1000; // 5 minutes

    this.cleanupInterval = setInterval(() => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      for (const [sessionId, updates] of this.history.entries()) {
        // Remove sessions with no recent updates
        const recentUpdates = updates.filter((u) => new Date(u.timestamp) > oneHourAgo);

        if (recentUpdates.length === 0) {
          this.history.delete(sessionId);
          this.logger.debug({ sessionId }, 'Removed stale session history');
        } else if (recentUpdates.length < updates.length) {
          this.history.set(sessionId, recentUpdates);
          this.logger.debug(
            {
              sessionId,
              removed: updates.length - recentUpdates.length
            },
            'Trimmed old history entries'
          );
        }
      }
    }, interval);
  }

  /**
   * Subscribe to progress events through EventPublisher
   * This provides a bridge between the typed progress system and generic events
   */
  subscribeToProgressEvents(
    handler: (update: ProgressUpdate) => void,
    filter?: { sessionId?: string; step?: string; status?: string }
  ): () => void {
    const eventType = filter?.sessionId
      ? `progress:session:${filter.sessionId}`
      : filter?.step
        ? `progress:step:${filter.step}`
        : filter?.status
          ? `progress:status:${filter.status}`
          : 'progress:update';

    this.eventEmitter.on(eventType, handler);

    // Return unsubscribe function
    return () => {
      this.eventEmitter.off(eventType, handler);
    };
  }
}
