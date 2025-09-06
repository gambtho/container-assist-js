/**
 * Session Service
 */

import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { Session, WorkflowState } from '../domain/types/index';
import { SessionStore } from '../infrastructure/session-store';
import type { SessionService as ISessionService } from '../application/services/interfaces';

export interface SessionConfig {
  ttl?: number; // Session TTL in seconds (default: 24 hours)
  maxSessions?: number; // Max concurrent sessions (default: 1000)
}

const DEFAULT_TTL = 86400; // 24 hours in seconds
const DEFAULT_MAX_SESSIONS = 1000;

export class SessionService implements ISessionService {
  private store: SessionStore;
  private logger: Logger;
  private ttl: number;

  constructor(config: SessionConfig = {}, logger: Logger) {
    this.logger = logger.child({ service: 'session' });
    this.ttl = config.ttl ?? DEFAULT_TTL;

    this.store = new SessionStore(this.logger, {
      defaultTtlMs: this.ttl * 1000,
      maxSessions: config.maxSessions ?? DEFAULT_MAX_SESSIONS,
    });
  }

  initialize(): void {
    this.logger.info('Session service initialized');
  }

  close(): void {
    this.store.close();
    this.logger.info('Session service closed');
  }

  // Core CRUD operations
  create(data: Partial<Session> = {}): Session {
    const id = data.id ?? randomUUID();
    const now = new Date().toISOString();
    const expiresAt = data.expires_at ?? new Date(Date.now() + this.ttl * 1000).toISOString();

    const session: Session = {
      id,
      version: 1,
      status: data.status ?? 'active',
      repo_path: data.repo_path ?? '',
      workflow_state: data.workflow_state ?? {
        completed_steps: [],
        errors: {},
        metadata: {},
        dockerfile_fix_history: [],
      },
      created_at: now,
      updated_at: now,
      expires_at: expiresAt,
      ...data,
    };

    this.store.set(id, session);
    this.logger.info({ sessionId: id }, 'Session created');
    return session;
  }

  get(sessionId: string): Session | null {
    return this.store.get(sessionId);
  }

  update(sessionId: string, data: Partial<Session>): void {
    const current = this.store.get(sessionId);
    if (!current) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const updated: Session = {
      ...current,
      ...data,
      updated_at: new Date().toISOString(),
    };

    this.store.set(sessionId, updated);
    this.logger.debug({ sessionId }, 'Session updated');
  }

  delete(sessionId: string): void {
    this.store.delete(sessionId);
    this.logger.info({ sessionId }, 'Session deleted');
  }

  updateAtomic(sessionId: string, updater: (session: Session) => Session): void {
    this.store.updateAtomic(sessionId, updater);
  }

  updateWorkflowState(id: string, state: Partial<WorkflowState>): Session {
    const updated = this.store.update(id, (session) => ({
      workflow_state: {
        ...session.workflow_state,
        ...state,
      },
      updated_at: new Date().toISOString(),
    }));

    if (!updated) {
      throw new Error(`Session ${id} not found`);
    }

    this.logger.debug({ sessionId: id }, 'Workflow state updated');
    return updated;
  }

  // Additional methods for compatibility with WorkflowOrchestrator
  getSession(id: string): Session {
    const session = this.get(id);
    if (!session) {
      throw new Error(`Session ${id} not found`);
    }
    return session;
  }

  updateSession(id: string, updates: Partial<Session>): Session {
    this.update(id, updates);
    return this.getSession(id);
  }

  setCurrentStep(id: string, step: string | null): Session {
    const session = this.getSession(id);
    const updatedState = {
      ...session.workflow_state,
      current_step: step,
    };
    return this.updateWorkflowState(id, updatedState);
  }

  markStepCompleted(id: string, step: string): Session {
    const session = this.getSession(id);
    const completedSteps = session.workflow_state?.completed_steps || [];
    if (!completedSteps.includes(step)) {
      completedSteps.push(step);
    }
    const updatedState = {
      ...session.workflow_state,
      completed_steps: completedSteps,
    };
    return this.updateWorkflowState(id, updatedState);
  }

  addStepError(id: string, step: string, error: Error | string): Session {
    const session = this.getSession(id);
    const errors = session.workflow_state?.errors || {};
    errors[step] = error instanceof Error ? error.message : error;
    const updatedState = {
      ...session.workflow_state,
      errors,
    };
    return this.updateWorkflowState(id, updatedState);
  }

  // Utility methods
  list(): Session[] {
    return this.store.list();
  }

  cleanup(): number {
    const cutoff = Date.now() - this.ttl * 1000;
    const cutoffDate = new Date(cutoff).toISOString();
    const sessions = this.store.list({});
    let deleted = 0;

    for (const session of sessions) {
      if (session.updated_at < cutoffDate) {
        try {
          this.store.delete(session.id);
          deleted++;
        } catch (error) {
          this.logger.warn(
            { sessionId: session.id, error },
            'Failed to delete session during cleanup',
          );
        }
      }
    }

    if (deleted > 0) {
      this.logger.info({ count: deleted }, 'Cleaned up expired sessions');
    }

    return deleted;
  }

  getActiveCount(): number {
    return this.store.list({ status: 'active' }).length;
  }
}

// Factory function for easier setup
export function createSessionService(config: SessionConfig = {}, logger: Logger): SessionService {
  const service = new SessionService(config, logger);
  service.initialize();
  return service;
}
