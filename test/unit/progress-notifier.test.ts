import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import pino from 'pino';
import { McpProgressNotifier, ProgressTracker } from '../../src/mcp/events/emitter.js';
import type { ProgressEvent, ProgressNotifier } from '../../src/mcp/events/types.js';

describe('McpProgressNotifier', () => {
  let progressNotifier: ProgressNotifier;
  let logger: pino.Logger;

  beforeEach(() => {
    logger = pino({ level: 'silent' }); // Silent logging for tests
    progressNotifier = new McpProgressNotifier(logger);
  });

  afterEach(() => {
    if (progressNotifier instanceof McpProgressNotifier) {
      progressNotifier.destroy();
    }
  });

  describe('notifyProgress', () => {
    it('should emit progress events', () => {
      const events: ProgressEvent[] = [];
      const unsubscribe = progressNotifier.subscribe(event => events.push(event));

      progressNotifier.notifyProgress({
        token: 'test-token',
        value: 50,
        message: 'Half done',
      });

      expect(events).toHaveLength(1);
      expect(events[0].token).toBe('test-token');
      expect(events[0].type).toBe('progress');
      expect(events[0].value).toBe(50);
      expect(events[0].message).toBe('Half done');
      expect(events[0].timestamp).toBeInstanceOf(Date);

      unsubscribe();
    });

    it('should clamp progress values to 0-100 range', () => {
      const events: ProgressEvent[] = [];
      const unsubscribe = progressNotifier.subscribe(event => events.push(event));

      progressNotifier.notifyProgress({ token: 'test', value: -10 });
      progressNotifier.notifyProgress({ token: 'test', value: 150 });

      expect(events[0].value).toBe(0);
      expect(events[1].value).toBe(100);

      unsubscribe();
    });
  });

  describe('notifyComplete', () => {
    it('should emit completion events', () => {
      const events: ProgressEvent[] = [];
      const unsubscribe = progressNotifier.subscribe(event => events.push(event));

      const result = { success: true };
      progressNotifier.notifyComplete('test-token', result);

      expect(events).toHaveLength(1);
      expect(events[0].token).toBe('test-token');
      expect(events[0].type).toBe('complete');
      expect(events[0].value).toBe(100);
      expect(events[0].result).toBe(result);

      unsubscribe();
    });
  });

  describe('notifyError', () => {
    it('should emit error events', () => {
      const events: ProgressEvent[] = [];
      const unsubscribe = progressNotifier.subscribe(event => events.push(event));

      progressNotifier.notifyError('test-token', 'Something went wrong');

      expect(events).toHaveLength(1);
      expect(events[0].token).toBe('test-token');
      expect(events[0].type).toBe('error');
      expect(events[0].error).toBe('Something went wrong');

      unsubscribe();
    });
  });

  describe('subscribe', () => {
    it('should allow multiple subscribers', () => {
      const events1: ProgressEvent[] = [];
      const events2: ProgressEvent[] = [];

      const unsubscribe1 = progressNotifier.subscribe(event => events1.push(event));
      const unsubscribe2 = progressNotifier.subscribe(event => events2.push(event));

      progressNotifier.notifyProgress({ token: 'test', value: 25 });

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
      expect(events1[0].token).toBe('test');
      expect(events2[0].token).toBe('test');

      unsubscribe1();
      unsubscribe2();
    });

    it('should handle subscriber errors gracefully', () => {
      const events: ProgressEvent[] = [];

      const unsubscribe1 = progressNotifier.subscribe(() => {
        throw new Error('Subscriber error');
      });
      const unsubscribe2 = progressNotifier.subscribe(event => events.push(event));

      // Should not throw despite first subscriber error
      expect(() => {
        progressNotifier.notifyProgress({ token: 'test', value: 50 });
      }).not.toThrow();

      expect(events).toHaveLength(1);

      unsubscribe1();
      unsubscribe2();
    });

    it('should allow unsubscribing', () => {
      const events: ProgressEvent[] = [];
      const unsubscribe = progressNotifier.subscribe(event => events.push(event));

      progressNotifier.notifyProgress({ token: 'test', value: 25 });
      expect(events).toHaveLength(1);

      unsubscribe();

      progressNotifier.notifyProgress({ token: 'test', value: 50 });
      expect(events).toHaveLength(1); // Should not receive the second event
    });
  });

  describe('generateToken', () => {
    it('should generate unique tokens', () => {
      const token1 = progressNotifier.generateToken('test-op');
      const token2 = progressNotifier.generateToken('test-op');

      expect(token1).not.toBe(token2);
      expect(token1).toContain('test-op');
      expect(token2).toContain('test-op');
    });

    it('should generate tokens without operation name', () => {
      const token = progressNotifier.generateToken();

      expect(token).toContain('operation');
      expect(token).toMatch(/^operation-\d+-[a-z0-9]+$/);
    });
  });
});

describe('ProgressTracker', () => {
  let progressNotifier: McpProgressNotifier;
  let logger: pino.Logger;

  beforeEach(() => {
    logger = pino({ level: 'silent' });
    progressNotifier = new McpProgressNotifier(logger);
  });

  afterEach(() => {
    progressNotifier.destroy();
  });

  it('should track progress through multiple steps', () => {
    const events: ProgressEvent[] = [];
    const unsubscribe = progressNotifier.subscribe(event => events.push(event));

    const token = 'test-tracker';
    const tracker = new ProgressTracker(progressNotifier, token, logger);

    tracker
      .addStep('Step 1', 2)
      .addStep('Step 2', 1)
      .addStep('Step 3', 1);

    tracker.nextStep('Starting step 1');
    tracker.nextStep('Starting step 2');
    tracker.nextStep('Starting step 3');
    tracker.complete({ result: 'success' });

    expect(events).toHaveLength(4);

    // Progress events should increase
    expect(events[0].value).toBe(0);
    expect(events[1].value).toBe(33);
    expect(events[2].value).toBe(67);

    // Complete event
    expect(events[3].type).toBe('complete');
    expect(events[3].result).toEqual({ result: 'success' });

    unsubscribe();
  });

  it('should handle errors', () => {
    const events: ProgressEvent[] = [];
    const unsubscribe = progressNotifier.subscribe(event => events.push(event));

    const token = 'test-error';
    const tracker = new ProgressTracker(progressNotifier, token, logger);

    tracker.addStep('Step 1');
    tracker.nextStep();
    tracker.error('Something failed');

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('progress');
    expect(events[1].type).toBe('error');
    expect(events[1].error).toBe('Something failed');

    unsubscribe();
  });

  it('should handle empty step list gracefully', () => {
    const events: ProgressEvent[] = [];
    const unsubscribe = progressNotifier.subscribe(event => events.push(event));

    const token = 'test-empty';
    const tracker = new ProgressTracker(progressNotifier, token, logger);

    // Should not crash with no steps defined
    expect(() => {
      tracker.nextStep('No steps defined');
    }).not.toThrow();

    expect(events).toHaveLength(0);

    unsubscribe();
  });
});
