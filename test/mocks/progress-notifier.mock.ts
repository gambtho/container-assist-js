import type { ProgressEvent, ProgressNotifier } from '../../src/mcp/events/types.js';

/**
 * Mock ProgressNotifier for testing and independent team development
 * Captures and tracks progress events for verification
 */
export class MockProgressNotifier implements ProgressNotifier {
  private events: ProgressEvent[] = [];
  private subscribers: Array<(event: ProgressEvent) => void> = [];
  private tokenCounter = 0;
  private readonly config: {
    logEvents: boolean;
    maxEvents: number;
    simulateDelay: boolean;
  };

  constructor(config?: Partial<typeof MockProgressNotifier.prototype.config>) {
    this.config = {
      logEvents: true,
      maxEvents: 1000,
      simulateDelay: false,
      ...config,
    };
  }

  notifyProgress(progress: {
    token: string;
    value: number;
    message?: string;
  }): void {
    // Validate progress value
    const clampedValue = Math.max(0, Math.min(100, progress.value));

    const event: ProgressEvent = {
      token: progress.token,
      type: 'progress',
      value: clampedValue,
      message: progress.message,
      timestamp: new Date(),
    };

    this.addEvent(event);
    this.notifySubscribers(event);

    if (this.config.logEvents) {
      console.log(`[MockProgressNotifier] Progress: ${progress.token} - ${clampedValue}% ${progress.message || ''}`);
    }
  }

  notifyComplete(token: string, result?: unknown): void {
    const event: ProgressEvent = {
      token,
      type: 'complete',
      value: 100,
      result,
      timestamp: new Date(),
    };

    this.addEvent(event);
    this.notifySubscribers(event);

    if (this.config.logEvents) {
      console.log(`[MockProgressNotifier] Complete: ${token} ${result ? '(with result)' : ''}`);
    }
  }

  notifyError(token: string, error: string): void {
    const event: ProgressEvent = {
      token,
      type: 'error',
      error,
      timestamp: new Date(),
    };

    this.addEvent(event);
    this.notifySubscribers(event);

    if (this.config.logEvents) {
      console.log(`[MockProgressNotifier] Error: ${token} - ${error}`);
    }
  }

  subscribe(callback: (event: ProgressEvent) => void): () => void {
    const wrappedCallback = (event: ProgressEvent) => {
      try {
        if (this.config.simulateDelay) {
          setTimeout(() => callback(event), Math.random() * 10);
        } else {
          callback(event);
        }
      } catch (error) {
        console.error(`[MockProgressNotifier] Subscriber callback failed:`, error);
      }
    };

    this.subscribers.push(wrappedCallback);

    if (this.config.logEvents) {
      console.log(`[MockProgressNotifier] Subscriber added (total: ${this.subscribers.length})`);
    }

    // Return unsubscribe function
    return () => {
      const index = this.subscribers.indexOf(wrappedCallback);
      if (index > -1) {
        this.subscribers.splice(index, 1);
        if (this.config.logEvents) {
          console.log(`[MockProgressNotifier] Subscriber removed (remaining: ${this.subscribers.length})`);
        }
      }
    };
  }

  generateToken(operation?: string): string {
    const timestamp = Date.now();
    const counter = ++this.tokenCounter;
    const token = operation
      ? `mock-${operation}-${timestamp}-${counter}`
      : `mock-operation-${timestamp}-${counter}`;

    if (this.config.logEvents) {
      console.log(`[MockProgressNotifier] Generated token: ${token}`);
    }

    return token;
  }

  /**
   * Mock-specific methods for testing and verification
   */

  /**
   * Get all events for a specific token
   */
  getEventsForToken(token: string): ProgressEvent[] {
    return this.events.filter(event => event.token === token);
  }

  /**
   * Get events by type
   */
  getEventsByType(type: ProgressEvent['type']): ProgressEvent[] {
    return this.events.filter(event => event.type === type);
  }

  /**
   * Get the last event for a token
   */
  getLastEventForToken(token: string): ProgressEvent | undefined {
    const events = this.getEventsForToken(token);
    return events[events.length - 1];
  }

  /**
   * Check if a token completed successfully
   */
  isTokenCompleted(token: string): boolean {
    const lastEvent = this.getLastEventForToken(token);
    return lastEvent?.type === 'complete';
  }

  /**
   * Check if a token failed
   */
  isTokenFailed(token: string): boolean {
    const lastEvent = this.getLastEventForToken(token);
    return lastEvent?.type === 'error';
  }

  /**
   * Get progress timeline for a token
   */
  getProgressTimeline(token: string): Array<{ value: number; message?: string; timestamp: Date }> {
    return this.getEventsForToken(token)
      .filter(event => event.type === 'progress' && event.value !== undefined)
      .map(event => ({
        value: event.value!,
        message: event.message,
        timestamp: event.timestamp,
      }));
  }

  /**
   * Get all active tokens (neither completed nor failed)
   */
  getActiveTokens(): string[] {
    const tokenStatus = new Map<string, ProgressEvent['type']>();

    for (const event of this.events) {
      if (event.type === 'complete' || event.type === 'error') {
        tokenStatus.set(event.token, event.type);
      } else if (!tokenStatus.has(event.token)) {
        tokenStatus.set(event.token, 'progress');
      }
    }

    return Array.from(tokenStatus.entries())
      .filter(([, status]) => status === 'progress')
      .map(([token]) => token);
  }

  /**
   * Get statistics about tracked events
   */
  getStats(): {
    totalEvents: number;
    uniqueTokens: number;
    completedTokens: number;
    failedTokens: number;
    activeTokens: number;
    subscriberCount: number;
  } {
    const uniqueTokens = new Set(this.events.map(e => e.token));
    const completedTokens = new Set(this.events.filter(e => e.type === 'complete').map(e => e.token));
    const failedTokens = new Set(this.events.filter(e => e.type === 'error').map(e => e.token));
    const activeTokens = this.getActiveTokens();

    return {
      totalEvents: this.events.length,
      uniqueTokens: uniqueTokens.size,
      completedTokens: completedTokens.size,
      failedTokens: failedTokens.size,
      activeTokens: activeTokens.length,
      subscriberCount: this.subscribers.length,
    };
  }

  /**
   * Clear all events and reset state
   */
  clearEvents(): void {
    this.events = [];
    this.tokenCounter = 0;

    if (this.config.logEvents) {
      console.log('[MockProgressNotifier] All events cleared');
    }
  }

  /**
   * Wait for a token to complete or fail
   */
  async waitForToken(token: string, timeoutMs: number = 5000): Promise<ProgressEvent> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Token ${token} did not complete within ${timeoutMs}ms`));
      }, timeoutMs);

      const unsubscribe = this.subscribe((event) => {
        if (event.token === token && (event.type === 'complete' || event.type === 'error')) {
          clearTimeout(timeout);
          unsubscribe();
          resolve(event);
        }
      });

      // Check if already completed
      const lastEvent = this.getLastEventForToken(token);
      if (lastEvent && (lastEvent.type === 'complete' || lastEvent.type === 'error')) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(lastEvent);
      }
    });
  }

  /**
   * Set configuration options
   */
  setConfig(config: Partial<typeof MockProgressNotifier.prototype.config>): void {
    Object.assign(this.config, config);

    if (this.config.logEvents) {
      console.log('[MockProgressNotifier] Configuration updated:', config);
    }
  }

  private addEvent(event: ProgressEvent): void {
    this.events.push(event);

    // Trim events if we exceed the maximum
    if (this.events.length > this.config.maxEvents) {
      this.events = this.events.slice(-this.config.maxEvents);
    }
  }

  private notifySubscribers(event: ProgressEvent): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(event);
      } catch (error) {
        console.error('[MockProgressNotifier] Subscriber notification failed:', error);
      }
    }
  }
}

/**
 * Factory function for creating mock progress notifier instances
 */
export const createMockProgressNotifier = (config?: Parameters<typeof MockProgressNotifier.prototype.constructor>[0]): ProgressNotifier => {
  return new MockProgressNotifier(config);
};
