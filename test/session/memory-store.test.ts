/**
 * Tests for in-memory session store
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { InMemorySessionStore } from '../../src/infrastructure/persistence/memory-store.js';
import { SessionService } from '../../src/service/session/manager.js';
import { SessionUtils } from '../../src/domain/session/utils.js';
import { WorkflowStep } from '../../src/domain/types/session.js';
import pino from 'pino';

describe('In-Memory Session Store', () => {
  let store: InMemorySessionStore;
  let service: SessionService;
  const logger = pino({ level: 'silent' }); // Silent for tests
  
  beforeEach(() => {
    store = new InMemorySessionStore(logger);
    service = new SessionService(store, logger);
  });
  
  afterEach(async () => {
    await service.shutdown();
  });
  
  describe('Basic Operations', () => {
    it('should create and retrieve a session', async () => {
      const session = await service.createSession('/test/repo', {
        labels: { test: 'true' },
      });
      
      expect(session.id).toMatch(/^ses_/);
      expect(session.repo_path).toBe('/test/repo');
      expect(session.status).toBe('active');
      
      const retrieved = await service.getSession(session.id);
      expect(retrieved.id).toBe(session.id);
      expect(retrieved.labels?.test).toBe('true');
    });
    
    it('should update session', async () => {
      const session = await service.createSession('/test/repo');
      
      const updated = await service.updateSession(session.id, {
        labels: { environment: 'test' },
        metadata: { updated: true },
      });
      
      expect(updated.labels?.environment).toBe('test');
      expect(updated.metadata?.updated).toBe(true);
      expect(updated.version).toBeGreaterThan(session.version);
    });
    
    it('should handle concurrent atomic updates', async () => {
      const session = await service.createSession('/test/repo');
      
      // Simulate concurrent updates
      const updates = await Promise.all([
        store.updateAtomic(session.id, s => ({
          ...s,
          metadata: { ...s.metadata, update1: true }
        })),
        store.updateAtomic(session.id, s => ({
          ...s,
          metadata: { ...s.metadata, update2: true }
        })),
        store.updateAtomic(session.id, s => ({
          ...s,
          metadata: { ...s.metadata, update3: true }
        })),
      ]);
      
      const final = await store.get(session.id);
      expect(final?.version).toBe(3);
      expect(final?.metadata).toHaveProperty('update1');
      expect(final?.metadata).toHaveProperty('update2');
      expect(final?.metadata).toHaveProperty('update3');
    });
    
    it('should prevent external mutations', async () => {
      const session = await service.createSession('/test/repo');
      const retrieved = await store.get(session.id);
      
      // Try to mutate retrieved session
      if (retrieved) {
        retrieved.labels = { modified: 'true' };
      }
      
      // Original should be unchanged
      const original = await store.get(session.id);
      expect(original?.labels).toBeUndefined();
    });
  });
  
  describe('Workflow State Management', () => {
    it('should update workflow state', async () => {
      const session = await service.createSession('/test/repo');
      
      const updated = await service.updateWorkflowState(session.id, {
        analysis_result: {
          language: 'java',
          framework: 'spring-boot',
          build_system: {
            type: 'maven',
            build_file: 'pom.xml',
          },
          has_tests: true,
        },
      });
      
      expect(updated.workflow_state.analysis_result?.language).toBe('java');
      expect(updated.stage).toBe('analysis');
      expect(updated.progress?.percentage).toBeGreaterThan(0);
    });
    
    it('should track workflow steps', async () => {
      const session = await service.createSession('/test/repo');
      
      // Set current step
      await service.setCurrentStep(session.id, WorkflowStep.ANALYZE);
      let current = await service.getSession(session.id);
      expect(current.workflow_state.current_step).toBe(WorkflowStep.ANALYZE);
      
      // Mark step as completed
      await service.markStepCompleted(session.id, WorkflowStep.ANALYZE);
      current = await service.getSession(session.id);
      expect(current.workflow_state.completed_steps).toContain(WorkflowStep.ANALYZE);
      expect(current.workflow_state.current_step).toBeNull();
    });
    
    it('should handle step errors', async () => {
      const session = await service.createSession('/test/repo');
      
      const errorMessage = 'Build failed: missing dependency';
      await service.addStepError(session.id, WorkflowStep.BUILD_IMAGE, errorMessage);
      
      const updated = await service.getSession(session.id);
      expect(updated.status).toBe('failed');
      expect(updated.workflow_state.errors[WorkflowStep.BUILD_IMAGE]).toBe(errorMessage);
    });
    
    it('should calculate progress correctly', async () => {
      const session = await service.createSession('/test/repo');
      
      // Complete some steps
      await service.markStepCompleted(session.id, WorkflowStep.ANALYZE);
      await service.markStepCompleted(session.id, WorkflowStep.GENERATE_DOCKERFILE);
      await service.markStepCompleted(session.id, WorkflowStep.BUILD_IMAGE);
      
      const updated = await service.getSession(session.id);
      expect(updated.progress?.current_step).toBe(3);
      expect(updated.progress?.total_steps).toBe(10); // Total workflow steps
      expect(updated.progress?.percentage).toBe(30);
    });
  });
  
  describe('Session Lifecycle', () => {
    it('should complete session', async () => {
      const session = await service.createSession('/test/repo');
      const completed = await service.completeSession(session.id);
      
      expect(completed.status).toBe('completed');
      expect(new Date(completed.expires_at!).getTime()).toBeGreaterThan(Date.now();
    });
    
    it('should fail session', async () => {
      const session = await service.createSession('/test/repo');
      const failed = await service.completeSession(session.id, false);
      
      expect(failed.status).toBe('failed');
    });
    
    it('should extend session expiration', async () => {
      const session = await service.createSession('/test/repo');
      const originalExpiry = new Date(session.expires_at!).getTime();
      
      const extended = await service.extendSession(session.id, 3600); // 1 hour
      const newExpiry = new Date(extended.expires_at!).getTime();
      
      expect(newExpiry).toBeGreaterThan(originalExpiry);
      expect(newExpiry - originalExpiry).toBeCloseTo(3600000, -3); // ~1 hour in ms
    });
    
    it('should auto-remove expired sessions', async () => {
      // Create expired session directly in store
      const expired = SessionUtils.createSession('/test/expired', {
        expires_at: new Date(Date.now() - 1000).toISOString(),
      });
      await store.create(expired);
      
      // Should return null for expired session
      const result = await store.get(expired.id);
      expect(result).toBeNull();
      
      // Should not be in store anymore
      expect(store.getSize()).toBe(0);
    });
    
    it('should clean up expired sessions', async () => {
      // Create expired session
      const expired = SessionUtils.createSession('/test/expired', {
        expires_at: new Date(Date.now() - 1000).toISOString(),
      });
      await store.create(expired);
      
      // Create active session
      const active = await service.createSession('/test/active');
      
      const deleted = await store.deleteExpired();
      expect(deleted).toBe(1);
      expect(store.getSize()).toBe(1);
      
      // Active should still exist
      const remaining = await store.get(active.id);
      expect(remaining).toBeTruthy();
    });
  });
  
  describe('Queries and Filters', () => {
    beforeEach(async () => {
      // Create test sessions
      await service.createSession('/test/repo1', {
        status: 'active',
        labels: { env: 'dev' },
      });
      await service.createSession('/test/repo2', {
        status: 'building',
        labels: { env: 'prod' },
      });
      await service.createSession('/test/repo3', {
        status: 'completed',
        labels: { env: 'dev' },
      });
    });
    
    it('should list sessions by status', async () => {
      const active = await store.getByStatus('active');
      expect(active.length).toBe(1);
      
      const building = await store.getByStatus('building');
      expect(building.length).toBe(1);
      
      const completed = await store.getByStatus('completed');
      expect(completed.length).toBe(1);
    });
    
    it('should filter sessions', async () => {
      const devSessions = await store.list({
        labels: { env: 'dev' },
      });
      expect(devSessions.length).toBe(2);
      
      const activeDev = await store.list({
        status: 'active',
        labels: { env: 'dev' },
      });
      expect(activeDev.length).toBe(1);
    });
    
    it('should get recently updated sessions', async () => {
      const recent = await store.getRecentlyUpdated(2);
      expect(recent.length).toBe(2);
      
      // Should be sorted by updated_at desc
      const timestamps = recent.map(s => new Date(s.updated_at).getTime();
      expect(timestamps[0]).toBeGreaterThanOrEqual(timestamps[1]);
    });
  });
  
  describe('Metrics', () => {
    it('should provide session metrics', async () => {
      await service.createSession('/test/repo1', { status: 'active' });
      await service.createSession('/test/repo2', { status: 'building' });
      await service.createSession('/test/repo3', { status: 'completed' });
      
      const metrics = await service.getSessionMetrics();
      
      expect(metrics.total).toBe(3);
      expect(metrics.active).toBe(1);
      expect(metrics.building).toBe(1);
      expect(metrics.completed).toBe(1);
    });
    
    it('should track active session count', async () => {
      await service.createSession('/test/repo1');
      await service.createSession('/test/repo2');
      
      const count = await store.getActiveCount();
      expect(count).toBe(2);
    });
  });
  
  describe('Store Features', () => {
    it('should export and import sessions', async () => {
      // Create sessions
      const session1 = await service.createSession('/test/repo1');
      const session2 = await service.createSession('/test/repo2');
      
      // Export
      const exported = store.exportSessions();
      expect(exported.length).toBe(2);
      
      // Clear and reimport
      store.clearAll();
      expect(store.getSize()).toBe(0);
      
      await store.importSessions(exported);
      expect(store.getSize()).toBe(2);
      
      // Verify sessions exist
      const retrieved1 = await store.get(session1.id);
      const retrieved2 = await store.get(session2.id);
      expect(retrieved1).toBeTruthy();
      expect(retrieved2).toBeTruthy();
    });
    
    it('should enforce max active sessions', async () => {
      // Create service with low limit
      const limitedService = new SessionService(
        store,
        logger,
        { maxActiveSessions: 2 }
      );
      
      await limitedService.createSession('/test/repo1');
      await limitedService.createSession('/test/repo2');
      
      // Should throw when exceeding limit
      await expect(
        limitedService.createSession('/test/repo3')
      ).rejects.toThrow(/Maximum active sessions/);
      
      await limitedService.shutdown();
    });
  });
});