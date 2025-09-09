/**
 * Tests for Session Helpers Module
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { Logger } from 'pino';
import { 
  resolveSession,
  appendCompletedStep,
  setWorkflowManifests,
  getSessionState,
  updateSessionData,
  clearSessionErrors,
  addSessionError,
  computeSessionHash
} from '@mcp/tools/session-helpers';
import type { SessionManager } from '@lib/session';
import type { WorkflowState } from '@domain/types';
import type { ExtendedToolContext } from '@tools/shared-types';

// Mock logger
const createMockLogger = (): Logger => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(() => createMockLogger()),
} as unknown as Logger);

// Mock session manager
const createMockSessionManager = (): SessionManager => {
  const sessions = new Map<string, WorkflowState>();
  
  return {
    create: jest.fn(async (id?: string) => {
      const sessionId = id || 'test-session-id';
      const now = new Date();
      const state: WorkflowState = {
        sessionId,
        metadata: {},
        completed_steps: [],
        errors: {},
        current_step: null,
        createdAt: now,
        updatedAt: now,
      };
      sessions.set(sessionId, state);
      return state;
    }),
    get: jest.fn(async (id: string) => {
      return sessions.get(id) || null;
    }),
    update: jest.fn(async (id: string, updates: Partial<WorkflowState>) => {
      const current = sessions.get(id);
      if (!current) throw new Error(`Session ${id} not found`);
      const updated = { ...current, ...updates, updatedAt: new Date() };
      sessions.set(id, updated);
    }),
    delete: jest.fn(async (id: string) => {
      sessions.delete(id);
    }),
    list: jest.fn(async () => Array.from(sessions.keys())),
    cleanup: jest.fn(),
    createSession: jest.fn(),
    getSession: jest.fn(),
    updateSession: jest.fn(),
    deleteSession: jest.fn(),
    close: jest.fn(),
  } as unknown as SessionManager;
};

describe('Session Helpers', () => {
  let logger: Logger;
  let sessionManager: SessionManager;
  let context: ExtendedToolContext;

  beforeEach(() => {
    logger = createMockLogger();
    sessionManager = createMockSessionManager();
    context = { sessionManager };
    jest.clearAllMocks();
  });

  describe('resolveSession', () => {
    it('should resolve existing session', async () => {
      // Create a session first
      await sessionManager.create('existing-session');
      
      const result = await resolveSession(logger, context, {
        sessionId: 'existing-session',
        createIfNotExists: false
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('existing-session');
        expect(result.value.isNew).toBe(false);
        expect(result.value.state.sessionId).toBe('existing-session');
      }
    });

    it('should create new session when not found and createIfNotExists is true', async () => {
      const result = await resolveSession(logger, context, {
        sessionId: 'new-session',
        createIfNotExists: true
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('new-session');
        expect(result.value.isNew).toBe(true);
        expect(sessionManager.create).toHaveBeenCalledWith('new-session');
      }
    });

    it('should fail when session not found and createIfNotExists is false', async () => {
      const result = await resolveSession(logger, context, {
        sessionId: 'missing-session',
        createIfNotExists: false
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Session missing-session not found');
      }
    });

    it('should use default hint for session ID generation', async () => {
      const result = await resolveSession(logger, context, {
        defaultIdHint: 'test-hint',
        createIfNotExists: true
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('session-test-hint');
        expect(result.value.isNew).toBe(true);
      }
    });

    it('should generate random session ID when no sessionId or hint provided', async () => {
      const result = await resolveSession(logger, context, {
        createIfNotExists: true
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBeTruthy();
        expect(result.value.id.length).toBeGreaterThan(0);
        expect(result.value.isNew).toBe(true);
      }
    });

    it('should create session manager if not in context', async () => {
      const result = await resolveSession(logger, undefined, {
        sessionId: 'test-session',
        createIfNotExists: true
      });

      // Should still work, but with a new session manager
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('test-session');
      }
    });
  });

  describe('appendCompletedStep', () => {
    it('should append new step to completed steps', async () => {
      await sessionManager.create('test-session');
      
      const result = await appendCompletedStep('test-session', 'step1', logger, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.completed_steps).toContain('step1');
        expect(result.value.current_step).toBe('step1');
      }
    });

    it('should not duplicate steps', async () => {
      const state = await sessionManager.create('test-session');
      state.completed_steps = ['step1'];
      
      const result = await appendCompletedStep('test-session', 'step1', logger, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.completed_steps).toHaveLength(1);
        expect(result.value.completed_steps).toEqual(['step1']);
      }
    });

    it('should fail for non-existent session', async () => {
      const result = await appendCompletedStep('missing-session', 'step1', logger, context);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Session missing-session not found');
      }
    });
  });

  describe('setWorkflowManifests', () => {
    it('should set manifests in session metadata', async () => {
      await sessionManager.create('test-session');
      
      const manifests = { 
        deployment: { kind: 'Deployment', name: 'test' },
        service: { kind: 'Service', name: 'test' }
      };
      
      const result = await setWorkflowManifests('test-session', manifests, logger, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata?.manifests).toEqual(manifests);
      }
    });

    it('should merge with existing metadata', async () => {
      const state = await sessionManager.create('test-session');
      state.metadata = { existing: 'data' };
      
      const manifests = { deployment: 'test' };
      const result = await setWorkflowManifests('test-session', manifests, logger, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata?.existing).toBe('data');
        expect(result.value.metadata?.manifests).toEqual(manifests);
      }
    });
  });

  describe('getSessionState', () => {
    it('should retrieve existing session state', async () => {
      const state = await sessionManager.create('test-session');
      state.metadata = { test: 'data' };
      
      const result = await getSessionState('test-session', logger, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sessionId).toBe('test-session');
        expect(result.value.metadata).toEqual({ test: 'data' });
      }
    });

    it('should fail for non-existent session', async () => {
      const result = await getSessionState('missing-session', logger, context);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Session missing-session not found');
      }
    });
  });

  describe('updateSessionData', () => {
    it('should update session with partial data', async () => {
      await sessionManager.create('test-session');
      
      const updates = {
        current_step: 'build',
        metadata: { buildId: '123' }
      };
      
      const result = await updateSessionData('test-session', updates, logger, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.current_step).toBe('build');
        expect(result.value.metadata?.buildId).toBe('123');
      }
    });

    it('should merge metadata properly', async () => {
      const state = await sessionManager.create('test-session');
      state.metadata = { existing: 'value' };
      
      const updates = {
        metadata: { new: 'data' }
      };
      
      const result = await updateSessionData('test-session', updates, logger, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.metadata?.existing).toBe('value');
        expect(result.value.metadata?.new).toBe('data');
      }
    });

    it('should handle custom properties not in WorkflowState', async () => {
      await sessionManager.create('test-session');
      
      const updates = {
        analysis_result: { language: 'typescript' },
        custom_field: 'value'
      };
      
      const result = await updateSessionData('test-session', updates, logger, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const fullResult = result.value as any;
        expect(fullResult.analysis_result).toEqual({ language: 'typescript' });
        expect(fullResult.custom_field).toBe('value');
      }
    });
  });

  describe('clearSessionErrors', () => {
    it('should clear all errors from session', async () => {
      const state = await sessionManager.create('test-session');
      state.errors = { step1: 'error1', step2: 'error2' };
      
      const result = await clearSessionErrors('test-session', logger, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.errors).toEqual({});
      }
    });
  });

  describe('addSessionError', () => {
    it('should add error to session', async () => {
      await sessionManager.create('test-session');
      
      const result = await addSessionError('test-session', 'build', 'Build failed', logger, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.errors?.build).toBe('Build failed');
      }
    });

    it('should preserve existing errors', async () => {
      const state = await sessionManager.create('test-session');
      state.errors = { existing: 'error' };
      
      const result = await addSessionError('test-session', 'new', 'New error', logger, context);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.errors?.existing).toBe('error');
        expect(result.value.errors?.new).toBe('New error');
      }
    });
  });

  describe('computeSessionHash', () => {
    it('should generate consistent hash for same data', () => {
      const data = { key: 'value', number: 42 };
      const hash1 = computeSessionHash(data);
      const hash2 = computeSessionHash(data);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(8);
    });

    it('should generate different hashes for different data', () => {
      const data1 = { key: 'value1' };
      const data2 = { key: 'value2' };
      const hash1 = computeSessionHash(data1);
      const hash2 = computeSessionHash(data2);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should handle complex objects consistently', () => {
      const data = {
        nested: { a: 1, b: 2 },
        array: [1, 2, 3],
        string: 'test'
      };
      const hash = computeSessionHash(data);
      
      expect(hash).toBeTruthy();
      expect(hash).toHaveLength(8);
    });
  });

  describe('error handling', () => {
    it('should handle session manager errors gracefully', async () => {
      const errorManager = {
        ...sessionManager,
        get: jest.fn(() => Promise.reject(new Error('Database error')))
      } as unknown as SessionManager;
      
      const errorContext = { sessionManager: errorManager };
      
      const result = await getSessionState('test-session', logger, errorContext);
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Failed to get session: Database error');
      }
    });

    it('should handle update errors gracefully', async () => {
      const errorManager = {
        ...sessionManager,
        get: jest.fn(() => Promise.resolve({ sessionId: 'test' } as WorkflowState)),
        update: jest.fn(() => Promise.reject(new Error('Update failed')))
      } as unknown as SessionManager;
      
      const errorContext = { sessionManager: errorManager };
      
      const result = await appendCompletedStep('test-session', 'step1', logger, errorContext);
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('Failed to append step: Update failed');
      }
    });
  });
});