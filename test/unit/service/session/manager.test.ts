import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SessionService } from '../../../../../src/application/session/manager.js';
import { InMemorySessionStore } from '../../../../../src/infrastructure/core/persistence/memory-store.js';
import { createMockLogger } from '../../../utils/test-helpers.js';
import { createMockSession, createMockWorkflowState } from '../../../../utils/mock-factories.js';
import type { Session, WorkflowState } from '../../../../../src/domain/types/session.js';
import { nanoid } from 'nanoid';

describe('SessionService', () => {
  let sessionService: SessionService;
  let memoryStore: InMemorySessionStore;
  let mockLogger = createMockLogger();
  
  beforeEach(() => {
    memoryStore = new InMemorySessionStore(mockLogger);
    mockLogger = createMockLogger();
    sessionService = new SessionService(memoryStore, mockLogger, {
      defaultTTL: 3600, // 1 hour for tests
      maxActiveSessions: 10
    });
  });
  
  afterEach(async () => {
    await sessionService.shutdown();
  });
  
  describe('session creation', () => {
    it('should create a new session', async () => {
      const session = await sessionService.createSession('/test/repo', {
        metadata: { test: true }
      });
      
      expect(session.id).toBeDefined();
      expect(session.repo_path).toBe('/test/repo');
      expect(session.status).toBe('active');
      expect(session.metadata?.test).toBe(true);
      expect(session.created_at).toBeDefined();
      expect(session.expires_at).toBeDefined();
    });
    
    it('should create session with simplified interface', async () => {
      const session = await sessionService.create({
        projectName: 'test-project',
        metadata: { version: '1.0.0' }
      });
      
      expect(session.id).toBeDefined();
      expect(session.status).toBe('active');
      expect(session.metadata).toEqual({
        projectName: 'test-project',
        version: '1.0.0'
      });
    });
    
    it('should set custom expiration time', async () => {
      const customExpiry = new Date(Date.now() + 7200 * 1000).toISOString(); // 2 hours
      const session = await sessionService.createSession('/test/repo', {
        expires_at: customExpiry
      });
      
      expect(session.expires_at).toBe(customExpiry);
    });
    
    it('should enforce maximum active session limit', async () => {
      // Create sessions up to the limit
      for (let i = 0; i < 10; i++) {
        await sessionService.createSession(`/test/repo${i}`);
      }
      
      // The 11th session should fail
      await expect(
        sessionService.createSession('/test/repo11')
      ).rejects.toThrow('Maximum active sessions (10) reached');
    });
    
    it('should emit session:created event', async () => {
      const eventSpy = jest.fn();
      sessionService.on('session:created', eventSpy);
      
      const session = await sessionService.createSession('/test/repo');
      
      expect(eventSpy).toHaveBeenCalledWith(session);
    });
  });
  
  describe('session retrieval', () => {
    it('should get session by ID', async () => {
      const created = await sessionService.createSession('/test/repo');
      const retrieved = await sessionService.getSession(created.id);
      
      expect(retrieved).toEqual(created);
    });
    
    it('should get session with simplified interface', async () => {
      const created = await sessionService.createSession('/test/repo');
      const retrieved = await sessionService.get(created.id);
      
      expect(retrieved).toEqual(created);
    });
    
    it('should return null for non-existent session with simplified interface', async () => {
      const result = await sessionService.get('non-existent-id');
      expect(result).toBeNull();
    });
    
    it('should throw error for non-existent session with full interface', async () => {
      await expect(
        sessionService.getSession('non-existent-id')
      ).rejects.toThrow('Session non-existent-id not found');
    });
  });
  
  describe('session updates', () => {
    let session: Session;
    
    beforeEach(async () => {
      session = await sessionService.createSession('/test/repo');
    });
    
    it('should update session properties', async () => {
      const updated = await sessionService.updateSession(session.id, {
        status: 'completed',
        stage: 'deployment'
      });
      
      expect(updated.status).toBe('completed');
      expect(updated.stage).toBe('deployment');
      expect(updated.version).toBeGreaterThan(session.version);
      expect(updated.updated_at).not.toBe(session.updated_at);
    });
    
    it('should preserve immutable properties', async () => {
      const updated = await sessionService.updateSession(session.id, {
        id: 'different-id', // Should be ignored
        created_at: '2020-01-01T00:00:00.000Z', // Should be ignored
        version: 999 // Should be managed by store
      } as any);
      
      expect(updated.id).toBe(session.id);
      expect(updated.created_at).toBe(session.created_at);
      expect(updated.version).not.toBe(999);
    });
    
    it('should emit session:updated event', async () => {
      const eventSpy = jest.fn();
      sessionService.on('session:updated', eventSpy);
      
      const updated = await sessionService.updateSession(session.id, {
        status: 'completed'
      });
      
      expect(eventSpy).toHaveBeenCalledWith(updated);
    });
    
    it('should update atomically', async () => {
      await sessionService.updateAtomic(session.id, (current) => ({
        ...current,
        metadata: {
          ...current.metadata,
          updatedCount: (current.metadata?.updatedCount || 0) + 1
        }
      }));
      
      const updated = await sessionService.getSession(session.id);
      expect(updated.metadata?.updatedCount).toBe(1);
    });
  });
  
  describe('workflow state management', () => {
    let session: Session;
    
    beforeEach(async () => {
      session = await sessionService.createSession('/test/repo');
    });
    
    it('should update workflow state', async () => {
      const stateUpdate: Partial<WorkflowState> = {
        current_step: 'analyze_repository',
        analysis_result: {
          language: 'javascript',
          framework: 'express'
        } as any
      };
      
      const updated = await sessionService.updateWorkflowState(session.id, stateUpdate);
      
      expect(updated.workflow_state?.current_step).toBe('analyze_repository');
      expect(updated.workflow_state?.analysis_result?.language).toBe('javascript');
    });
    
    it('should merge workflow state updates', async () => {
      // First update
      await sessionService.updateWorkflowState(session.id, {
        current_step: 'analyze_repository',
        completed_steps: ['analyze_repository']
      });
      
      // Second update
      const updated = await sessionService.updateWorkflowState(session.id, {
        current_step: 'generate_dockerfile',
        dockerfile_result: {
          content: 'FROM node:18',
          path: './Dockerfile'
        } as any
      });
      
      expect(updated.workflow_state?.current_step).toBe('generate_dockerfile');
      expect(updated.workflow_state?.completed_steps).toContain('analyze_repository');
      expect(updated.workflow_state?.dockerfile_result?.content).toBe('FROM node:18');
    });
    
    it('should emit workflow:updated event', async () => {
      const eventSpy = jest.fn();
      sessionService.on('workflow:updated', eventSpy);
      
      const stateUpdate = { current_step: 'build_image' };
      await sessionService.updateWorkflowState(session.id, stateUpdate);
      
      expect(eventSpy).toHaveBeenCalledWith({
        session: expect.any(Object),
        update: stateUpdate
      });
    });
    
    it('should mark step as completed', async () => {
      const updated = await sessionService.markStepCompleted(session.id, 'analyze_repository');
      
      expect(updated.workflow_state?.completed_steps).toContain('analyze_repository');
    });
    
    it('should set current step', async () => {
      const updated = await sessionService.setCurrentStep(session.id, 'build_image');
      
      expect(updated.workflow_state?.current_step).toBe('build_image');
    });
    
    it('should clear current step', async () => {
      await sessionService.setCurrentStep(session.id, 'build_image');
      const updated = await sessionService.setCurrentStep(session.id, null);
      
      expect(updated.workflow_state?.current_step).toBeNull();
    });
    
    it('should add step error', async () => {
      const error = new Error('Build failed');
      const updated = await sessionService.addStepError(session.id, 'build_image', error);
      
      expect(updated.workflow_state?.errors?.build_image).toBeDefined();
    });
    
    it('should add step error from string', async () => {
      const updated = await sessionService.addStepError(session.id, 'deploy', 'Deployment timeout');
      
      expect(updated.workflow_state?.errors?.deploy).toBe('Deployment timeout');
    });
  });
  
  describe('session completion', () => {
    let session: Session;
    
    beforeEach(async () => {
      session = await sessionService.createSession('/test/repo');
    });
    
    it('should complete session successfully', async () => {
      const completed = await sessionService.completeSession(session.id, true);
      
      expect(completed.status).toBe('completed');
      expect(new Date(completed.expires_at!).getTime()).toBeGreaterThan(Date.now());
    });
    
    it('should complete session with failure', async () => {
      const failed = await sessionService.completeSession(session.id, false);
      
      expect(failed.status).toBe('failed');
    });
    
    it('should default to successful completion', async () => {
      const completed = await sessionService.completeSession(session.id);
      
      expect(completed.status).toBe('completed');
    });
  });
  
  describe('session extension', () => {
    let session: Session;
    
    beforeEach(async () => {
      session = await sessionService.createSession('/test/repo');
    });
    
    it('should extend session expiration', async () => {
      const originalExpiry = new Date(session.expires_at!).getTime();
      const extended = await sessionService.extendSession(session.id, 3600); // 1 hour
      
      const newExpiry = new Date(extended.expires_at!).getTime();
      expect(newExpiry - originalExpiry).toBe(3600 * 1000);
    });
  });
  
  describe('session deletion', () => {
    it('should delete session', async () => {
      const session = await sessionService.createSession('/test/repo');
      
      await sessionService.deleteSession(session.id);
      
      const retrieved = await sessionService.get(session.id);
      expect(retrieved).toBeNull();
    });
    
    it('should emit session:deleted event', async () => {
      const eventSpy = jest.fn();
      sessionService.on('session:deleted', eventSpy);
      
      const session = await sessionService.createSession('/test/repo');
      await sessionService.deleteSession(session.id);
      
      expect(eventSpy).toHaveBeenCalledWith(session.id);
    });
  });
  
  describe('session listing and filtering', () => {
    beforeEach(async () => {
      // Create sessions with different statuses
      await sessionService.createSession('/test/repo1', { status: 'active' });
      await sessionService.createSession('/test/repo2', { status: 'completed' });
      await sessionService.createSession('/test/repo3', { status: 'failed' });
    });
    
    it('should list all sessions', async () => {
      const sessions = await sessionService.listSessions();
      expect(sessions).toHaveLength(3);
    });
    
    it('should list active sessions only', async () => {
      const activeSessions = await sessionService.getActiveSessions();
      expect(activeSessions).toHaveLength(1);
      expect(activeSessions[0].status).toBe('active');
    });
    
    it('should get active session count', async () => {
      const count = await sessionService.getActiveCount();
      expect(count).toBe(1);
    });
  });
  
  describe('session metrics', () => {
    beforeEach(async () => {
      // Create sessions with various statuses
      await sessionService.createSession('/test/repo1', { status: 'active' });
      await sessionService.createSession('/test/repo2', { status: 'active' });
      await sessionService.createSession('/test/repo3', { status: 'completed' });
      await sessionService.createSession('/test/repo4', { status: 'failed' });
      await sessionService.createSession('/test/repo5', { status: 'pending' });
    });
    
    it('should calculate correct metrics', async () => {
      const metrics = await sessionService.getSessionMetrics();
      
      expect(metrics.total).toBe(5);
      expect(metrics.active).toBe(2);
      expect(metrics.completed).toBe(1);
      expect(metrics.failed).toBe(1);
      expect(metrics.pending).toBe(1);
      expect(metrics.expired).toBe(0);
      expect(metrics.analyzing).toBe(0);
      expect(metrics.building).toBe(0);
      expect(metrics.deploying).toBe(0);
    });
  });
  
  describe('cleanup operations', () => {
    it('should clean up expired sessions', async () => {
      // Create an expired session
      const expiredSession = await sessionService.createSession('/test/repo', {
        expires_at: new Date(Date.now() - 1000).toISOString() // Expired 1 second ago
      });
      
      // Create a valid session
      await sessionService.createSession('/test/repo2');
      
      const deletedCount = await sessionService.cleanupExpired();
      
      expect(deletedCount).toBe(1);
      
      const sessions = await sessionService.listSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].repo_path).toBe('/test/repo2');
    });
    
    it('should emit cleanup event', async () => {
      const eventSpy = jest.fn();
      sessionService.on('cleanup', eventSpy);
      
      // Create expired session
      await sessionService.createSession('/test/repo', {
        expires_at: new Date(Date.now() - 1000).toISOString()
      });
      
      await sessionService.cleanupExpired();
      
      expect(eventSpy).toHaveBeenCalledWith({ deletedCount: 1 });
    });
  });
  
  describe('service configuration', () => {
    it('should use default configuration values', () => {
      const service = new SessionService(memoryStore, mockLogger);
      expect(service).toBeDefined();
    });
    
    it('should use custom configuration', () => {
      const config = {
        defaultTTL: 7200,
        maxActiveSessions: 500,
        persistenceInterval: 120
      };
      
      const service = new SessionService(memoryStore, mockLogger, config);
      expect(service).toBeDefined();
    });
  });
  
  describe('error handling', () => {
    it('should handle store errors gracefully', async () => {
      // Mock store to throw error
      const errorStore = {
        ...memoryStore,
        get: jest.fn().mockRejectedValue(new Error('Store error'))
      } as any;
      
      const service = new SessionService(errorStore, mockLogger);
      
      const result = await service.get('any-id');
      expect(result).toBeNull();
    });
    
    it('should handle missing session in update operations', async () => {
      await expect(
        sessionService.updateSession('non-existent-id', { status: 'completed' })
      ).rejects.toThrow();
    });
    
    it('should handle missing session in workflow updates', async () => {
      await expect(
        sessionService.updateWorkflowState('non-existent-id', { current_step: 'test' })
      ).rejects.toThrow();
    });
  });
  
  describe('service lifecycle', () => {
    it('should shutdown gracefully', async () => {
      const service = new SessionService(memoryStore, mockLogger);
      
      await expect(service.shutdown()).resolves.not.toThrow();
    });
    
    it('should handle shutdown errors', async () => {
      const errorStore = {
        ...memoryStore,
        close: jest.fn().mockRejectedValue(new Error('Close error'))
      } as any;
      
      const service = new SessionService(errorStore, mockLogger);
      
      // Should not throw even if store close fails
      await expect(service.shutdown()).resolves.not.toThrow();
    });
  });
});