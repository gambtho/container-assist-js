/**
 * Session Service
 */

import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { Session, WorkflowState } from '../domain/types/index';
import type { SessionFilter } from '../domain/types/session-store';
import { SessionStore } from '../infrastructure/session-store';
import type { SessionService as ISessionService } from '../application/services/interfaces';

export interface SessionConfig {
  storeType?: 'memory' | 'file';
  storePath?: string;
  ttl?: number; // Session TTL in seconds
}

const DEFAULT_TTL = 86400; // 24 hours

/**
 * Create a session service instance
 */
export async function createSessionService(
  config: SessionConfig,
  logger: Logger,
): Promise<SessionService> {
  const service = new SessionService(config, logger);
  await service.initialize();
  return service;
}

export class SessionService implements ISessionService {
  private store: SessionStore;
  private logger: Logger;
  private ttl: number;

  constructor(config: SessionConfig, logger: Logger) {
    this.logger = logger.child({ service: 'session' });
    this.ttl = config.ttl ?? DEFAULT_TTL;

    this.store = new SessionStore(this.logger, {
      defaultTtlMs: this.ttl * 1000,
      maxSessions: 1000,
    });
  }

  async initialize(): Promise<void> {
    // SessionStore doesn't have initialize method - it's ready to use
    await Promise.resolve(); // Satisfy async requirement
    this.logger.info('Session service initialized');
  }

  async create(data: Partial<Session>): Promise<Session> {
    const id = data.id ?? randomUUID();
    const now = new Date().toISOString();
    const session: Session = {
      id,
      version: data.version ?? 1,
      status: data.status ?? 'pending',
      repo_path: data.repo_path ?? '',
      workflow_state: data.workflow_state ?? {
        completed_steps: [],
        errors: {},
        metadata: {},
        dockerfile_fix_history: [],
      },
      created_at: now,
      updated_at: now,
      ...data,
    };

    this.store.set(id, session);
    this.logger.info({ sessionId: id }, 'Session created');
    await Promise.resolve(); // Make method truly async
    return session;
  }

  async get(id: string): Promise<Session | null> {
    await Promise.resolve(); // Make method truly async
    const session = this.store.get(id);
    return session;
  }

  async update(id: string, updates: Partial<Session>): Promise<void> {
    const currentSession = this.store.get(id);
    if (!currentSession) {
      throw new Error('Session not found');
    }

    const updated: Session = {
      ...currentSession,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    this.store.set(id, updated);
    this.logger.info({ sessionId: id }, 'Session updated');
    await Promise.resolve(); // Make method truly async
  }

  updateWorkflowState(id: string, state: Partial<WorkflowState>): Session {
    const updatedSession = this.store.update(id, (session) => ({
      workflow_state: {
        ...session.workflow_state,
        ...state,
      },
      updated_at: new Date().toISOString(),
    }));

    if (!updatedSession) {
      throw new Error('Session not found');
    }

    this.logger.info({ sessionId: id }, 'Workflow state updated');
    return updatedSession;
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
    this.logger.info({ sessionId: id }, 'Session deleted');
    await Promise.resolve(); // Make method truly async
  }

  list(filter?: SessionFilter): Session[] {
    const sessions = this.store.list(filter ?? {});
    return sessions;
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

    this.logger.info({ deleted }, 'Session cleanup completed');
    return deleted;
  }

  // Additional methods needed by resource providers
  async updateAtomic(id: string, updater: (session: Session) => Session): Promise<void> {
    this.store.updateAtomic(id, updater);
    await Promise.resolve(); // Make method truly async
  }

  query(params: SessionFilter): Session[] {
    return this.list(params);
  }

  close(): void {
    this.store.close();
    this.logger.info('Session service closed');
  }
}

// Export a singleton getter for convenience
let _sessionService: SessionService | undefined;

export async function getSessionService(
  config: SessionConfig,
  logger: Logger,
): Promise<SessionService> {
  if (!_sessionService) {
    _sessionService = await createSessionService(config, logger);
  }
  return _sessionService;
}
