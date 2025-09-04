/**
 * Session Store Infrastructure Tests
 * Priority 1: Core Infrastructure - Session storage and management
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SessionStore } from '../../../src/infrastructure/session-store';
import { createMockLogger } from '../../utils/mock-factories';
import type { Logger } from 'pino';
import type { Session } from '../../../src/domain/types/session.js';

describe('SessionStore', () => {
  let store: SessionStore;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    store = new SessionStore(mockLogger, {
      cleanupIntervalMs: 1000, // 1 second for testing
      maxSessions: 5,
      defaultTtlMs: 60000, // 1 minute
    });
  });

  afterEach(() => {
    store.close();
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with default options', () => {
      const defaultStore = new SessionStore(mockLogger);
      expect(defaultStore).toBeDefined();
      defaultStore.close();
    });

    it('should initialize with custom options', () => {
      const customStore = new SessionStore(mockLogger, {
        maxSessions: 10,
        defaultTtlMs: 120000,
        cleanupIntervalMs: 2000,
      });
      
      expect(customStore).toBeDefined();
      customStore.close();
    });

    it('should set cleanup timer that does not keep process alive', () => {
      const unrefSpy = jest.fn();
      const setIntervalSpy = jest.spyOn(global, 'setInterval').mockReturnValue({
        unref: unrefSpy,
      } as any);

      const testStore = new SessionStore(mockLogger, { cleanupIntervalMs: 1000 });
      
      expect(setIntervalSpy).toHaveBeenCalled();
      expect(unrefSpy).toHaveBeenCalled();
      
      testStore.close();
      setIntervalSpy.mockRestore();
    });
  });

  describe('Basic Session Operations', () => {
    it('should create and retrieve a session', () => {
      const sessionData = {
        repo_path: '/test/repo',
        status: 'active' as const,
      };

      store.set('test-session', sessionData);
      const retrieved = store.get('test-session');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('test-session');
      expect(retrieved?.repo_path).toBe('/test/repo');
      expect(retrieved?.status).toBe('active');
    });

    it('should return null for non-existent session', () => {
      const retrieved = store.get('nonexistent');
      expect(retrieved).toBeNull();
    });

    it('should auto-generate required fields', () => {
      store.set('test-session', { repo_path: '/test/repo' });
      const retrieved = store.get('test-session');

      expect(retrieved?.created_at).toBeDefined();
      expect(retrieved?.updated_at).toBeDefined();
      expect(retrieved?.expires_at).toBeDefined();
      expect(retrieved?.status).toBe('active');
      expect(retrieved?.version).toBe(1);
    });

    it('should increment version on updates', () => {
      store.set('test-session', { repo_path: '/test/repo' });
      let session = store.get('test-session');
      expect(session?.version).toBe(1);

      store.set('test-session', { repo_path: '/updated/repo' });
      session = store.get('test-session');
      expect(session?.version).toBe(2);
    });

    it('should validate session schema', () => {
      // This would throw if validation fails
      expect(() => {
        store.set('valid-session', {
          repo_path: '/test/repo',
          status: 'active',
        });
      }).not.toThrow();

      const session = store.get('valid-session');
      expect(session).toBeDefined();
    });
  });

  describe('Session Updates', () => {
    beforeEach(() => {
      store.set('update-test', {
        repo_path: '/initial/repo',
        status: 'active',
        workflow_state: {
          completed_steps: ['analyze'],
          errors: {},
          metadata: { language: 'nodejs' },
          dockerfile_fix_history: [],
        },
      });
    });

    it('should update existing session', () => {
      const updated = store.update('update-test', (session) => ({
        repo_path: '/updated/repo',
        workflow_state: {
          ...session.workflow_state,
          completed_steps: ['analyze', 'generate'],
        },
      }));

      expect(updated?.repo_path).toBe('/updated/repo');
      expect(updated?.workflow_state.completed_steps).toContain('generate');
    });

    it('should return null when updating non-existent session', () => {
      const updated = store.update('nonexistent', () => ({ repo_path: '/new/repo' }));
      expect(updated).toBeNull();
    });

    it('should perform atomic updates', () => {
      store.updateAtomic('update-test', (session) => ({
        ...session,
        status: 'completed',
        repo_path: '/atomic/update',
      }));

      const session = store.get('update-test');
      expect(session?.status).toBe('completed');
      expect(session?.repo_path).toBe('/atomic/update');
    });

    it('should throw when atomic update on non-existent session', () => {
      expect(() => {
        store.updateAtomic('nonexistent', (session) => session);
      }).toThrow('Session nonexistent not found');
    });
  });

  describe('Session Deletion', () => {
    beforeEach(() => {
      store.set('delete-test', { repo_path: '/test/repo' });
    });

    it('should delete existing session', () => {
      const deleted = store.delete('delete-test');
      expect(deleted).toBe(true);
      
      const retrieved = store.get('delete-test');
      expect(retrieved).toBeNull();
    });

    it('should return false when deleting non-existent session', () => {
      const deleted = store.delete('nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('Session Listing and Filtering', () => {
    beforeEach(() => {
      // Create test sessions
      store.set('active-1', { repo_path: '/repo/1', status: 'active' });
      store.set('active-2', { repo_path: '/repo/2', status: 'active' });
      store.set('completed-1', { repo_path: '/repo/3', status: 'completed' });
      store.set('error-1', { repo_path: '/repo/4', status: 'failed' });
    });

    it('should list all sessions', () => {
      const sessions = store.list();
      expect(sessions).toHaveLength(4);
    });

    it('should filter by status', () => {
      const activeSessions = store.list({ status: 'active' });
      expect(activeSessions).toHaveLength(2);
      expect(activeSessions.every(s => s.status === 'active')).toBe(true);

      const completedSessions = store.list({ status: 'completed' });
      expect(completedSessions).toHaveLength(1);
    });

    it('should apply limit', () => {
      const limited = store.list({ limit: 2 });
      expect(limited).toHaveLength(2);
    });

    it('should filter by creation date', () => {
      const futureDate = new Date(Date.now() + 10000);
      const recentSessions = store.list({ createdAfter: futureDate });
      expect(recentSessions).toHaveLength(0);

      const pastDate = new Date(Date.now() - 10000);
      const allRecentSessions = store.list({ createdAfter: pastDate });
      expect(allRecentSessions).toHaveLength(4);
    });

    it('should sort by updated_at desc', () => {
      // Update one session to change its updated_at
      store.set('active-1', { repo_path: '/repo/1-updated' });
      
      const sessions = store.list();
      expect(sessions[0].id).toBe('active-1'); // Most recently updated
    });

    it('should combine filters', () => {
      const filtered = store.list({ 
        status: 'active', 
        limit: 1 
      });
      
      expect(filtered).toHaveLength(1);
      expect(filtered[0].status).toBe('active');
    });
  });

  describe('Session Expiration', () => {
    it('should remove expired sessions on get', () => {
      // Create session with immediate expiration
      const expiredTime = new Date(Date.now() - 1000).toISOString();
      store.set('expired-session', {
        repo_path: '/test/repo',
        expires_at: expiredTime,
      });

      const retrieved = store.get('expired-session');
      expect(retrieved).toBeNull();
    });

    it('should filter out expired sessions from list', () => {
      // Create one normal and one expired session
      store.set('normal-session', { repo_path: '/normal/repo' });
      
      const expiredTime = new Date(Date.now() - 1000).toISOString();
      store.set('expired-session', {
        repo_path: '/expired/repo',
        expires_at: expiredTime,
      });

      const sessions = store.list();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('normal-session');
    });

    it('should handle sessions without expiration time', () => {
      store.set('no-expiry', {
        repo_path: '/test/repo',
        expires_at: undefined as any,
      });

      const retrieved = store.get('no-expiry');
      expect(retrieved).toBeDefined();
    });
  });

  describe('Session Limits and Eviction', () => {
    it('should enforce session limit by evicting oldest', () => {
      // Fill to capacity
      for (let i = 0; i < 5; i++) {
        store.set(`session-${i}`, { repo_path: `/repo/${i}` });
      }

      // Add one more to trigger eviction
      store.set('session-overflow', { repo_path: '/overflow/repo' });

      const sessions = store.list();
      expect(sessions).toHaveLength(5);
      
      // First session should be evicted
      const evictedSession = store.get('session-0');
      expect(evictedSession).toBeNull();

      // Overflow session should exist
      const overflowSession = store.get('session-overflow');
      expect(overflowSession).toBeDefined();
    });

    it('should not evict when updating existing session', () => {
      // Fill to capacity
      for (let i = 0; i < 5; i++) {
        store.set(`session-${i}`, { repo_path: `/repo/${i}` });
      }

      // Update existing session (should not trigger eviction)
      store.set('session-0', { repo_path: '/updated/repo' });

      const sessions = store.list();
      expect(sessions).toHaveLength(5);

      const updatedSession = store.get('session-0');
      expect(updatedSession?.repo_path).toBe('/updated/repo');
    });
  });

  describe('Session Statistics', () => {
    beforeEach(() => {
      store.set('active-1', { status: 'active', repo_path: '/repo/1' });
      store.set('active-2', { status: 'active', repo_path: '/repo/2' });
      store.set('completed-1', { status: 'completed', repo_path: '/repo/3' });
    });

    it('should return correct statistics', () => {
      const stats = store.getStats();
      
      expect(stats.totalSessions).toBe(3);
      expect(stats.activeSessions).toBe(2);
      expect(stats.maxSessions).toBe(5);
    });

    it('should count active sessions correctly', () => {
      const activeCount = store.getActiveCount();
      expect(activeCount).toBe(2);
    });
  });

  describe('Import/Export Operations', () => {
    const testSessions: Session[] = [
      {
        id: 'export-test-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60000).toISOString(),
        status: 'active',
        repo_path: '/export/repo/1',
        workflow_state: {
          completed_steps: [],
          errors: {},
          metadata: {},
          dockerfile_fix_history: [],
        },
        version: 1,
      },
      {
        id: 'export-test-2',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60000).toISOString(),
        status: 'completed',
        repo_path: '/export/repo/2',
        workflow_state: {
          completed_steps: ['analyze', 'generate'],
          errors: {},
          metadata: { language: 'python' },
          dockerfile_fix_history: [],
        },
        version: 3,
      },
    ];

    it('should export sessions', () => {
      store.set('export-1', { repo_path: '/export/1' });
      store.set('export-2', { repo_path: '/export/2' });

      const exported = store.exportSessions();
      expect(exported).toHaveLength(2);
      expect(exported.some(s => s.id === 'export-1')).toBe(true);
      expect(exported.some(s => s.id === 'export-2')).toBe(true);
    });

    it('should import sessions', () => {
      store.importSessions(testSessions);

      const session1 = store.get('export-test-1');
      const session2 = store.get('export-test-2');

      expect(session1).toBeDefined();
      expect(session1?.repo_path).toBe('/export/repo/1');
      expect(session2).toBeDefined();
      expect(session2?.workflow_state.completed_steps).toContain('analyze');
    });

    it('should not import expired sessions', () => {
      const expiredSession: Session = {
        ...testSessions[0],
        id: 'expired-import',
        expires_at: new Date(Date.now() - 1000).toISOString(),
      };

      store.importSessions([expiredSession]);

      const retrieved = store.get('expired-import');
      expect(retrieved).toBeNull();
    });
  });

  describe('Cleanup Operations', () => {
    it('should clear all sessions', () => {
      store.set('clear-test-1', { repo_path: '/test/1' });
      store.set('clear-test-2', { repo_path: '/test/2' });

      store.clear();

      const sessions = store.list();
      expect(sessions).toHaveLength(0);
    });

    it('should close store and cleanup resources', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      store.close();

      expect(clearIntervalSpy).toHaveBeenCalled();
      
      const sessions = store.list();
      expect(sessions).toHaveLength(0);
      
      clearIntervalSpy.mockRestore();
    });

    it('should handle cleanup timer gracefully', async () => {
      // Create sessions with different expiration times
      const futureTime = new Date(Date.now() + 60000).toISOString();
      const pastTime = new Date(Date.now() - 1000).toISOString();

      store.set('future-session', { 
        repo_path: '/future/repo',
        expires_at: futureTime,
      });
      store.set('expired-session', { 
        repo_path: '/expired/repo',
        expires_at: pastTime,
      });

      // Manually trigger cleanup to test it
      store['cleanExpired']();

      const sessions = store.list();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].id).toBe('future-session');
    });

    it('should handle cleanup errors gracefully', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Force an error during cleanup by mocking sessions map
      const originalSessions = store['sessions'];
      
      try {
        const mockSessions = {
          [Symbol.iterator]: () => {
            throw new Error('Cleanup error');
          },
        };
        store['sessions'] = mockSessions as any;

        // This should not throw, but log a warning
        expect(() => {
          store['cleanExpired']();
        }).not.toThrow();
      } finally {
        // Always restore original sessions
        store['sessions'] = originalSessions;
        consoleWarnSpy.mockRestore();
      }
    });
  });

  describe('Session Workflow State Management', () => {
    it('should handle complex workflow state updates', () => {
      store.set('workflow-test', {
        repo_path: '/workflow/repo',
        workflow_state: {
          completed_steps: ['analyze'],
          errors: {},
          metadata: { language: 'nodejs', framework: 'express' },
          dockerfile_fix_history: [],
        },
      });

      const updated = store.update('workflow-test', (session) => ({
        workflow_state: {
          ...session.workflow_state,
          completed_steps: [...session.workflow_state.completed_steps, 'generate'],
          metadata: {
            ...session.workflow_state.metadata,
            containerPort: 3000,
          },
          dockerfile_fix_history: [
            {
              timestamp: new Date().toISOString(),
              error: 'Missing EXPOSE directive',
              fix: {
                root_cause_analysis: 'Missing EXPOSE directive for port 3000',
                fixed_dockerfile: 'EXPOSE 3000',
                changes_made: [{
                  line_changed: 'Line 5',
                  old_content: '',
                  new_content: 'EXPOSE 3000',
                  reasoning: 'Added EXPOSE directive to allow external access to port 3000',
                }],
                security_improvements: [],
                performance_optimizations: [],
                alternative_approaches: [],
                testing_recommendations: [],
                prevention_tips: ['Always expose the port your application uses'],
              },
            },
          ],
        },
      }));

      expect(updated?.workflow_state.completed_steps).toContain('generate');
      expect(updated?.workflow_state.metadata.containerPort).toBe(3000);
      expect(updated?.workflow_state.dockerfile_fix_history).toHaveLength(1);
    });

    it('should maintain workflow state structure', () => {
      store.set('structure-test', { repo_path: '/test/repo' });
      
      const session = store.get('structure-test');
      
      expect(session?.workflow_state).toBeDefined();
      expect(session?.workflow_state.completed_steps).toEqual([]);
      expect(session?.workflow_state.errors).toEqual({});
      expect(session?.workflow_state.metadata).toEqual({});
      expect(session?.workflow_state.dockerfile_fix_history).toEqual([]);
    });
  });
});