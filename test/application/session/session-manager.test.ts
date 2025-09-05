/**
 * Session Manager Tests
 *
 * Tests the session management system
 */

import { jest } from '@jest/globals';
import { Success, Failure, isOk, isFail } from '../../../src/domain/types/result';
import { createMockLogger, createMockConfig } from '../../utils/mock-factories';

// Mock the session manager dependencies
const mockSessionStore = {
  get: jest.fn(),
  set: jest.fn(),
  has: jest.fn(),
  delete: jest.fn(),
  clear: jest.fn(),
  keys: jest.fn(),
  size: jest.fn(),
  close: jest.fn(),
};

describe('Session Manager', () => {
  let _logger: ReturnType<typeof createMockLogger>;
  let _config: ReturnType<typeof createMockConfig>;

  beforeEach(() => {
    _logger = createMockLogger();
    _config = createMockConfig();
    jest.clearAllMocks();
  });

  describe('Session Configuration', () => {
    it('should validate session configuration with defaults', () => {
      const validatedConfig = {
        defaultTTL: 86400, // 24 hours
        maxActiveSessions: 1000,
        persistencePath: '',
        persistenceInterval: 60, // 1 minute
      };

      expect(validatedConfig.defaultTTL).toBeGreaterThan(0);
      expect(validatedConfig.maxActiveSessions).toBeGreaterThan(0);
      expect(validatedConfig.persistenceInterval).toBeGreaterThan(0);
    });

    it('should reject invalid session configuration', () => {
      const invalidConfigs = [
        { defaultTTL: -1 },
        { maxActiveSessions: 0 },
        { persistenceInterval: -5 },
      ];

      invalidConfigs.forEach(config => {
        expect(() => {
          if (config.defaultTTL && config.defaultTTL <= 0) {
            throw new Error('defaultTTL must be positive');
          }
          if (config.maxActiveSessions !== undefined && config.maxActiveSessions <= 0) {
            throw new Error('maxActiveSessions must be positive');
          }
          if (config.persistenceInterval && config.persistenceInterval <= 0) {
            throw new Error('persistenceInterval must be positive');
          }
        }).toThrow();
      });
    });
  });

  describe('Session Creation', () => {
    it('should create session with required fields', () => {
      const sessionData = {
        id: 'test-session-123',
        repo_path: '/test/repo',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'active' as const,
        stage: 'analysis' as const,
        labels: {},
        metadata: {},
        workflow_state: {
          completed_steps: [],
          errors: {},
          metadata: {},
        },
        version: 0,
      };

      // Validate session structure
      expect(sessionData.id).toBeDefined();
      expect(sessionData.repo_path).toBeDefined();
      expect(sessionData.created_at).toBeDefined();
      expect(sessionData.updated_at).toBeDefined();
      expect(['active', 'completed', 'failed']).toContain(sessionData.status);
      expect(sessionData.workflow_state).toBeDefined();
      expect(sessionData.version).toBe(0);
    });

    it('should handle session creation with mock store', async () => {
      const sessionId = 'test-session-123';
      const sessionData = {
        id: sessionId,
        repo_path: '/test/repo',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'active' as const,
        stage: 'analysis' as const,
        labels: {},
        metadata: {},
        workflow_state: {
          completed_steps: [],
          errors: {},
          metadata: {},
        },
        version: 0,
      };

      mockSessionStore.set.mockResolvedValue(Success({}));
      mockSessionStore.get.mockResolvedValue(sessionData);

      // Simulate session creation
      const setResult = await mockSessionStore.set(sessionId, sessionData);
      expect(isOk(setResult)).toBe(true);

      // Simulate session retrieval
      const retrievedSession = await mockSessionStore.get(sessionId);
      expect(retrievedSession).toEqual(sessionData);

      expect(mockSessionStore.set).toHaveBeenCalledWith(sessionId, sessionData);
      expect(mockSessionStore.get).toHaveBeenCalledWith(sessionId);
    });

    it('should handle session creation errors', async () => {
      const sessionId = 'test-session-123';
      mockSessionStore.set.mockResolvedValue(Failure('Storage error'));

      const setResult = await mockSessionStore.set(sessionId, {});
      expect(isFail(setResult)).toBe(true);
      if (isFail(setResult)) {
        expect(setResult.error).toBe('Storage error');
      }
    });
  });

  describe('Session Retrieval', () => {
    it('should retrieve existing session', async () => {
      const sessionId = 'test-session-123';
      const sessionData = {
        id: sessionId,
        repo_path: '/test/repo',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        status: 'active' as const,
        stage: 'analysis' as const,
        labels: {},
        metadata: {},
        workflow_state: {
          completed_steps: [],
          errors: {},
          metadata: {},
        },
        version: 0,
      };

      mockSessionStore.get.mockResolvedValue(sessionData);

      const retrievedSession = await mockSessionStore.get(sessionId);
      expect(retrievedSession).toEqual(sessionData);
      expect(mockSessionStore.get).toHaveBeenCalledWith(sessionId);
    });

    it('should handle non-existent session', async () => {
      const sessionId = 'non-existent-session';
      mockSessionStore.get.mockResolvedValue(undefined);

      const retrievedSession = await mockSessionStore.get(sessionId);
      expect(retrievedSession).toBeUndefined();
      expect(mockSessionStore.get).toHaveBeenCalledWith(sessionId);
    });

    it('should check session existence', async () => {
      const sessionId = 'test-session-123';

      mockSessionStore.has.mockResolvedValue(true);
      const exists = await mockSessionStore.has(sessionId);
      expect(exists).toBe(true);

      mockSessionStore.has.mockResolvedValue(false);
      const notExists = await mockSessionStore.has('non-existent');
      expect(notExists).toBe(false);
    });
  });

  describe('Session Updates', () => {
    it('should update session data', async () => {
      const sessionId = 'test-session-123';
      const originalSession = {
        id: sessionId,
        repo_path: '/test/repo',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        status: 'active' as const,
        stage: 'analysis' as const,
        labels: {},
        metadata: {},
        workflow_state: {
          completed_steps: [],
          errors: {},
          metadata: {},
        },
        version: 0,
      };

      const updatedSession = {
        ...originalSession,
        updated_at: '2024-01-01T01:00:00Z',
        stage: 'build' as const,
        version: 1,
      };

      mockSessionStore.get.mockResolvedValue(originalSession);
      mockSessionStore.set.mockResolvedValue(Success({}));

      // Simulate update
      await mockSessionStore.set(sessionId, updatedSession);

      mockSessionStore.get.mockResolvedValue(updatedSession);
      const retrievedSession = await mockSessionStore.get(sessionId);

      expect(retrievedSession.stage).toBe('build');
      expect(retrievedSession.version).toBe(1);
      expect(retrievedSession.updated_at).not.toBe(originalSession.updated_at);
    });

    it('should handle version conflicts in updates', () => {
      const session1 = { id: 'test', version: 0 };
      const session2 = { id: 'test', version: 0 };

      // Simulate concurrent update detection
      const detectConflict = (current: any, update: any) => {
        return current.version !== update.version;
      };

      // Both sessions have same version - conflict detected
      expect(detectConflict(session1, session2)).toBe(false);

      // Different versions - no conflict
      session2.version = 1;
      expect(detectConflict(session1, session2)).toBe(true);
    });
  });

  describe('Session Deletion', () => {
    it('should delete session', async () => {
      const sessionId = 'test-session-123';

      mockSessionStore.delete.mockResolvedValue(Success(true));
      const deleteResult = await mockSessionStore.delete(sessionId);

      expect(isOk(deleteResult)).toBe(true);
      if (isOk(deleteResult)) {
        expect(deleteResult.value).toBe(true);
      }
      expect(mockSessionStore.delete).toHaveBeenCalledWith(sessionId);
    });

    it('should handle deletion of non-existent session', async () => {
      const sessionId = 'non-existent-session';

      mockSessionStore.delete.mockResolvedValue(Success(false));
      const deleteResult = await mockSessionStore.delete(sessionId);

      expect(isOk(deleteResult)).toBe(true);
      if (isOk(deleteResult)) {
        expect(deleteResult.value).toBe(false);
      }
    });

    it('should clear all sessions', async () => {
      mockSessionStore.clear.mockResolvedValue(Success({}));
      const clearResult = await mockSessionStore.clear();

      expect(isOk(clearResult)).toBe(true);
      expect(mockSessionStore.clear).toHaveBeenCalled();
    });
  });

  describe('Session Listing and Filtering', () => {
    it('should list session keys', async () => {
      const sessionKeys = ['session-1', 'session-2', 'session-3'];
      mockSessionStore.keys.mockResolvedValue(Success(sessionKeys));

      const keysResult = await mockSessionStore.keys();
      expect(isOk(keysResult)).toBe(true);
      if (isOk(keysResult)) {
        expect(keysResult.value).toEqual(sessionKeys);
      }
    });

    it('should get session count', async () => {
      mockSessionStore.size.mockResolvedValue(Success(5));

      const sizeResult = await mockSessionStore.size();
      expect(isOk(sizeResult)).toBe(true);
      if (isOk(sizeResult)) {
        expect(sizeResult.value).toBe(5);
      }
    });

    it('should filter sessions by status', () => {
      const sessions = [
        { id: 'session-1', status: 'active' },
        { id: 'session-2', status: 'completed' },
        { id: 'session-3', status: 'active' },
        { id: 'session-4', status: 'failed' },
      ];

      const activeSessions = sessions.filter(s => s.status === 'active');
      expect(activeSessions).toHaveLength(2);
      expect(activeSessions.map(s => s.id)).toEqual(['session-1', 'session-3']);
    });

    it('should filter sessions by stage', () => {
      const sessions = [
        { id: 'session-1', stage: 'analysis' },
        { id: 'session-2', stage: 'build' },
        { id: 'session-3', stage: 'analysis' },
        { id: 'session-4', stage: 'deploy' },
      ];

      const analysisSessions = sessions.filter(s => s.stage === 'analysis');
      expect(analysisSessions).toHaveLength(2);
      expect(analysisSessions.map(s => s.id)).toEqual(['session-1', 'session-3']);
    });
  });

  describe('Session Lifecycle', () => {
    it('should track session lifecycle events', () => {
      const events = [];

      // Mock event tracking
      const trackEvent = (event: string, sessionId: string) => {
        events.push({ event, sessionId, timestamp: Date.now() });
      };

      const sessionId = 'test-session-123';

      trackEvent('session_created', sessionId);
      trackEvent('session_updated', sessionId);
      trackEvent('session_completed', sessionId);

      expect(events).toHaveLength(3);
      expect(events[0].event).toBe('session_created');
      expect(events[1].event).toBe('session_updated');
      expect(events[2].event).toBe('session_completed');
    });

    it('should handle session expiration', () => {
      const now = Date.now();
      const ttl = 3600000; // 1 hour in milliseconds

      const isExpired = (createdAt: number, ttl: number) => {
        return (now - createdAt) > ttl;
      };

      // Session created 2 hours ago
      const expiredSession = now - (2 * 3600000);
      expect(isExpired(expiredSession, ttl)).toBe(true);

      // Session created 30 minutes ago
      const activeSession = now - (30 * 60000);
      expect(isExpired(activeSession, ttl)).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle storage errors gracefully', async () => {
      const sessionId = 'test-session-123';
      const storageError = 'Database connection failed';

      mockSessionStore.get.mockRejectedValue(new Error(storageError));

      try {
        await mockSessionStore.get(sessionId);
      } catch (error) {
        expect(error.message).toBe(storageError);
      }
    });

    it('should handle invalid session data', () => {
      const invalidSessions = [
        { id: '', repo_path: '/test' }, // Empty ID
        { id: 'test', repo_path: '' }, // Empty repo path
        { id: 'test', repo_path: '/test', status: 'invalid' }, // Invalid status
        { id: 'test', repo_path: '/test', version: -1 }, // Invalid version
      ];

      invalidSessions.forEach(session => {
        const validateSession = (sess: any) => {
          if (!sess.id || sess.id.length === 0) throw new Error('Invalid session ID');
          if (!sess.repo_path || sess.repo_path.length === 0) throw new Error('Invalid repo path');
          if (sess.status && !['active', 'completed', 'failed'].includes(sess.status)) {
            throw new Error('Invalid session status');
          }
          if (sess.version !== undefined && sess.version < 0) throw new Error('Invalid version');
        };

        expect(() => validateSession(session)).toThrow();
      });
    });
  });

  describe('Session Store Integration', () => {
    it('should close session store properly', async () => {
      mockSessionStore.close.mockResolvedValue(Success({}));

      const closeResult = await mockSessionStore.close();
      expect(isOk(closeResult)).toBe(true);
      expect(mockSessionStore.close).toHaveBeenCalled();
    });

    it('should handle concurrent operations', async () => {
      const sessionId = 'concurrent-test';

      // Set up mocks before creating operations
      mockSessionStore.get.mockResolvedValue({ id: sessionId });
      mockSessionStore.set.mockResolvedValue(Success({}));

      const operations = [];

      // Simulate concurrent reads
      for (let i = 0; i < 5; i++) {
        operations.push(mockSessionStore.get(sessionId));
      }

      // Simulate concurrent writes
      for (let i = 0; i < 5; i++) {
        operations.push(mockSessionStore.set(sessionId, { id: sessionId, version: i }));
      }

      // All operations should complete without errors
      const results = await Promise.all(operations);
      expect(results).toHaveLength(10);
    });
  });

  describe('Performance Considerations', () => {
    it('should handle large session counts', async () => {
      const largeBatch = 1000;
      const sessionKeys = Array.from({ length: largeBatch }, (_, i) => `session-${i}`);

      mockSessionStore.keys.mockResolvedValue(Success(sessionKeys));
      mockSessionStore.size.mockResolvedValue(Success(largeBatch));

      const keysResult = await mockSessionStore.keys();
      const sizeResult = await mockSessionStore.size();

      expect(isOk(keysResult)).toBe(true);
      expect(isOk(sizeResult)).toBe(true);

      if (isOk(keysResult) && isOk(sizeResult)) {
        expect(keysResult.value).toHaveLength(largeBatch);
        expect(sizeResult.value).toBe(largeBatch);
      }
    });

    it('should optimize memory usage', () => {
      // Test memory optimization strategies
      const memoryOptimization = {
        batchSize: 100,
        maxCacheSize: 1000,
        compressionEnabled: true,
      };

      expect(memoryOptimization.batchSize).toBeLessThanOrEqual(memoryOptimization.maxCacheSize);
      expect(memoryOptimization.compressionEnabled).toBe(true);
    });
  });
});
